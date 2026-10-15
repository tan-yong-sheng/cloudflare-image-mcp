# R2 Admin API — Overnight Quality Pass (PR #90, Issue #74)

Record of the open-code-review (ocr) passes and the bounded fixes applied on
`feat/r2-admin-api`. Raw review output is kept at `/tmp/ocr-r2-pass1.txt`
and `/tmp/ocr-r2-pass2.txt`.

## Pass 1 (baseline)

Command: `ocr review --from origin/main --to feat/r2-admin-api`
Result: 2 findings across 7 reviewed items.

### Finding 1 — `workers/src/services/admin-store.ts` (bug, medium)

> The write has already committed at this point, so returning 500 makes the
> caller believe the add failed; retrying then returns a duplicate-label 409
> for a key that was actually created.

Triage: **real, in scope**. Fix: resolve the new key id _inside_ the atomic
commit instead of a read-your-write round trip afterwards. `AdminD1.commit`
now returns `AdminCommitResult { keyId }`, populated from the engine's
inserted row id (D1 `meta.last_row_id`; node:sqlite `lastInsertRowid` in the
S2 harness). The post-commit `SELECT` stays only as a fallback for an engine
that reports no row id, so a failure there can no longer masquerade as a
failed mutation.

### Finding 2 — `workers/src/endpoints/admin.ts` (performance, medium)

> Admin add/rotate bodies are read and parsed with no size bound, and
> apiToken has no maximum length before sealing. Enforce a request/token size
> limit before parsing or sealing (including when Content-Length is absent).

Triage: **real, in scope**. Fix: `readBoundedBody` caps the read at
`MAX_ADMIN_BODY_BYTES` (16 KiB), short-circuiting on `Content-Length` and
byte-counting the reader stream so an absent or understated header cannot
smuggle a large body past JSON parsing and sealing (413 on overflow). The
store bounds `apiToken` at `MAX_API_TOKEN_LENGTH` (4096) before sealing.

## Pass 2

Recorded in the Iteration Log; findings delta and rejections below.
