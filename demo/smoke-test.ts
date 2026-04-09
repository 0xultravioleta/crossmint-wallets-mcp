/**
 * Smoke test for the 4 core tools — runs OUTSIDE the MCP transport so we can
 * exercise the primitives directly while iterating.
 *
 * Loads `.env` via dotenv so the file-ref secret pattern works locally.
 * Logs to stderr only (matching the MCP server rule) so this script is safe
 * to redirect through the same log sinks.
 *
 * Populated incrementally:
 *   - Phase 2B (this file): scaffold only, checks that config loads.
 *   - Phase 2C: calls payX402Endpoint against a real x402 endpoint.
 *   - Phase 2D: calls createWallet, getBalance, transferToken in sequence.
 */

import "dotenv/config";
import { getConfig } from "../src/core/client.js";

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

  // Phase 2C+ steps will be added here in order:
  //   1. createWallet({ email, chain })
  //   2. getBalance({ email, chain })
  //   3. payX402Endpoint({ email, url, maxUsdc })
  //   4. transferToken({ email, to, token, amount })

  console.error("=== smoke test OK (scaffold mode) ===");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
