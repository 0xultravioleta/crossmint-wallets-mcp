#!/usr/bin/env node
"use strict";

// This CJS wrapper patches process.stdout BEFORE any ESM module loads.
// Problem: The Crossmint SDK (@crossmint/wallets-sdk) writes telemetry
// to stdout via console.log during module initialization. In ESM, static
// imports are evaluated before any top-level code, so patching console.log
// inside server.ts runs too late. This CJS entry point runs first.
//
// Fix: intercept process.stdout.write and only let JSON-RPC messages
// through. Everything else goes to stderr.

const origWrite = process.stdout.write.bind(process.stdout);

process.stdout.write = function (chunk, encoding, callback) {
  const str = typeof chunk === "string" ? chunk : chunk.toString();
  const trimmed = str.trimStart();

  // JSON-RPC messages start with '{' and contain "jsonrpc"
  if (trimmed.startsWith("{") && trimmed.includes('"jsonrpc"')) {
    return origWrite(chunk, encoding, callback);
  }

  // Redirect everything else to stderr (SDK telemetry, debug logs, etc.)
  return process.stderr.write(chunk, encoding, callback);
};

// Also redirect console.log for anything that slips through
const origLog = console.log;
console.log = function (...args) {
  console.error(...args);
};

// Now dynamically import the ESM server — all patches are in place
import("../dist/mcp/server.js").catch((err) => {
  console.error("[crossmint-wallets-mcp] failed to load server:", err);
  process.exit(1);
});
