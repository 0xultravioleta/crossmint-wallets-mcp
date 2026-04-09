import { getConfig, getWalletsClient } from "./client.js";
import type { Chain, CreateWalletResult } from "./types.js";

/**
 * Creates a Crossmint smart wallet on the given chain, using the configured
 * server recovery signer. This is idempotent for a given (API key + recovery
 * secret + owner) tuple — calling it twice yields the same wallet.
 *
 * The `owner` field is an optional free-form identifier (email, user id,
 * hashed handle, etc). It is passed straight through to the Crossmint API
 * so downstream tools can resolve a wallet by owner later.
 */
export async function createWallet(opts: {
  chain: Chain;
  owner?: string;
  alias?: string;
}): Promise<CreateWalletResult> {
  const { chain, owner, alias } = opts;
  const { recoverySecret } = getConfig();
  const wallets = getWalletsClient();

  // Crossmint's owner field is a user locator — valid formats are the
  // literal "COMPANY" or prefixed strings like "email:x@y.com",
  // "userId:abc", "phoneNumber:+123", "twitter:handle", "x:handle". Free-form
  // strings are rejected server-side. If the caller did not provide a
  // locator, we omit the field entirely so the wallet is owned by the API
  // key account (no specific user).
  const wallet = await wallets.createWallet({
    chain,
    ...(owner ? { owner } : {}),
    ...(alias ? { alias } : {}),
    recovery: { type: "server", secret: recoverySecret },
  });

  return {
    owner: owner ?? null,
    chain,
    address: wallet.address,
    explorerLink: getExplorerLink(wallet.address, chain),
  };
}

export function getExplorerLink(address: string, chain: Chain): string {
  switch (chain) {
    case "solana":
      return `https://explorer.solana.com/address/${address}`;
    case "base":
      return `https://basescan.org/address/${address}`;
    case "base-sepolia":
      return `https://sepolia.basescan.org/address/${address}`;
  }
}
