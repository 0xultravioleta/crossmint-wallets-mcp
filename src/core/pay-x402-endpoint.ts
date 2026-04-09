import type { PayX402Result } from "./types.js";

/**
 * STUB — populated in Phase 2C (see 02-critical-path-plan.md).
 *
 * Pays an x402-protected HTTP endpoint using a Crossmint smart wallet:
 *   1. Fetch the URL, expect a 402 response with an x402 payment challenge
 *   2. Build the payment transaction (Solana SPL transfer or EVM EIP-3009)
 *   3. Sign via Crossmint wallet primitive
 *   4. Replay the request with X-PAYMENT header
 *   5. Return the response body plus the on-chain transaction signature
 *
 * This is the most load-bearing tool in the MCP server — all cut decisions
 * downstream are gated on this function working end-to-end.
 */
export async function payX402Endpoint(opts: {
  email: string;
  url: string;
  maxUsdc?: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
}): Promise<PayX402Result> {
  throw new Error(
    `payX402Endpoint(${opts.email}, ${opts.url}) not implemented yet — Phase 2C critical path`,
  );
}
