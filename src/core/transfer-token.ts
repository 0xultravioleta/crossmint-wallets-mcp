import { getConfig, getWalletsClient } from "./client.js";
import type { Chain, TransferResult } from "./types.js";
import { getExplorerLink } from "./create-wallet.js";

/**
 * Transfer a token from a Crossmint smart wallet to any recipient address
 * or user locator. This is the general-purpose sibling of payX402Endpoint:
 * same `wallet.send()` primitive underneath, same getWallet + recovery-cast
 * pattern to work around the SDK 1.0.7 useSigner crash, but with no 402
 * protocol handling — just the raw transfer.
 *
 * `token` accepts either a token symbol the SDK recognizes (e.g. "usdc",
 * "sol", "eth") or a raw mint/contract address. `amount` is a decimal
 * string in human units (e.g. "0.01" for 0.01 USDC), not atomic units.
 */
export async function transferToken(opts: {
  payerAddress: string;
  chain: Chain;
  to: string;
  token: string;
  amount: string;
}): Promise<TransferResult> {
  const { payerAddress, chain, to, token, amount } = opts;

  const { recoverySecret } = getConfig();
  const wallets = getWalletsClient();
  const wallet = await wallets.getWallet(payerAddress, {
    chain,
    recovery: { type: "server", secret: recoverySecret },
  } as unknown as Parameters<typeof wallets.getWallet<Chain>>[1]);

  const tx = await wallet.send(to, token, amount);

  return {
    chain,
    from: payerAddress,
    to,
    token,
    amount,
    transactionSignature: tx.hash,
    explorerLink: tx.explorerLink || getExplorerLink(tx.hash, chain),
  };
}
