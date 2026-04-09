import type { Chain, TransferResult } from "./types.js";

/**
 * STUB — populated in Phase 5 (Task 5.1 of 03-mcp-build-and-skill-plan.md).
 *
 * Transfers an SPL token (Solana) or ERC-20 token (EVM) from a Crossmint
 * wallet to a destination address.
 */
export async function transferToken(opts: {
  email: string;
  chain: Chain;
  to: string;
  token: string;
  amount: string;
}): Promise<TransferResult> {
  throw new Error(
    `transferToken(${opts.email}, ${opts.to}, ${opts.amount} ${opts.token}) not implemented yet — Phase 5 task 5.1`,
  );
}
