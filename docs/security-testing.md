# Security testing with Strix

[Strix](https://github.com/usestrix/strix) is an open-source AI penetration testing tool.
It runs autonomous agents in Docker containers that read the code, exercise the running
app, and validate each finding with a proof-of-concept.

This repo is wired up for it:

| Path | What it is |
| --- | --- |
| [.strix/instructions.md](../.strix/instructions.md) | Scope, rules of engagement, and the ranked list of areas to test |
| [scripts/strix-scan.ps1](../scripts/strix-scan.ps1) | Wrapper with preflight checks and target presets |
| `strix_runs/` | Scan output (gitignored) |

## One-time setup

1. **Docker** — Strix runs each agent in a container, so Docker Desktop must be
   installed and running. It is not currently installed on this machine.
2. **Strix** — the installer is a shell script, so on Windows install it inside WSL:

   ```bash
   wsl
   curl -sSL https://strix.ai/install | bash
   ```

   The wrapper script finds `strix` either natively on `PATH` or inside WSL.
3. **LLM credentials** — add these to `.env.local` (already gitignored); the wrapper
   loads them automatically:

   ```
   STRIX_LLM=anthropic/claude-opus-5
   LLM_API_KEY=sk-ant-...
   ```

   Or sign in with a ChatGPT subscription instead: `strix auth login chatgpt`.

## Running a scan

```powershell
npm run security:scan          # source tree - read-only, safe, start here
npm run security:scan:quick    # same, faster/shallower pass
npm run security:scan:diff     # only what changed vs main - good for pre-merge
npm run security:scan:local    # http://localhost:3000 (build + start the app first)
```

Review findings afterwards with `strix view`.

### Scanning production

`scripts/strix-scan.ps1 -Target prod -Authorised`

The `-Authorised` switch is deliberate friction. A live scan is an active penetration
test, and census2art's order endpoints are unauthenticated and reach Prodigi — a real
print vendor that charges real money and ships physical products. An agent probing
`POST /api/orders/{id}` on production can place genuine orders. Prefer scanning the
source tree and a local instance; only scan production knowingly, and check the Prodigi
dashboard afterwards.

`.strix/instructions.md` tells the agents not to place real orders and keeps Supabase,
Shopify, and Prodigi themselves out of scope, but those are instructions, not
guarantees.

## What the instructions prioritise

The instruction file is where project knowledge lives, and it is worth keeping current
as the app changes. Today it points the agents at:

1. **Order authorization** — `GET`/`POST /api/orders/[id]` are unauthenticated, so the
   order id is the only secret; plus a TOCTOU race on the `status === "pending"` guard.
2. **Webhook authentication** — the Prodigi callback authenticates on a secret in the URL
   path, and both webhooks compare secrets with `===` rather than a timing-safe compare.
3. **Genealogy PII endpoints** — the surname/household/census routes return real personal
   records with no auth or rate limiting.
4. **Geometry endpoints** — SSRF and path traversal in the map/polygon routes.
5. **Client-side and platform** — XSS through the SVG render path, headers, CORS, and
   secrets leaking into the client bundle.

This complements, rather than replaces, the `/security-review` skill listed in
[AGENTS.md](../AGENTS.md): that reviews a diff by reading it, Strix attacks the running
application.
