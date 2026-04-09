/**
 * Shared types for the core layer. Kept deliberately narrow so the MCP tool
 * schemas (src/mcp/tools.ts) can mirror them without drift.
 */

/**
 * Chain literals we expose on the MCP surface. These must be a subset of
 * `@crossmint/wallets-sdk`'s `Chain` type. Note that the SDK does NOT expose
 * a `"solana-devnet"` literal — Solana testnet/devnet is selected by the
 * Crossmint API key environment (staging key → devnet, production key →
 * mainnet), not by a separate chain name. EVM chains DO have explicit
 * testnet literals (e.g. "base-sepolia").
 */
export type Chain = "solana" | "base" | "base-sepolia";

export interface CreateWalletResult {
  owner: string | null;
  chain: Chain;
  address: string;
  explorerLink: string;
}

export interface TokenBalance {
  symbol: string;
  amount: string;
  decimals: number;
}

export interface BalanceResult {
  address: string;
  chain: Chain;
  balances: TokenBalance[];
}

export interface TransferResult {
  chain: Chain;
  from: string;
  to: string;
  token: string;
  amount: string;
  transactionSignature: string;
  explorerLink: string;
}

export interface PayX402Result {
  url: string;
  transactionSignature: string;
  responseStatus: number;
  responseBody: unknown;
  explorerLink: string;
}
