import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * STUB — populated in Phase 2E (MCP wiring).
 *
 * This module registers the 4 Crossmint tools against the MCP server:
 *   - crossmint_create_wallet
 *   - crossmint_get_balance
 *   - crossmint_transfer_token
 *   - crossmint_pay_x402_endpoint
 *
 * Each tool wraps the corresponding function from `src/core/` and translates
 * thrown errors into the standardized MCP error shape from `./errors.ts`.
 *
 * Deferred until the core implementations land so the tool schemas stay in
 * lock-step with the real function signatures instead of drifting from a
 * stub contract.
 */
export function registerTools(_server: McpServer): void {
  // Intentionally empty — Phase 2E task list.
}
