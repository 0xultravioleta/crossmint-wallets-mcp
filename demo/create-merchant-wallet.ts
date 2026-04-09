/**
 * One-off: create a second Crossmint wallet to serve as the x402 payTo
 * destination during the Phase 2C smoke test. The payer wallet already
 * exists in demo/wallet-cache.json; this script adds a merchant entry.
 *
 * Tries a few strategies in order until we get a distinct address:
 *   1. alias="merchant"
 *   2. alias="merchant-v2"
 *   3. alias="merchant-<random>"
 */

import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWallet } from "../src/core/create-wallet.js";
import type { CreateWalletResult } from "../src/core/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, "wallet-cache.json");

interface Cache {
  [k: string]: CreateWalletResult;
}

function loadCache(): Cache {
  if (!existsSync(CACHE_PATH)) return {};
  return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
}

function saveCache(c: Cache): void {
  writeFileSync(CACHE_PATH, JSON.stringify(c, null, 2));
}

async function main(): Promise<void> {
  const cache = loadCache();
  const payerKey = "solana::company";
  const payer = cache[payerKey];
  if (!payer) {
    console.error(`No payer wallet in cache under key "${payerKey}".`);
    console.error(`Run 'pnpm demo' first to create the payer wallet.`);
    process.exit(1);
  }
  console.error(`[payer]    ${payer.address}`);

  const aliases = ["merchant", "merchant-v2", `merchant-${Date.now()}`];
  let merchant: CreateWalletResult | null = null;

  for (const alias of aliases) {
    console.error(`[merchant] trying alias="${alias}"...`);
    const result = await createWallet({ chain: "solana", alias });
    if (result.address !== payer.address) {
      merchant = result;
      console.error(`[merchant] ${result.address} (distinct from payer) OK`);
      break;
    }
    console.error(`[merchant] collision — same as payer, trying next alias`);
  }

  if (!merchant) {
    console.error("FAILED to produce a distinct merchant wallet after 3 tries");
    process.exit(1);
  }

  cache["solana::merchant"] = merchant;
  saveCache(cache);
  console.error(`[cache] saved merchant to ${CACHE_PATH}`);

  console.error("");
  console.error("=== WALLETS ===");
  console.error(`payer:    ${payer.address}`);
  console.error(`merchant: ${merchant.address}`);
  console.error("===============");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
