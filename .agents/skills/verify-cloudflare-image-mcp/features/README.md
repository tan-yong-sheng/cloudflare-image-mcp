# Cloudflare Image MCP verification map

This directory is the maintained source for verifying the user-facing behavior
of the Cloudflare Image MCP Worker. Read the index before driving the app,
then use the matching feature file as the recipe.

## Baseline preconditions

- Launch from the worktree root via
  `.agents/skills/verify-cloudflare-image-mcp/scripts/launch.sh` (run through
  a background-task facility or a kept-open terminal) with `VERIFY_PORT` set
  to a free port (default 8788).
- Run `.agents/skills/verify-cloudflare-image-mcp/scripts/doctor.sh` and
  require every check to print `ok`: instance ownership, `/health` healthy +
  version match, 401/200 auth gate, ADR-001 empty-credential error.
- Bearer key for the whole run: `local-dev-user-key` (from the copied
  `.dev.vars`). Admin management key: `local-dev-admin-key`.
- Never drive an instance that was not started by this verification run —
  other worktrees in this repo run their own servers, sometimes with seeded
  real credentials.

## Driving conventions

- Harness is `curl` against `http://127.0.0.1:$VERIFY_PORT`; every command in
  the feature files is literal — keep paths, headers, and JSON unchanged.
- MCP routes need `Accept: application/json, text/event-stream`; responses
  arrive as SSE frames and the proof is the `data: {...}` line.
- Admin writes use a throwaway key and are read back through a second
  authenticated GET; the repo's `scripts/verify-admin-api.sh` already encodes
  that loop and is the drive recipe for the admin feature.
- Capture the request line and status **and** the response body for every
  claim; write artifacts to `evidence/verify/<run-id>/`.
- This instance has an intentionally empty credential store. Journeys that
  need success-path inference report the unmet precondition (seed provider
  credentials via the admin API with a real Cloudflare token) — never fake,
  skip, or weaken the journey to make it pass.

## Proof and skip reporting

- Capture the action and the resulting state, not only the final response.
- Mutation proof includes a read-only second view of the stored value.
- Report an unreachable path with the attempted command and the unmet
  precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the
user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with curl` starts with `Preconditions:` and uses labeled
   bullets that pair each user action with an exact command and observable
   result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Model listing and auth gate](./model-listing.md) covers the discovery API,
  bearer gating, and the unauthenticated 401 contract.
- [Image generation](./image-generation.md) covers OpenAI-compatible
  generations, edits, and variations, including the empty-credential error
  contract and the seeded success path.
- [MCP endpoints](./mcp-endpoints.md) covers the streamable-HTTP MCP surface:
  initialize, tools listing, and the three mount modes.
- [Admin key management](./admin-key-management.md) covers the two-gate
  `/api/admin/*` API: health, key create/rotate/disable/update/delete with
  read-back proof.
