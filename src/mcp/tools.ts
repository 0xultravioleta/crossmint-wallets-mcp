import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createWallet } from "../core/create-wallet.js";
import { getBalance } from "../core/get-balance.js";
import { transferToken } from "../core/transfer-token.js";
import { payX402Endpoint } from "../core/pay-x402-endpoint.js";
import { classifyError, toolErrorResponse } from "./errors.js";

/**
 * Register the 4 Crossmint wallet tools against an MCP server instance.
 *
 * Tool naming convention: `crossmint_<verb>` — the `crossmint_` prefix
 * disambiguates from other MCP servers a client may have connected.
 *
 * All handlers catch thrown errors and translate them into the
 * standardized MCP error response shape from `./errors.ts`, so clients
 * never see raw stack traces in the content block.
 */

const chainSchema = z
  .enum(["solana", "base", "base-sepolia"])
  .describe(
    "The chain to operate on. Use 'solana' for Solana mainnet (or devnet if " +
      "the Crossmint API key is a staging key — the SDK resolves the cluster " +
      "from the API environment). Use 'base' for Base mainnet, 'base-sepolia' " +
      "for Base testnet.",
  );

function textResult(obj: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(obj, null, 2) },
    ],
  };
}

function errorResult(err: unknown) {
  const code = classifyError(err);
  const message = err instanceof Error ? err.message : String(err);
  return toolErrorResponse(code, message);
}

export function registerTools(server: McpServer): void {
  // -------------------------------------------------------------------
  // Tool 1: crossmint_create_wallet
  // -------------------------------------------------------------------
  server.registerTool(
    "crossmint_create_wallet",
    {
      title: "Create a Crossmint smart wallet",
      description:
        "Creates a new Crossmint smart wallet on the given chain, using " +
        "the server-side recovery signer configured via CROSSMINT_RECOVERY_SECRET. " +
        "Note: calling this tool without an `alias` generates a NEW wallet " +
        "on every call (non-deterministic). Pass an `alias` string to make " +
        "wallet creation idempotent — the same alias always resolves to the " +
        "same address. `owner` accepts Crossmint user locators like " +
        "'email:user@example.com', 'userId:abc', 'x:handle', or the literal " +
        "'COMPANY' for company-owned wallets. Free-form strings are rejected " +
        "by the Crossmint API.",
      inputSchema: {
        chain: chainSchema,
        owner: z
          .string()
          .optional()
          .describe(
            "Optional user locator (email:x@y.com, userId:abc, x:handle, " +
              "phoneNumber:+123, twitter:handle) or 'COMPANY'.",
          ),
        alias: z
          .string()
          .optional()
          .describe(
            "Optional alias string. Makes wallet creation deterministic — " +
              "the same (recovery secret, chain, alias) tuple always resolves " +
              "to the same wallet address.",
          ),
      },
    },
    async ({ chain, owner, alias }) => {
      try {
        const result = await createWallet({ chain, owner, alias });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // -------------------------------------------------------------------
  // Tool 2: crossmint_get_balance
  // -------------------------------------------------------------------
  server.registerTool(
    "crossmint_get_balance",
    {
      title: "Get on-chain balances for a Crossmint wallet",
      description:
        "Returns the native token balance (SOL/ETH) and USDC balance for a " +
        "Crossmint wallet, plus any additional token balances requested. " +
        "Read-only: no signer required.",
      inputSchema: {
        address: z
          .string()
          .describe("The Crossmint wallet address to query."),
        chain: chainSchema,
        tokens: z
          .array(z.string())
          .optional()
          .describe(
            "Optional array of additional token symbols or mint/contract " +
              "addresses to include in the response. Native token and USDC " +
              "are always included regardless of this field.",
          ),
      },
    },
    async ({ address, chain, tokens }) => {
      try {
        const result = await getBalance({ address, chain, tokens });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // -------------------------------------------------------------------
  // Tool 3: crossmint_transfer_token
  // -------------------------------------------------------------------
  server.registerTool(
    "crossmint_transfer_token",
    {
      title: "Transfer tokens from a Crossmint wallet",
      description:
        "Transfers tokens from a Crossmint smart wallet to any recipient " +
        "address or user locator. Uses the server recovery signer and the " +
        "Crossmint gasless relayer — no native gas token is required in " +
        "the wallet. `amount` is in decimal human units (e.g. '0.01'), " +
        "not atomic units.",
      inputSchema: {
        payerAddress: z
          .string()
          .describe("Address of the Crossmint wallet to transfer from."),
        chain: chainSchema,
        to: z
          .string()
          .describe(
            "Recipient address or user locator (e.g. a Solana pubkey, an " +
              "EVM 0x... address, or 'email:x@y.com').",
          ),
        token: z
          .string()
          .describe(
            "Token symbol ('usdc', 'sol', 'eth') or raw mint/contract address.",
          ),
        amount: z
          .string()
          .describe(
            "Amount in decimal human units (e.g. '0.01' for 0.01 USDC).",
          ),
      },
    },
    async ({ payerAddress, chain, to, token, amount }) => {
      try {
        const result = await transferToken({
          payerAddress,
          chain,
          to,
          token,
          amount,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // -------------------------------------------------------------------
  // Tool 4: crossmint_pay_x402_endpoint
  // -------------------------------------------------------------------
  server.registerTool(
    "crossmint_pay_x402_endpoint",
    {
      title: "Pay an x402-protected HTTP endpoint",
      description:
        "Fetches an HTTP URL, handles the x402 Payment Required (HTTP 402) " +
        "challenge by transferring the requested amount of USDC from a " +
        "Crossmint smart wallet, and returns the paid response body plus " +
        "the on-chain transaction signature. Supports Solana mainnet in " +
        "v0.1; EVM support is planned.",
      inputSchema: {
        payerAddress: z
          .string()
          .describe(
            "Address of the Crossmint wallet that should fund the payment.",
          ),
        chain: chainSchema,
        url: z.string().url().describe("The x402-protected URL to fetch."),
        method: z
          .enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"])
          .optional()
          .describe("HTTP method. Defaults to GET."),
        headers: z
          .record(z.string(), z.string())
          .optional()
          .describe("Additional HTTP headers to send with the request."),
        jsonBody: z
          .any()
          .optional()
          .describe(
            "JSON body to send with POST/PUT/PATCH requests. Ignored for GET.",
          ),
        maxUsdcAtomic: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            "Safety guardrail: reject the payment if the 402 response asks " +
              "for more than this many atomic USDC units (1 USDC = 1,000,000 " +
              "atomic units). Recommended for agents to avoid runaway spend.",
          ),
      },
    },
    async ({ payerAddress, chain, url, method, headers, jsonBody, maxUsdcAtomic }) => {
      try {
        const result = await payX402Endpoint({
          url,
          payerAddress,
          chain,
          method,
          headers,
          jsonBody,
          maxUsdcAtomic:
            maxUsdcAtomic !== undefined ? BigInt(maxUsdcAtomic) : undefined,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
