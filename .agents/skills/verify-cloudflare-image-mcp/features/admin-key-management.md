# Admin key management

The admin API manages the provider-credential store (which real Cloudflare
accounts feed inference) behind two gates: the app-wide bearer key, then a
management key (`X-Admin-Key`). It is the only way credentials enter the
system (ADR-001: database-only). Writes are audited; tokens are sealed, never
echoed.

## Sub-features

- `admin-health` reports pool counts, key labels, and readiness — no writes.
- `admin-key-lifecycle` creates, updates, rotates, disables, and deletes
  throwaway provider keys with read-back.
- `admin-gating` enforces the 401 (bearer) → 403 (admin key) ladder on every
  route.

## How to get to it (user POV)

- The `/admin` page in a browser (form UI over this same API).
- Direct HTTP by an operator with both keys.

## Driving it with curl

Preconditions:

- Doctor prints all `ok`; keys `local-dev-user-key` (bearer) and
  `local-dev-admin-key` (X-Admin-Key).
- The repo already ships the full contract cross-check — this feature's
  drive recipe is that script.

- **Contract battery (reads + writes).** `BASE_URL=http://127.0.0.1:$VERIFY_PORT API_KEY=local-dev-user-key ADMIN_KEY=local-dev-admin-key WRITES=1 scripts/verify-admin-api.sh`.
  Exit `0`; the script
  checks the 401/403 ladder, creates a `crosscheck-<epoch>` key, rotates,
  disables, reads back, and deletes it. Every response body is grepped for
  secret leakage.
- **Gate ladder by hand (spot check).** `curl -s -o /dev/null -w '%{http_code}\n' $B/api/admin/health` → `401`; add `-H "Authorization: Bearer local-dev-user-key"` → `403`; add `-H "X-Admin-Key: local-dev-admin-key"` → `200` with pool counts.
- **Read-back after write.** After the script's create step (or your own
  `POST /api/admin/keys`), `GET /api/admin/keys` with both keys lists the
  key by label and identity — never by token value. A leaked token in any
  response body is a failure, not a documentation note.
- **Proof.** The script's transcript plus the `GET /api/admin/keys` body go
  to `evidence/verify/<run-id>/admin.txt` (drive.sh already appends the
  script transcript to battery.txt).

## Gotchas

- Both gates always apply: a correct bearer with a wrong admin key is `403`,
  not `401` — asserting the wrong code hides a real regression.
- Provider tokens are sealed with `PROVIDER_DATA_KEY`; rows sealed with one
  environment's key cannot be opened by another. Do not reuse the
  `local-dev-*` seal key outside local dev.
- The verification instance's store starts empty; the script's throwaway key
  uses a synthetic token — never seed a real Cloudflare token unless the task
  explicitly needs the generation success path.
- Deletion is a hard delete (key + versions, audited); on this throwaway
  local store that is safe and intended.
