import { getConfig, getWalletsClient } from "./client.js";
import type { Chain, PayX402Result } from "./types.js";
import { getExplorerLink } from "./create-wallet.js";

// ---------------------------------------------------------------------------
// x402 protocol shapes (subset we actually need)
// ---------------------------------------------------------------------------

interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount?: string;
  maxAmountRequired?: string; // SniperX and some x402 servers use this instead of amount
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource?: { url: string; description?: string; mimeType?: string };
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Chain / network mapping
// ---------------------------------------------------------------------------

// Maps x402 network identifiers (CAIP-2 or v1 shorthand) to the chain name
// that the Crossmint SDK's wallet uses. Only Solana mainnet is wired up in
// v0.1; EVM support is a stretch goal for later phases.
function resolveChain(network: string): Chain | null {
  const lower = network.toLowerCase();
  if (lower === "solana" || lower.startsWith("solana:")) return "solana";
  if (lower === "base" || lower === "eip155:8453") return "base";
  if (lower === "base-sepolia" || lower === "eip155:84532") return "base-sepolia";
  return null;
}

// Map an asset identifier (mint address or symbol) to the Crossmint SDK's
// send() token argument. The SDK accepts either a mint address or a symbol
// like "usdc"; symbols are safer because the SDK resolves the network-
// correct mint internally.
function resolveTokenSymbol(asset: string): string {
  const USDC_MAINNET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  if (asset === USDC_MAINNET_MINT) return "usdc";
  if (asset.toLowerCase() === "usdc") return "usdc";
  // Fall back to passing the mint/address through as-is
  return asset;
}

// ---------------------------------------------------------------------------
// Amount conversion
// ---------------------------------------------------------------------------

// Atomic units → decimal string for a given number of decimals. The Crossmint
// SDK's send() method expects the amount in decimal units (e.g. "0.01" for
// 1¢ of USDC), not atomic units.
function atomicToDecimal(atomic: string, decimals: number): string {
  const n = BigInt(atomic);
  const base = BigInt(10) ** BigInt(decimals);
  const whole = n / base;
  const frac = n % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Pay an x402-protected HTTP endpoint using a Crossmint smart wallet.
 *
 * Flow:
 *   1. Fetch `url` with the caller's original headers/body
 *   2. If the server responds 200, return directly — nothing to pay
 *   3. If the server responds 402, parse the PaymentRequired body and pick
 *      the first PaymentRequirements entry on a supported chain (Solana
 *      mainnet in v0.1)
 *   4. Load the payer wallet via `wallets.getWallet(payerAddress, ...)`,
 *      passing the server recovery signer through the args so the
 *      returned Wallet has its `#recovery` field populated. Without this,
 *      the SDK's useSigner path crashes because `isRecoverySigner` tries
 *      to call `.startsWith` on an undefined secret (chunk-XNZLCUTY:395).
 *      The WalletArgsFor TypeScript type doesn't declare a `recovery`
 *      field, but the runtime `createWalletInstance` reads it when
 *      present, so we pass it via an explicit cast.
 *   5. Call `wallet.send(payTo, tokenSymbol, decimalAmount)` — Crossmint
 *      handles the CPI inner instruction wrapping, signing via the server
 *      recovery signer, fee payment, and confirmation internally
 *   6. Build the X-PAYMENT header as base64(JSON(PaymentPayload)) with the
 *      resulting transaction signature in the payload
 *   7. Retry the original request with the X-PAYMENT header appended
 *   8. Return the response body plus the on-chain tx signature
 */
export async function payX402Endpoint(opts: {
  url: string;
  payerAddress: string;
  chain: Chain;
  headers?: Record<string, string>;
  method?: string;
  jsonBody?: unknown;
  maxUsdcAtomic?: bigint;
}): Promise<PayX402Result> {
  const {
    url,
    payerAddress,
    chain,
    headers = {},
    method = "GET",
    jsonBody,
    maxUsdcAtomic,
  } = opts;

  // -----------------------------------------------------------------------
  // Step 1: initial request — expect 402
  // -----------------------------------------------------------------------
  const initialResponse = await fetchWith(url, method, headers, jsonBody);
  if (initialResponse.status !== 402) {
    if (initialResponse.status >= 200 && initialResponse.status < 300) {
      return {
        url,
        transactionSignature: "",
        responseStatus: initialResponse.status,
        responseBody: await safeJson(initialResponse),
        explorerLink: "",
      };
    }
    throw new Error(
      `Expected 200 or 402 on initial request, got ${initialResponse.status}`,
    );
  }

  // -----------------------------------------------------------------------
  // Step 2: parse PaymentRequired from header (v2) or body (v1)
  // -----------------------------------------------------------------------
  let paymentRequired: PaymentRequired;

  // x402 v2: payment requirements are base64-encoded in the
  // `payment-required` response header (e.g. Nansen API)
  const paymentRequiredHeader = initialResponse.headers.get("payment-required");
  if (paymentRequiredHeader) {
    try {
      const decoded = Buffer.from(paymentRequiredHeader, "base64").toString("utf-8");
      paymentRequired = JSON.parse(decoded) as PaymentRequired;
    } catch {
      throw new Error("Failed to decode base64 payment-required header");
    }
  } else {
    // x402 v1: payment requirements are in the JSON response body
    paymentRequired = (await initialResponse.json()) as PaymentRequired;
  }

  if (!paymentRequired.accepts?.length) {
    throw new Error("402 response has no accepts[] entries");
  }

  // Pick the requirement that matches the caller's chain first, then fall
  // back to any supported network. This matters when the 402 response
  // offers multiple networks (e.g. Nansen offers Base + Solana).
  let requirement = paymentRequired.accepts.find(
    (r) => resolveChain(r.network) === chain,
  );
  if (!requirement) {
    requirement = paymentRequired.accepts.find(
      (r) => resolveChain(r.network) !== null,
    );
  }
  if (!requirement) {
    const offered = paymentRequired.accepts.map((r) => r.network).join(", ");
    throw new Error(
      `No supported payment network in 402 response. Offered: [${offered}]. ` +
        `Supported: solana, base.`,
    );
  }

  const resolvedChain = resolveChain(requirement.network)!;

  // Enforce max payment guardrail
  const amountRaw = requirement.amount ?? requirement.maxAmountRequired;
  if (!amountRaw) {
    throw new Error("402 response has no amount or maxAmountRequired field");
  }
  const amountAtomic = BigInt(amountRaw);
  if (maxUsdcAtomic != null && amountAtomic > maxUsdcAtomic) {
    throw new Error(
      `402 requires ${amountAtomic} atomic units but maxUsdcAtomic=${maxUsdcAtomic}`,
    );
  }

  // -----------------------------------------------------------------------
  // Step 3: pay via wallet.send()
  // -----------------------------------------------------------------------
  // getWallet(locator, args) loads an existing wallet by address. The
  // WalletArgsFor type omits `recovery`, but the runtime
  // `createWalletInstance` reads it if present — we use that so the
  // returned Wallet has its recovery field populated with the secret,
  // enabling the auto-assembled signer path to succeed without a separate
  // useSigner call.
  const { recoverySecret } = getConfig();
  const wallets = getWalletsClient();
  const wallet = await wallets.getWallet(payerAddress, {
    chain,
    recovery: { type: "server", secret: recoverySecret },
  } as unknown as Parameters<typeof wallets.getWallet<Chain>>[1]);

  const tokenSymbol = resolveTokenSymbol(requirement.asset);
  const decimals =
    typeof requirement.extra?.decimals === "number"
      ? requirement.extra.decimals
      : 6; // USDC default
  const decimalAmount = atomicToDecimal(amountRaw, decimals);

  console.error(
    `[payX402Endpoint] paying ${decimalAmount} ${tokenSymbol} to ${requirement.payTo} on ${chain}...`,
  );
  const txResult = await wallet.send(
    requirement.payTo,
    tokenSymbol,
    decimalAmount,
  );
  console.error(`[payX402Endpoint] tx confirmed: ${txResult.hash}`);

  // -----------------------------------------------------------------------
  // Step 4: build X-PAYMENT header + retry
  // -----------------------------------------------------------------------
  const paymentPayload = {
    x402Version: paymentRequired.x402Version,
    accepted: requirement,
    payload: {
      transactionSignature: txResult.hash,
      // Also include under "signature" for compatibility with facilitators
      // that use that field name
      signature: txResult.hash,
    },
  };
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString(
    "base64",
  );

  const paidResponse = await fetchWith(
    url,
    method,
    { ...headers, "X-PAYMENT": paymentHeader },
    jsonBody,
  );
  if (paidResponse.status < 200 || paidResponse.status >= 300) {
    const body = await safeJson(paidResponse);
    throw new Error(
      `Paid but endpoint returned ${paidResponse.status}: ${JSON.stringify(body)}`,
    );
  }

  return {
    url,
    transactionSignature: txResult.hash,
    responseStatus: paidResponse.status,
    responseBody: await safeJson(paidResponse),
    explorerLink: txResult.explorerLink || getExplorerLink(txResult.hash, chain),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWith(
  url: string,
  method: string,
  headers: Record<string, string>,
  jsonBody: unknown,
): Promise<Response> {
  const init: RequestInit = { method, headers: { ...headers } };
  if (jsonBody !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(jsonBody);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  return fetch(url, init);
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
