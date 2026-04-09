/**
 * Local x402 paywall server for the Phase 2C smoke test.
 *
 * Hand-rolled (no @x402/express middleware) so we control the payload shape
 * end-to-end and don't need a running facilitator. The server:
 *
 *   - GET /paid-data with no X-PAYMENT header returns HTTP 402 with the
 *     canonical x402 PaymentRequired body (PaymentRequirements.scheme =
 *     "exact", network = SOLANA_MAINNET_CAIP2, asset = USDC mainnet mint,
 *     amount = USDC atomic units, payTo = the merchant wallet address).
 *
 *   - GET /paid-data with an X-PAYMENT header decodes the base64 JSON
 *     payload, extracts either a `transactionSignature` or `transaction`
 *     field, and verifies via Solana mainnet RPC that:
 *       1. the transaction exists
 *       2. it is confirmed
 *       3. one of its SPL TransferChecked instructions moved at least
 *          the required USDC amount into the merchant wallet's ATA
 *     If verification passes, returns HTTP 200 with demo JSON content.
 *
 * This is deliberately not a full facilitator — no replay protection, no
 * settlement cache, no network abstraction. The MCP server Tool 4 is the
 * thing under test; this paywall is the test fixture.
 */

import express from "express";
import type { Request, Response } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  USDC_MAINNET_ADDRESS,
  SOLANA_MAINNET_CAIP2,
} from "@x402/svm";
import type { PaymentRequired } from "@x402/core/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const USDC_DECIMALS = 6;

// ---------------------------------------------------------------------------
// Payment verification
// ---------------------------------------------------------------------------

interface PaymentVerification {
  ok: boolean;
  reason?: string;
  signature?: string;
}

async function verifyPaymentSignature(
  connection: Connection,
  signature: string,
  expectedDestAta: string,
  expectedMint: string,
  expectedMinAmount: bigint,
): Promise<PaymentVerification> {
  try {
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return { ok: false, reason: "transaction not found on mainnet" };
    if (tx.meta?.err) {
      return { ok: false, reason: `tx failed on-chain: ${JSON.stringify(tx.meta.err)}` };
    }

    // Walk postTokenBalances looking for a balance increase on the expected
    // destination ATA for the expected mint. This is more robust than trying
    // to parse SPL instructions ourselves since Crossmint may wrap the
    // transfer in CPIs.
    const pre = tx.meta?.preTokenBalances ?? [];
    const post = tx.meta?.postTokenBalances ?? [];
    const accounts = tx.transaction.message.getAccountKeys?.().staticAccountKeys
      ?? (tx.transaction.message as unknown as { accountKeys: PublicKey[] }).accountKeys;

    for (const postBal of post) {
      if (postBal.mint !== expectedMint) continue;
      const accountKey = accounts[postBal.accountIndex];
      if (!accountKey || accountKey.toBase58() !== expectedDestAta) continue;
      const preBal = pre.find((p) => p.accountIndex === postBal.accountIndex);
      const preAmount = BigInt(preBal?.uiTokenAmount?.amount ?? "0");
      const postAmount = BigInt(postBal.uiTokenAmount.amount);
      const delta = postAmount - preAmount;
      if (delta >= expectedMinAmount) {
        return { ok: true, signature };
      }
      return {
        ok: false,
        reason: `insufficient payment: delta=${delta} required=${expectedMinAmount}`,
      };
    }
    return {
      ok: false,
      reason: `no USDC balance change on merchant ATA ${expectedDestAta}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `RPC error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export async function startPaywallServer(): Promise<{
  url: string;
  merchantAta: string;
  stop: () => Promise<void>;
}> {
  const PORT = Number(process.env.PAYWALL_PORT || 4021);
  const MERCHANT_ADDRESS = process.env.PAYWALL_MERCHANT_ADDRESS;
  const RPC_URL =
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const REQUIRED_AMOUNT_ATOMIC = BigInt(
    process.env.PAYWALL_AMOUNT_ATOMIC || "10000",
  );
  if (!MERCHANT_ADDRESS) {
    throw new Error("PAYWALL_MERCHANT_ADDRESS env var is required");
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const merchantPubkey = new PublicKey(MERCHANT_ADDRESS);
  const mintPubkey = new PublicKey(USDC_MAINNET_ADDRESS);
  const merchantAta = (
    await getAssociatedTokenAddress(mintPubkey, merchantPubkey, true)
  ).toBase58();

  const paymentRequired: PaymentRequired = {
    x402Version: 1,
    error: "Payment required: 0.01 USDC on Solana mainnet",
    resource: {
      url: `http://localhost:${PORT}/paid-data`,
      description: "crossmint-wallets-mcp Phase 2C smoke-test paid endpoint",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: SOLANA_MAINNET_CAIP2,
        asset: USDC_MAINNET_ADDRESS,
        amount: REQUIRED_AMOUNT_ATOMIC.toString(),
        payTo: MERCHANT_ADDRESS,
        maxTimeoutSeconds: 60,
        extra: {
          decimals: USDC_DECIMALS,
          destinationAta: merchantAta,
        },
      },
    ],
  };

  const app = express();
  app.use(express.json());

  app.get("/paid-data", async (req: Request, res: Response) => {
    const header = req.header("X-PAYMENT");
    if (!header) {
      console.error("[paywall] 402 — no X-PAYMENT header");
      res.status(402).json(paymentRequired);
      return;
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    } catch {
      console.error("[paywall] 402 — X-PAYMENT not valid base64 JSON");
      res.status(402).json({
        ...paymentRequired,
        error: "X-PAYMENT header is not valid base64 JSON",
      });
      return;
    }

    const payload = (decoded as { payload?: Record<string, unknown> }).payload ?? {};
    const signature =
      typeof payload.transactionSignature === "string"
        ? payload.transactionSignature
        : typeof payload.signature === "string"
          ? payload.signature
          : undefined;

    if (!signature) {
      console.error("[paywall] 402 — no signature in payload");
      res.status(402).json({
        ...paymentRequired,
        error: "payload.transactionSignature or payload.signature required",
      });
      return;
    }

    console.error(`[paywall] verifying signature ${signature.slice(0, 16)}...`);
    const verification = await verifyPaymentSignature(
      connection,
      signature,
      merchantAta,
      USDC_MAINNET_ADDRESS,
      REQUIRED_AMOUNT_ATOMIC,
    );
    if (!verification.ok) {
      console.error(`[paywall] 402 — verification failed: ${verification.reason}`);
      res.status(402).json({
        ...paymentRequired,
        error: `Payment verification failed: ${verification.reason}`,
      });
      return;
    }

    console.error(`[paywall] 200 — payment verified (sig ${signature.slice(0, 16)}...)`);
    res.status(200).json({
      status: "ok",
      message: "Payment verified. Here is the premium data.",
      paidWith: signature,
      server: "crossmint-wallets-mcp x402 paywall (Phase 2C smoke test)",
      timestamp: new Date().toISOString(),
    });
  });

  const server = app.listen(PORT);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  console.error(`[paywall] listening on http://localhost:${PORT}/paid-data`);
  console.error(`[paywall] merchant address: ${MERCHANT_ADDRESS}`);
  console.error(`[paywall] merchant ATA:     ${merchantAta}`);
  console.error(`[paywall] required amount:  ${REQUIRED_AMOUNT_ATOMIC} atomic (= 0.01 USDC)`);

  return {
    url: `http://localhost:${PORT}/paid-data`,
    merchantAta,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

// Standalone run mode (when invoked directly instead of imported)
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  startPaywallServer().catch((err) => {
    console.error("[paywall] fatal:", err);
    process.exit(1);
  });
}
