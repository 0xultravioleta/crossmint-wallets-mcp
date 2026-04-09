# crossmint-wallets-mcp

> An MCP server that exposes Crossmint smart wallet primitives as tools for
> any MCP-native client: Claude Desktop, Continue.dev, Cline, Codex CLI,
> and anything else that speaks the Model Context Protocol.

**Status:** v0.1.0 — Solana mainnet verified end-to-end. Base EVM planned.

## What this gives you

Four tools, callable from any MCP client, each wrapping a primitive from
[`@crossmint/wallets-sdk`](https://www.npmjs.com/package/@crossmint/wallets-sdk):

| Tool                              | What it does                                                        |
|-----------------------------------|---------------------------------------------------------------------|
| `crossmint_create_wallet`         | Create a new Crossmint smart wallet on the given chain              |
| `crossmint_get_balance`           | Read native token + USDC + optional extra balances for a wallet     |
| `crossmint_transfer_token`        | Send USDC (or any supported token) from a Crossmint wallet          |
| `crossmint_pay_x402_endpoint`     | Fetch an HTTP URL, handle its x402 payment challenge, return the paid response |

The killer tool is `crossmint_pay_x402_endpoint`. One call, any URL, any
MCP client. The agent handles the 402 parse, the wallet signing, the
on-chain confirmation, and the retry automatically.

## Why this exists

[lobster.cash](https://lobster.cash) is Crossmint's payment engine for AI
agents. It ships as a CLI (`@crossmint/lobster-cli`) that installs into
Claude Code, Cursor, and OpenClaw via the skills architecture. But a lot
of 2026's agent surface speaks MCP, not skills:

- **Claude Desktop** (Anthropic's desktop app)
- **Continue.dev** (IDE assistant)
- **Cline** (VS Code agent extension)
- **Codex CLI** (OpenAI's command-line agent)
- And everything else that has shipped against the MCP spec

`crossmint-wallets-mcp` is the MCP-native companion to lobster.cash —
same wallets, same payments, same chain, different transport. It is not
a replacement. It is the piece lobster.cash doesn't ship.

## Install

```bash
# Global install
npm install -g crossmint-wallets-mcp

# Or one-off via npx (recommended for MCP clients)
npx crossmint-wallets-mcp
```

Node.js ≥ 20 required.

## Configure

You need a **Crossmint server API key** with the following scopes:

- `wallets.create`
- `wallets.read`
- `wallets:transactions.create`
- `wallets:transactions.sign`
- `wallets:balance.read`

Create one at [crossmint.com/console](https://www.crossmint.com/console).

You also need a **server recovery signer secret** — any random 32+ char
string. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This secret is what lets the server recover wallets if the wallet was
created with a `type: "server"` recovery config. Keep it safe; losing it
means losing access to wallets created under it.

Copy `.env.example` to `.env` and fill in the values, OR use the
file-reference pattern if you want secrets to live outside the project
tree (useful for Docker secrets, Kubernetes secrets, or streaming
safety):

```bash
# Either inline:
CROSSMINT_API_KEY=sk_prod_...
CROSSMINT_RECOVERY_SECRET=...

# Or by reference:
CROSSMINT_API_KEY_FILE=/run/secrets/crossmint-api-key
CROSSMINT_RECOVERY_SECRET_FILE=/run/secrets/crossmint-recovery-secret

# Plus:
DEFAULT_CHAIN=solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Hook it up to Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` on Windows, or
`~/Library/Application Support/Claude/claude_desktop_config.json` on
macOS, and add:

```json
{
  "mcpServers": {
    "crossmint-wallets": {
      "command": "npx",
      "args": ["-y", "crossmint-wallets-mcp"],
      "env": {
        "CROSSMINT_API_KEY": "sk_prod_your_key_here",
        "CROSSMINT_RECOVERY_SECRET": "your_random_hex_here",
        "DEFAULT_CHAIN": "solana"
      }
    }
  }
}
```

Restart Claude Desktop. You should see the MCP indicator appear in the
chat input. Try asking Claude:

> *Create a Crossmint smart wallet on Solana with alias "my-demo".*

Claude will call `crossmint_create_wallet` and return the wallet
address plus a Solana explorer link. You can then ask:

> *Pay the x402 endpoint at http://my.example.com/paid-data from that
> wallet, max 0.1 USDC.*

Claude will call `crossmint_pay_x402_endpoint`, move the USDC on-chain,
and return the paid response.

## Hook it up to other MCP clients

### Continue.dev

In your `~/.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "crossmint-wallets-mcp"],
          "env": {
            "CROSSMINT_API_KEY": "sk_prod_...",
            "CROSSMINT_RECOVERY_SECRET": "...",
            "DEFAULT_CHAIN": "solana"
          }
        }
      }
    ]
  }
}
```

### Cline

In the Cline MCP settings panel (gear icon → MCP Servers), add:

- **Name:** `crossmint-wallets`
- **Command:** `npx`
- **Args:** `-y crossmint-wallets-mcp`
- **Env:** same three vars as above

### Codex CLI

In `~/.codex/config.toml`:

```toml
[mcp_servers.crossmint-wallets]
command = "npx"
args = ["-y", "crossmint-wallets-mcp"]

[mcp_servers.crossmint-wallets.env]
CROSSMINT_API_KEY = "sk_prod_..."
CROSSMINT_RECOVERY_SECRET = "..."
DEFAULT_CHAIN = "solana"
```

## Demo

The repo includes a standalone smoke test that exercises every tool
against Solana mainnet with real USDC. It:

1. Creates (or loads from cache) a Crossmint smart wallet
2. Reads its balances
3. Boots a local x402 paywall server (`demo/paywall-server.ts`)
4. Calls the paywall, handles the 402, signs + sends the payment via the
   Crossmint wallet, retries with the `X-PAYMENT` header
5. Re-reads merchant balances to confirm the transfer landed

Run it:

```bash
pnpm install
pnpm tsx demo/create-merchant-wallet.ts  # one-time: create a merchant wallet
pnpm demo
```

Expected output (abbreviated):

```
=== WALLET READY ===
chain:    solana
address:  4xHkMCaKVBGw4GtdpeKoNZhGFDMi1tMCJDvXvxUmL8hM
explorer: https://explorer.solana.com/address/4xHkMCaKVBGw4GtdpeKoNZhGFDMi1tMCJDvXvxUmL8hM
====================

=== PAYER BALANCES ===
  native   0.015 (decimals=9)
  usdc     2.000000 (decimals=6)
======================

[paywall] listening on http://localhost:4021/paid-data
[payX402Endpoint] paying 0.01 usdc to Fxr4...yqo on solana...
[payX402Endpoint] tx confirmed: KRjW2uK7LBioyyy1P3xcJTkpS2ibpCjBq1Ektnf4icL6GH25VnesoCGdQN7DbWYbbyjv9MxHoFrS3hsx7ZgkbEg
[paywall] 200 — payment verified

=== PAYMENT RESULT ===
status:    200
tx sig:    KRjW2uK7LBioyyy1P3xcJTkpS2ibpCjBq1Ektnf4icL6GH25VnesoCGdQN7DbWYbbyjv9MxHoFrS3hsx7ZgkbEg
======================

=== MERCHANT BALANCES ===
  usdc     0.01 (decimals=6)
=========================
```

The first successful mainnet tx from this repo's smoke test is pinned at
[`KRjW2uK7LBioyyy1P3xcJTkpS2ibpCjBq1Ektnf4icL6GH25VnesoCGdQN7DbWYbbyjv9MxHoFrS3hsx7ZgkbEg`](https://explorer.solana.com/tx/KRjW2uK7LBioyyy1P3xcJTkpS2ibpCjBq1Ektnf4icL6GH25VnesoCGdQN7DbWYbbyjv9MxHoFrS3hsx7ZgkbEg)
for anyone who wants to verify the claim on-chain.

## The Solana CPI nuance (and the companion skill)

Crossmint smart wallets on Solana are program-derived addresses (PDAs),
which means you **cannot** hand-roll a plain SPL token transfer to move
USDC out of one. The wallet PDA has no private key — only the Crossmint
wallet program can sign for it, via a cross-program invocation (CPI)
that wraps the SPL transfer as an inner instruction.

If you try to write the transaction directly, you will get "signer not
found" or "missing signature" errors and waste a day debugging it. The
high-level `Wallet.send()` method from the Crossmint SDK handles this
correctly — it builds a transaction that invokes the Crossmint wallet
program, which then CPIs into the SPL token program with the right
authority. `crossmint_transfer_token` and `crossmint_pay_x402_endpoint`
in this MCP server both use `wallet.send()` under the hood.

The companion repo
[`crossmint-cpi-skill`](https://github.com/0xultravioleta/crossmint-cpi-skill)
is a lobster.cash-compatible skill that teaches AI agents this nuance in
detail, including a working recipe, common errors, and guidance for
x402 facilitator authors who need to verify Crossmint payments via
inner-instruction parsing.

## Fees

Crossmint charges a small service fee (approximately 0.001 USDC per
`wallet.send` operation) for the gasless relayer — Crossmint pays the
Solana network fee for the transaction, and recovers the cost from the
payer wallet. Budget for this when setting `maxUsdcAtomic` guardrails on
`crossmint_pay_x402_endpoint`.

## Environment variables

| Variable                          | Required | Default                                      | Description                                             |
|-----------------------------------|----------|----------------------------------------------|---------------------------------------------------------|
| `CROSSMINT_API_KEY`               | yes*     | —                                            | Crossmint server API key                                |
| `CROSSMINT_API_KEY_FILE`          | yes*     | —                                            | Path to file containing the API key (alternative)      |
| `CROSSMINT_RECOVERY_SECRET`       | yes*     | —                                            | Server recovery signer (32+ char hex string)           |
| `CROSSMINT_RECOVERY_SECRET_FILE`  | yes*     | —                                            | Path to file containing the recovery secret            |
| `DEFAULT_CHAIN`                   | no       | `solana`                                     | `solana`, `base`, or `base-sepolia`                     |
| `SOLANA_RPC_URL`                  | no       | `https://api.mainnet-beta.solana.com`        | Solana RPC endpoint (override for private RPCs)        |

\* Exactly one of `CROSSMINT_API_KEY` or `CROSSMINT_API_KEY_FILE` is
required. Same for the recovery secret.

## License

MIT — so Crossmint can fork this repo into the `@crossmint` organization
with zero friction if they want to ship it as an official package.

## Acknowledgements

- [Crossmint](https://www.crossmint.com) for shipping the smart wallets
  and the `@crossmint/wallets-sdk` that makes this possible
- [lobster.cash](https://lobster.cash) for the skill architecture and
  the CLI that this MCP server is designed to complement
- [Faremeter](https://github.com/faremeter) for the x402 facilitator
  pattern that correctly handles CPI inner-instruction verification
- [The x402 foundation](https://x402.org) for the protocol and the
  `@x402/core` + `@x402/svm` reference implementation
- [The Model Context Protocol team](https://modelcontextprotocol.io)
  for the spec and the TypeScript SDK

## Companion artifact

- [`crossmint-cpi-skill`](https://github.com/0xultravioleta/crossmint-cpi-skill) —
  the lobster.cash skill that teaches the Solana CPI inner-instruction
  nuance this MCP server is built around
