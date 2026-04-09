/**
 * Smoke test for the 4 core tools — runs OUTSIDE the MCP transport so we can
 * exercise the primitives directly while iterating.
 *
 * Loads `.env` via dotenv so the file-ref secret pattern works locally.
 * Logs to stderr only (matching the MCP server rule).
 *
 * Populated incrementally:
 *   - Phase 2B: scaffold only, config loader check.
 *   - Phase 2B+: createWallet on mainnet (this step — unblocks Phase 2C by
 *     producing a real address the operator can fund with USDC).
 *   - Phase 2C: payX402Endpoint against a real x402 endpoint.
 *   - Phase 2D: getBalance + transferToken.
 */

import "dotenv/config";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../src/core/client.js";
import { createWallet } from "../src/core/create-wallet.js";
import { getBalance } from "../src/core/get-balance.js";
import { payX402Endpoint } from "../src/core/pay-x402-endpoint.js";
import type { Chain, CreateWalletResult } from "../src/core/types.js";
import { startPaywallServer } from "./paywall-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, "wallet-cache.json");

interface WalletCache {
  [key: string]: CreateWalletResult;
}

function loadCache(): WalletCache {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache: WalletCache): void {
  if (!existsSync(dirname(CACHE_PATH))) {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
  }
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function cacheKey(chain: Chain, owner: string | undefined): string {
  return `${chain}::${owner ?? "company"}`;
}

async function main(): Promise<void> {
  console.error("=== Crossmint Wallets MCP — smoke test ===");

  const cfg = getConfig();
  console.error(
    `[cfg] api_key: ${cfg.apiKey ? "loaded" : "MISSING"} ` +
      `(length=${cfg.apiKey.length})`,
  );
  console.error(
    `[cfg] recovery_secret: ${cfg.recoverySecret ? "loaded" : "MISSING"} ` +
      `(length=${cfg.recoverySecret.length})`,
  );
  console.error(`[cfg] default_chain: ${cfg.defaultChain}`);
  console.error(`[cfg] solana_rpc_url: ${cfg.solanaRpcUrl}`);

  // -------------------------------------------------------------------
  // Step 1: createWallet — produces the funding target for Phase 2C.
  // -------------------------------------------------------------------
  const cache = loadCache();
  const chain: Chain = cfg.defaultChain;
  // owner must be a user locator (email:..., userId:..., x:..., etc) or the
  // literal "COMPANY" — leave undefined to get a company-owned wallet.
  const owner = process.env.SMOKE_TEST_OWNER || undefined;
  const key = cacheKey(chain, owner);

  let wallet: CreateWalletResult;
  if (cache[key]) {
    console.error(`[createWallet] using cached wallet for ${key}`);
    wallet = cache[key];
  } else {
    console.error(
      `[createWallet] creating new wallet on ${chain} for owner="${owner}"...`,
    );
    wallet = await createWallet({ chain, owner });
    cache[key] = wallet;
    saveCache(cache);
    console.error(`[createWallet] cached to ${CACHE_PATH}`);
  }

  console.error("");
  console.error("=== WALLET READY ===");
  console.error(`chain:    ${wallet.chain}`);
  console.error(`owner:    ${wallet.owner}`);
  console.error(`address:  ${wallet.address}`);
  console.error(`explorer: ${wallet.explorerLink}`);
  console.error("====================");
  console.error("");

  // -------------------------------------------------------------------
  // Step 2: getBalance — verify funding before Tool 4.
  // -------------------------------------------------------------------
  console.error("[getBalance] fetching payer balances...");
  const balance = await getBalance({ address: wallet.address, chain });
  console.error("");
  console.error("=== PAYER BALANCES ===");
  for (const b of balance.balances) {
    console.error(`  ${b.symbol.padEnd(8)} ${b.amount} (decimals=${b.decimals})`);
  }
  console.error("======================");
  console.error("");

  // -------------------------------------------------------------------
  // Step 3: boot local paywall server (x402 merchant).
  // -------------------------------------------------------------------
  const merchantKey = cacheKey(chain, "merchant");
  const merchant = cache[merchantKey];
  if (!merchant) {
    throw new Error(
      `No merchant wallet in cache under "${merchantKey}". Run ` +
        `'pnpm tsx demo/create-merchant-wallet.ts' first.`,
    );
  }
  console.error(`[merchant] ${merchant.address}`);
  process.env.PAYWALL_MERCHANT_ADDRESS = merchant.address;

  const paywall = await startPaywallServer();

  // -------------------------------------------------------------------
  // Step 4: payX402Endpoint — the actual Tool 4 smoke test.
  // -------------------------------------------------------------------
  try {
    console.error("");
    console.error("[payX402Endpoint] calling paywall...");
    const result = await payX402Endpoint({
      url: paywall.url,
      payerAddress: wallet.address,
      chain,
      maxUsdcAtomic: 100000n, // 0.1 USDC guardrail (actual = 0.01 USDC)
    });

    console.error("");
    console.error("=== PAYMENT RESULT ===");
    console.error(`status:    ${result.responseStatus}`);
    console.error(`tx sig:    ${result.transactionSignature}`);
    console.error(`explorer:  ${result.explorerLink}`);
    console.error(`body:      ${JSON.stringify(result.responseBody, null, 2)}`);
    console.error("======================");
    console.error("");
  } finally {
    await paywall.stop();
  }

  // -------------------------------------------------------------------
  // Step 5: balance check after payment — verify the merchant received it.
  // -------------------------------------------------------------------
  console.error("[getBalance] fetching merchant balances (post-payment)...");
  const merchantBalance = await getBalance({
    address: merchant.address,
    chain,
  });
  console.error("");
  console.error("=== MERCHANT BALANCES ===");
  for (const b of merchantBalance.balances) {
    console.error(`  ${b.symbol.padEnd(8)} ${b.amount} (decimals=${b.decimals})`);
  }
  console.error("=========================");

  console.error("");
  console.error("=== smoke test OK ===");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
