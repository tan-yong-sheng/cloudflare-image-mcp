---
name: verify-cloudflare-image-mcp
description: Launch and verify the Cloudflare Image MCP Worker locally (wrangler dev, local D1 + R2) and prove its HTTP API behavior — OpenAI-compatible /v1/* endpoints, /mcp* JSON-RPC endpoints, /api/admin/* two-gate admin API, auth gating — with captured curl evidence. Reach for this when a change to workers/src must be proven against a running instance, or when asked to verify, smoke-test, or demo this app end to end.
---

# Verify cloudflare-image-mcp (local Worker instance)

Drive the real Worker through its HTTP surface with `curl`. The instance runs
locally under `wrangler dev --local` with miniflare-emulated D1 + R2 and
**zero real credentials** — that empty-credential state is a designed,
ADR-001-documented condition, and several verifications below assert against
it. Nothing here makes a paid inference call: the probes that would need a
credential run only when the store reports it has none (see Doctor).

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
3. applies `wrangler d1 migrations apply PROVIDER_DB --local
--persist-to .verify/state` (8 commands, idempotent) against **this
   instance's own** persistence dir, so verification never reads or writes the
   shared `workers/.wrangler/state/` store — a key seeded there by hand cannot
   turn a verification probe into a real provider call;
4. records `{pid, port, startedAt}` in `.verify/instance.json`;
5. `exec`s `wrangler dev --local --port $VERIFY_PORT --persist-to .verify/state`
   in the foreground.

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

One read-only pass. Every check prints `ok`, or `fail` (which sets the exit
code); a check that cannot run safely prints `skip` and does not fail the run.
Nothing is probed until ownership is established:

- **Ownership** — the pid in `.verify/instance.json` is alive, is a
  `wrangler dev`, and still carries the recorded `--port`. This instance was
  started by this verification run; a same-port listener without our pidfile,
  or a pid recycled by another worktree's server, is a foreign instance (see
  Gotchas). A pidfile that records no usable port fails this check as well:
  without the port there is nothing tying the pid to this instance. When this
  check fails, doctor prints `skip` for the HTTP probes and exits non-zero
  instead of probing a target it cannot vouch for.
- **Ready + version** — `/health` returns `status:healthy` and `version`
  matches `workers/package.json`'s `version`.
- **Auth gate armed** — `/v1/models` without a key returns `401`; with
  `local-dev-user-key` returns `200`.
- **Empty-credential path** — an authenticated
  `POST /v1/images/generations` returns the ADR-001 error naming
  `cloudflare-rest`. This is expected on a store with no servable credential
  and proves both that the generator ran and that no foreign credential source
  leaked in. It runs **only** when the store is proven to hold no servable
  credential: the check reads the live key rows from `/api/admin/health` (any
  enabled row with weight > 0 refutes emptiness) and not merely
  `hasServableCredential`, which is served from the pool cache behind a 5s TTL
  and therefore still reads `false` for a credential enabled a moment ago. With
  a servable credential the POST would reach the provider and spend real usage,
  so doctor prints `skip` instead and says how to get back to a fresh store
  (delete the key, or drop `.verify/state`).

## Drive

Harness: `curl` against `http://127.0.0.1:$VERIFY_PORT`. Real handles only:

| Surface       | Route                                                                             | Auth                                              |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| Health        | `GET /health`                                                                     | none                                              |
| OpenAI models | `GET /v1/models`                                                                  | `Authorization: Bearer local-dev-user-key`        |
| OpenAI images | `POST /v1/images/generations` \| `edits` \| `variations`                          | bearer                                            |
| MCP           | `POST /mcp`, `/mcp/message`, `/mcp/smart`, `/mcp/simple?model=@cf/...`            | bearer                                            |
| Admin API     | `GET /api/admin/health`, `POST /api/admin/keys[...]`, `PATCH /api/admin/keys/:id` | bearer **and** `X-Admin-Key: local-dev-admin-key` |
| Frontend      | `GET /`, `GET /admin`                                                             | none                                              |

MCP responses are SSE frames: send
`Accept: application/json, text/event-stream` and unwrap the first
`data: {...}` line.

The full battery (every route above, 401/403 matrix included) is one command:

```bash
VERIFY_PORT=8788 .agents/skills/verify-cloudflare-image-mcp/scripts/drive.sh
```

`drive.sh` refuses to run at all unless `.verify/instance.json` describes a
live `wrangler dev` on `$VERIFY_PORT`. The admin section of the battery writes
— it creates, rotates and disables a throwaway key — so it must never run
against a listener this worktree did not launch.

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
confirming its cmdline still is a `wrangler dev` on the recorded port — never
kill by process name, and never kill a pid that another worktree's server has
since recycled. Then removes
`.verify/instance.json` and confirms the port no longer listens. Both the
pre-kill identity check and the post-kill listener check fail closed: a pidfile
without a usable port, a pid that is no longer a `wrangler dev`, and a host
carrying none of `ss`/`lsof`/`netstat` all refuse and leave the pidfile in
place rather than report an instance as stopped without proof. It never
touches `evidence/verify/`, the instance's own `.verify/state/` store (local
D1/R2 data survives for the next run), or the copied
`wrangler.toml`/`.dev.vars`.

Order matters for a tracked launch: this sandbox only allows signaling your
own descendants, so a pid launched through `bg_task`/pueue returns EPERM to
cleanup.sh. Kill the tracking task first (`bg_task action="kill" id=...`),
then run cleanup.sh — it will find the pid gone, verify the port is down,
and clear the pidfile. cleanup.sh says exactly this and exits non-zero if
it cannot signal, instead of pretending the instance stopped.

## Helpers

All executable and shown above, except `lib.sh`, which the others source; run
them from the worktree root with `VERIFY_PORT` exported when overriding the
port. They need `curl`, `node` (already required by the workers toolchain),
`ps`, and at least one of `ss`/`lsof`/`netstat` — with none of those three the
port checks report "cannot tell" and the scripts refuse rather than guess:

- `scripts/launch.sh` — guarded launch (port check, templates, migrations,
  pidfile, server in foreground).
- `scripts/doctor.sh` — read-only instance health/ownership/auth probe.
- `scripts/drive.sh` — full HTTP battery, evidence-capturing.
- `scripts/cleanup.sh` — kill-by-recorded-pid teardown, evidence-preserving.
- `scripts/lib.sh` — sourced, never executed: `port_in_use` (ss → lsof →
  netstat, else "cannot tell") and `instance_problem` (the shared ownership
  check). Both fail closed, so launch, doctor, drive and cleanup refuse a
  target they cannot prove is theirs.

## Gotchas

- **Never drive an instance you did not launch.** This repo runs one
  worktree per feature; a listener on the default port may be another
  session's server with seeded (real) credentials, and its 200s — even
  successful image generations — prove nothing about your instance. Doctor's
  and drive.sh's ownership check exists for exactly this; both refuse a target
  they cannot vouch for instead of probing it.
- A stale `.verify/instance.json` — one whose pid is gone, recycled, or on a
  port this run is not using — is replaced by the next `launch.sh`, which says
  so and signals nothing. `cleanup.sh` goes the other way and refuses to act on
  any record it cannot verify (including one with no usable port), because
  confirming the port is down is the only proof it can offer that an instance
  stopped; re-run `launch.sh` to get past a record like that.
- `VERIFY_PORT` must be a numeric TCP port: `launch.sh` refuses a non-numeric or
  out-of-range value before it copies templates or runs migrations, because the
  pidfile is written before wrangler binds.
- Requests use the placeholder keys published in `workers/.dev.vars.example`
  (`local-dev-user-key` / `local-dev-admin-key`) — published values, not
  secrets. When a worktree's `.dev.vars` has been customised, export
  `VERIFY_API_KEY` / `VERIFY_ADMIN_KEY` for `doctor.sh` and `drive.sh` rather
  than editing the scripts.
- The instance's store is `.verify/state/`, not `workers/.wrangler/state/`.
  It survives across verification runs, so a key added by an earlier battery is
  still there as a disabled row; that is why the empty-credential probes prove
  emptiness from the live key rows instead of assuming a fresh database.
- `hasServableCredential` in `/api/admin/health` is not a live reading: it comes
  from the provider-pool snapshot, which is version-polled behind a 5s TTL,
  while the `keys` array beside it is a live D1 read. A credential enabled
  seconds ago is therefore already in `keys` while the flag still says `false`
  — never treat the flag on its own as proof that the store is empty.
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
