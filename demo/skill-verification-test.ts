/**
 * SKILL VERIFICATION TEST
 *
 * This script follows the EXACT instructions from crossmint-cpi-skill/SKILL.md
 * step by step, as a developer would after installing the skill.
 *
 * It proves that the skill's instructions actually work end-to-end
 * against a real x402 paywall on Solana mainnet.
 */

import "dotenv/config";
import { readFileSync } from "fs";

// Load secrets from file references (same as the MCP server's config loader)
function loadSecret(envKey: string, fileKey: string): string {
  const direct = process.env[envKey];
  if (direct) return direct.trim();
  const filePath = process.env[fileKey];
  if (filePath) return readFileSync(filePath, "utf-8").trim();
  throw new Error(`Set ${envKey} or ${fileKey}`);
}

const apiKey = loadSecret("CROSSMINT_API_KEY", "CROSSMINT_API_KEY_FILE");
const recoverySecret = loadSecret("CROSSMINT_RECOVERY_SECRET", "CROSSMINT_RECOVERY_SECRET_FILE");

// ============================================================
// STEP 1: Setup — EXACTLY as the skill instructs (SKILL.md lines 100-121)
// ============================================================

import { createCrossmint, CrossmintWallets } from "@crossmint/wallets-sdk";

const crossmint = createCrossmint({ apiKey });
const wallets = CrossmintWallets.from(crossmint);

// Load the wallet — IMPORTANT: pass recovery in the args so the returned
// Wallet has its internal recovery field populated. The TypeScript
// WalletArgsFor type omits recovery, but the runtime reads it.
const walletAddress = "4xHkMCaKVBGw4GtdpeKoNZhGFDMi1tMCJDvXvxUmL8hM";
const wallet = await wallets.getWallet(walletAddress, {
  chain: "solana",
  recovery: { type: "server", secret: recoverySecret },
} as any);

console.log("[skill-test] Wallet loaded:", walletAddress);

// ============================================================
// STEP 2: Fetch the URL and expect a 402 (SKILL.md lines 136-137)
// ============================================================

const endpoint = "http://localhost:4021/paid-data";
const probe = await fetch(endpoint);
if (probe.status !== 402) throw new Error("Expected 402, got " + probe.status);

console.log("[skill-test] Got 402 from", endpoint);

// ============================================================
// STEP 3: Parse the PaymentRequired body (SKILL.md lines 140-149)
// ============================================================

const paymentRequired = (await probe.json()) as {
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
  }>;
};

// ============================================================
// STEP 4: Pick Solana requirement (SKILL.md lines 152-155)
// ============================================================

const requirement = paymentRequired.accepts.find((r) =>
  r.network.toLowerCase().startsWith("solana"),
);
if (!requirement) throw new Error("No Solana requirement in 402 body");

console.log("[skill-test] Payment required:", requirement.amount, "atomic USDC to", requirement.payTo);

// ============================================================
// STEP 5: Convert amount and pay via wallet.send (SKILL.md lines 158-159)
// ============================================================

const decimalAmount = (Number(requirement.amount) / 1_000_000).toString();
console.log("[skill-test] Paying", decimalAmount, "USDC via wallet.send()...");

const tx = await wallet.send(requirement.payTo, "usdc", decimalAmount);

console.log("[skill-test] TX confirmed:", tx.hash);

// ============================================================
// STEP 6: Build X-PAYMENT header and replay (SKILL.md lines 163-175)
// ============================================================

const paymentHeader = Buffer.from(
  JSON.stringify({
    x402Version: paymentRequired.x402Version,
    accepted: requirement,
    payload: { transactionSignature: tx.hash },
  }),
).toString("base64");

const paid = await fetch(endpoint, {
  headers: { "X-PAYMENT": paymentHeader },
});

const result = await paid.json();

console.log("[skill-test] Response status:", paid.status);
console.log("[skill-test] Response body:", JSON.stringify(result, null, 2));

// ============================================================
// VERDICT
// ============================================================

if (paid.status === 200) {
  console.log("\n=== SKILL VERIFICATION PASSED ===");
  console.log("The instructions from crossmint-cpi-skill/SKILL.md work end-to-end.");
  console.log("TX:", tx.hash);
  console.log("Explorer:", `https://explorer.solana.com/tx/${tx.hash}`);
} else {
  console.error("\n=== SKILL VERIFICATION FAILED ===");
  console.error("Status:", paid.status);
  process.exit(1);
}
