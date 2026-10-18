---
name: verify-cloudflare-image-mcp
description: Launch and verify the Cloudflare Image MCP Worker locally (wrangler dev, local D1 + R2) and prove its HTTP API behavior — OpenAI-compatible /v1/* endpoints, /mcp* JSON-RPC endpoints, /api/admin/* two-gate admin API, auth gating — with captured curl evidence. Reach for this when a change to workers/src must be proven against a running instance, or when asked to verify, smoke-test, or demo this app end to end.
---

# Verify cloudflare-image-mcp (local Worker instance)

Drive the real Worker through its HTTP surface with `curl`. The instance runs
locally under `wrangler dev --local` with miniflare-emulated D1 + R2 and
**zero real credentials** — that empty-credential state is a designed,
ADR-001-documented condition, and several verifications below assert against
it. Nothing here makes a paid inference call.

## Launch

Run from the worktree root (the directory containing `workers/`).

```bash
VERIFY_PORT=8788 .agents/skills/verify-cloudflare-image-mcp/scripts/launch.sh
```

`launch.sh` must outlive the call that started it — launch it through the
agent's background-task facility (in pi: `bg_task action="start"` with that
command), or in a terminal you keep open. It then:

1. refuses to start if `VERIFY_PORT` (default **8788**) is already listening;
2. copies `workers/wrangler.toml.example` → `workers/wrangler.toml` and
   `workers/.dev.vars.example` → `workers/.dev.vars` (only if missing —
   existing local config is never overwritten);
3. applies `wrangler d1 migrations apply PROVIDER_DB --local` (8 commands,
   idempotent) so the provider store schema exists from an empty data dir;
4. records `{pid, port, startedAt}` in `.verify/instance.json`;
5. `exec`s `wrangler dev --local --port $VERIFY_PORT` in the foreground.

Ready means usable, not just listening: the log prints
`Ready on http://localhost:VERIFY_PORT` **and** `GET /health` returns
`{"status":"healthy", ... "authEnabled":true}`. A database health check can
pass while migrations still run — do not skip the /health probe.

Port 8788 is the default, not wrangler's 8787, because parallel worktrees in
this repo routinely hold 8787; if 8788 collides too, pick another free port
and export `VERIFY_PORT`.

## Doctor

Run first whenever anything looks off, and before trusting a running instance.

```bash
VERIFY_PORT=8788 .agents/skills/verify-cloudflare-image-mcp/scripts/doctor.sh
```

One read-only pass, all checks must print `ok`:

- **Ownership** — the pid in `.verify/instance.json` is alive and its cmdline
  is `wrangler dev`. This instance was started by this verification run; a
  same-port listener without our pidfile is a foreign instance (see Gotchas).
- **Ready + version** — `/health` returns `status:healthy` and `version`
  matches `workers/package.json`'s `version`.
- **Auth gate armed** — `/v1/models` without a key returns `401`; with
  `local-dev-user-key` returns `200`.
- **Empty-credential path** — an authenticated
  `POST /v1/images/generations` returns the ADR-001 error naming
  `cloudflare-rest`. This is expected on a fresh local store and proves both
  that the generator ran and that no foreign credential source leaked in.

## Drive

Harness: `curl` against `http://127.0.0.1:$VERIFY_PORT`. Real handles only:

| Surface       | Route                                                                  | Auth                                              |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| Health        | `GET /health`                                                          | none                                              |
| OpenAI models | `GET /v1/models`                                                       | `Authorization: Bearer local-dev-user-key`        |
| OpenAI images | `POST /v1/images/generations` \| `edits` \| `variations`               | bearer                                            |
| MCP           | `POST /mcp`, `/mcp/message`, `/mcp/smart`, `/mcp/simple?model=@cf/...` | bearer                                            |
| Admin API     | `GET/POST/PATCH /api/admin/keys[...]`, `GET /api/admin/health`         | bearer **and** `X-Admin-Key: local-dev-admin-key` |
| Frontend      | `GET /`, `GET /admin`                                                  | none                                              |

MCP responses are SSE frames: send
`Accept: application/json, text/event-stream` and unwrap the first
`data: {...}` line.

The full battery (every route above, 401/403 matrix included) is one command:

```bash
VERIFY_PORT=8788 .agents/skills/verify-cloudflare-image-mcp/scripts/drive.sh
```

Per-feature recipes and proof standards live in `features/`. Drive the mapped
feature you need; a proof that exercises one route is incomplete when the map
lists other entry points for the same feature.

## Evidence

Every run writes to `evidence/verify/<run-id>/` at the worktree root
(gitignored — proofs are local artifacts, never committed):

- `battery.txt` — full drive.sh transcript: command, status, body per probe.
- `doctor.txt` — save the doctor transcript from the same run:
  `VERIFY_PORT=8788 .agents/skills/verify-cloudflare-image-mcp/scripts/doctor.sh | tee evidence/verify/<run-id>/doctor.txt`.
- Agent-captured extras (e.g. `GET /` HTML snapshot) go in the same dir.

Proof standards: exercise the real HTTP routes, not internal setters or
test-only endpoints; capture the action (request line + status) **and** the
resulting state (response body, admin read-back after a write); verify side
effects (D1 row visible through a second authenticated read) alongside what
the response claims. The zero-secret instance is not a mock — it is the real
Worker with an empty credential store; when a journey needs success-path
inference, report the missing precondition instead of faking it.

## Cleanup

```bash
.agents/skills/verify-cloudflare-image-mcp/scripts/cleanup.sh
```

Reads `.verify/instance.json` and kills **only** that recorded pid, after
confirming its cmdline still is `wrangler dev` — never kill by process name:
other worktrees run their own instances. Then removes
`.verify/instance.json` and confirms the port no longer listens. It never
touches `evidence/verify/`, `workers/.wrangler/state/` (local D1/R2 data
survives for the next run), or the copied `wrangler.toml`/`.dev.vars`.

Order matters for a tracked launch: this sandbox only allows signaling your
own descendants, so a pid launched through `bg_task`/pueue returns EPERM to
cleanup.sh. Kill the tracking task first (`bg_task action="kill" id=...`),
then run cleanup.sh — it will find the pid gone, verify the port is down,
and clear the pidfile. cleanup.sh says exactly this and exits non-zero if
it cannot signal, instead of pretending the instance stopped.

## Helpers

All executable, all shown above; run them from the worktree root with
`VERIFY_PORT` exported when overriding the port:

- `scripts/launch.sh` — guarded launch (port check, templates, migrations,
  pidfile, server in foreground).
- `scripts/doctor.sh` — read-only instance health/ownership/auth probe.
- `scripts/drive.sh` — full HTTP battery, evidence-capturing.
- `scripts/cleanup.sh` — kill-by-recorded-pid teardown, evidence-preserving.

## Gotchas

- **Never drive an instance you did not launch.** This repo runs one
  worktree per feature; a listener on the default port may be another
  session's server with seeded (real) credentials, and its 200s — even
  successful image generations — prove nothing about your instance. The
  doctor's ownership check exists for exactly this.
- `npm run dev:local` pins port 8787; when using it directly, check the port
  first and prefer `launch.sh` with `VERIFY_PORT`.
- `wrangler dev --remote` (the `dev` npm script) targets real Cloudflare
  resources and needs real tokens. Never use it for verification.
- Inside the nono sandbox, requests to the production alias
  `image.tanyongsheng.qzz.io` carry an injected `Authorization` header; an
  in-sandbox 200 there never proves an open gate (CONTRIB.md,
  "Sandbox credential injection vs live auth").
- `e2e/` Playwright suites target deployed backends; the local instance is
  not wired into them (`TEST_TARGET` knows only staging/production).
