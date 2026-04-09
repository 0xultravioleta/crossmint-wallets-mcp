import type { BalanceResult, Chain } from "./types.js";

/**
 * STUB — populated in Phase 4 (Task 4.1 of 03-mcp-build-and-skill-plan.md).
 *
 * Reads the on-chain balances for a Crossmint wallet identified by email.
 * Returns an empty balances array if the wallet holds no tokens (does not
 * throw).
 */
export async function getBalance(opts: {
  email: string;
  chain: Chain;
  tokens?: string[];
}): Promise<BalanceResult> {
  throw new Error(
    `getBalance(${opts.email}, ${opts.chain}) not implemented yet — Phase 4 task 4.1`,
  );
}
