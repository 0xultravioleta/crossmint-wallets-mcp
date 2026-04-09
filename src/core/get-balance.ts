import { getWalletsClient } from "./client.js";
import type { BalanceResult, Chain, TokenBalance } from "./types.js";

/**
 * Reads the on-chain balances for a Crossmint wallet by address. Returns
 * the native token (SOL/ETH), USDC (always included per SDK contract),
 * and any other token balances the wallet holds.
 *
 * This is the Phase 4 Task 4.1 implementation from
 * 03-mcp-build-and-skill-plan.md, lifted forward so we can verify funding
 * before running Tool 4 (pay_x402_endpoint).
 */
export async function getBalance(opts: {
  address: string;
  chain: Chain;
  tokens?: string[];
}): Promise<BalanceResult> {
  const { address, chain, tokens } = opts;
  const wallets = getWalletsClient();

  const wallet = await wallets.getWallet(address, { chain });
  const raw = await wallet.balances(tokens);

  const formatted: TokenBalance[] = [
    { symbol: "native", amount: raw.nativeToken.amount, decimals: raw.nativeToken.decimals ?? 0 },
    { symbol: "usdc", amount: raw.usdc.amount, decimals: raw.usdc.decimals ?? 0 },
    ...raw.tokens.map((t) => ({
      symbol: t.symbol,
      amount: t.amount,
      decimals: t.decimals ?? 0,
    })),
  ];

  return {
    address,
    chain,
    balances: formatted,
  };
}
