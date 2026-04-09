import { readFileSync } from "node:fs";
import { createCrossmint, CrossmintWallets } from "@crossmint/wallets-sdk";
import type { Chain } from "./types.js";

/**
 * Config loader.
 *
 * Supports two ways of providing secrets:
 *   1. Direct env var: CROSSMINT_API_KEY / CROSSMINT_RECOVERY_SECRET
 *   2. File ref env var: CROSSMINT_API_KEY_FILE / CROSSMINT_RECOVERY_SECRET_FILE
 *
 * The file-ref pattern is useful for Docker secrets, Kubernetes secrets, and
 * for keeping secrets out of any file that could be shown on screen during
 * streams or pair programming. If both are set, the direct env var wins.
 */
export interface CrossmintConfig {
  apiKey: string;
  recoverySecret: string;
  defaultChain: Chain;
  solanaRpcUrl: string;
}

function readSecret(
  directEnv: string,
  fileEnv: string,
  label: string,
): string {
  const direct = process.env[directEnv];
  if (direct && direct.trim().length > 0) return direct.trim();

  const filePath = process.env[fileEnv];
  if (filePath && filePath.trim().length > 0) {
    try {
      return readFileSync(filePath.trim(), "utf8").trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${label}: failed to read from ${fileEnv}=${filePath}: ${msg}`,
      );
    }
  }

  throw new Error(
    `${label} is required. Set ${directEnv} or ${fileEnv} in your environment.`,
  );
}

function parseChain(value: string | undefined, fallback: Chain): Chain {
  const allowed: Chain[] = ["solana", "base", "base-sepolia"];
  if (!value) return fallback;
  if ((allowed as string[]).includes(value)) return value as Chain;
  throw new Error(
    `DEFAULT_CHAIN=${value} is not supported. Allowed: ${allowed.join(", ")}`,
  );
}

let cachedConfig: CrossmintConfig | null = null;

export function getConfig(): CrossmintConfig {
  if (cachedConfig) return cachedConfig;

  const apiKey = readSecret(
    "CROSSMINT_API_KEY",
    "CROSSMINT_API_KEY_FILE",
    "CROSSMINT_API_KEY",
  );
  const recoverySecret = readSecret(
    "CROSSMINT_RECOVERY_SECRET",
    "CROSSMINT_RECOVERY_SECRET_FILE",
    "CROSSMINT_RECOVERY_SECRET",
  );
  const defaultChain = parseChain(process.env.DEFAULT_CHAIN, "solana");
  const solanaRpcUrl =
    process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";

  cachedConfig = { apiKey, recoverySecret, defaultChain, solanaRpcUrl };
  return cachedConfig;
}

/** Reset the cached config. Only intended for tests. */
export function resetConfigCache(): void {
  cachedConfig = null;
}

let cachedWalletsClient: ReturnType<typeof CrossmintWallets.from> | null = null;

export function getWalletsClient(): ReturnType<typeof CrossmintWallets.from> {
  if (cachedWalletsClient) return cachedWalletsClient;
  const { apiKey } = getConfig();
  const crossmint = createCrossmint({ apiKey });
  cachedWalletsClient = CrossmintWallets.from(crossmint);
  return cachedWalletsClient;
}
