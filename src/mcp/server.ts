#!/usr/bin/env node

// Redirect console.log to stderr BEFORE any imports.
// The Crossmint SDK (@crossmint/wallets-sdk) emits telemetry via console.log
// which corrupts the MCP stdio transport (stdout = JSON-RPC only).
console.log = (...args: unknown[]) => console.error(...args);

/**
 * Crossmint Wallets MCP server — stdio transport entry point.
 *
 * IMPORTANT: this process uses stdout as the JSON-RPC transport channel.
 * All human-readable logging MUST go to stderr via `console.error(...)`.
 * Never `console.log` or `process.stdout.write` from anywhere in this
 * server — the MCP client will treat it as malformed protocol traffic.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const SERVER_NAME = "crossmint-wallets-mcp";
const SERVER_VERSION = "0.1.0";

async function main(): Promise<void> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[${SERVER_NAME}] v${SERVER_VERSION} connected via stdio transport`,
  );
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] fatal:`, err);
  process.exit(1);
});
