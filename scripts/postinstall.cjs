const fs = require("fs");
const path = require("path");

// Fix for broken text-encoding-utf-8@1.0.2 package.
// Its package.json has "main": "lib/encoding.lib" but npm does not
// install the lib/ directory (pnpm resolves it differently and works).
// borsh@0.7.0 (via @solana/web3.js) requires it at runtime.
// Node.js 20+ has TextEncoder/TextDecoder as globals, so we shim it.

const dir = path.join(__dirname, "..", "node_modules", "text-encoding-utf-8", "lib");
const file = path.join(dir, "encoding.lib.js");

try {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      file,
      "module.exports = { TextEncoder: globalThis.TextEncoder, TextDecoder: globalThis.TextDecoder };\n"
    );
  }
} catch (_) {
  // Silently continue — Node.js 20+ may not even hit this code path
}
