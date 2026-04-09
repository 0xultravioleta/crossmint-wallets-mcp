/**
 * Library entry point. Re-exports the core primitives so consumers can import
 * from `crossmint-wallets-mcp` directly without reaching into `src/core/`.
 *
 * The MCP server entry point lives at `src/mcp/server.ts` (see the `bin`
 * field in package.json).
 */

export { createWallet, getExplorerLink } from "./core/create-wallet.js";
export { getBalance } from "./core/get-balance.js";
export { transferToken } from "./core/transfer-token.js";
export { payX402Endpoint } from "./core/pay-x402-endpoint.js";
export { getConfig, getWalletsClient, resetConfigCache } from "./core/client.js";
export type {
  Chain,
  CreateWalletResult,
  BalanceResult,
  TokenBalance,
  TransferResult,
  PayX402Result,
} from "./core/types.js";
