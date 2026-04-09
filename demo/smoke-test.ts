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
import type { Chain, CreateWalletResult } from "../src/core/types.js";

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

  // Phase 2C+ steps will be added here:
  //   - payX402Endpoint({ url, maxUsdc })
  //   - getBalance({ chain, owner })
  //   - transferToken({ chain, owner, to, token, amount })

  console.error("=== smoke test OK ===");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
