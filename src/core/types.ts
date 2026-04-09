/**
 * Shared types for the core layer. Kept deliberately narrow so the MCP tool
 * schemas (src/mcp/tools.ts) can mirror them without drift.
 */

export type Chain =
  | "solana"
  | "solana-devnet"
  | "base"
  | "base-sepolia";

export interface CreateWalletResult {
  email: string;
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
  email: string;
  chain: Chain;
  address: string;
  balances: TokenBalance[];
}

export interface TransferResult {
  email: string;
  chain: Chain;
  from: string;
  to: string;
  token: string;
  amount: string;
  transactionSignature: string;
  explorerLink: string;
}

export interface PayX402Result {
  email: string;
  url: string;
  transactionSignature: string;
  responseStatus: number;
  responseBody: unknown;
  explorerLink: string;
}
