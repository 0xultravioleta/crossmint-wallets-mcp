import type { Chain, CreateWalletResult } from "./types.js";

/**
 * STUB — populated in Phase 3 (Task 3.1 of 03-mcp-build-and-skill-plan.md).
 *
 * Creates a Crossmint smart wallet for the given email on the given chain.
 * Idempotent: if a wallet already exists for that email, returns the existing
 * wallet instead of throwing.
 */
export async function createWallet(opts: {
  email: string;
  chain: Chain;
}): Promise<CreateWalletResult> {
  throw new Error(
    `createWallet(${opts.email}, ${opts.chain}) not implemented yet — Phase 3 task 3.1`,
  );
}

export function getExplorerLink(address: string, chain: Chain): string {
  switch (chain) {
    case "solana":
      return `https://explorer.solana.com/address/${address}`;
    case "solana-devnet":
      return `https://explorer.solana.com/address/${address}?cluster=devnet`;
    case "base":
      return `https://basescan.org/address/${address}`;
    case "base-sepolia":
      return `https://sepolia.basescan.org/address/${address}`;
  }
}
