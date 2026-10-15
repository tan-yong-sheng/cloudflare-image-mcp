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

## Phase 3 — architecture pass

Explored per the `improve-codebase-architecture` skill: hot spots from
`git log --oneline` (the admin API is the branch's centre of gravity),
the `GLOSSARY.md` vocabulary, the deletion test, and shallow-module
friction. Candidate list rendered to
`/tmp/architecture-candidates-r2.html`.

| #   | Candidate                                                                 | Strength        | Outcome                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Collapse the pass-through D1 adapter (`d1AdminStore`'s `wrap`)            | Strong          | **Implemented**                                                                                                                                                                              |
| B   | Single error-envelope constructor in `admin.ts`                           | Strong          | **Implemented**                                                                                                                                                                              |
| C   | Centralize the bump + audit mutation invariant                            | Worth exploring | Rejected — audit SQL differs (add uses a UNIQUE-label subselect); a combinator would widen the `AdminWrite` seam the objective says to keep intact. Revisit only if a fourth mutation lands. |
| D   | Tighten `AdminCommitResult.keyId` to non-null, drop the post-commit retry | Speculative     | Rejected — iteration 1 kept the read as a belt-and-braces guard; tightening the field changes the `AdminCommitResult` seam contract, so it is not behaviour-identical.                       |
| E   | Extract `getAdminHealth` row mappers                                      | Speculative     | Rejected — relocates complexity without removing it and tests past the real seam.                                                                                                            |
| F   | Move HTTP statuses out of `AdminStoreError`                               | Speculative     | Rejected — a domain-error hierarchy grows the interface; the one-line `storeError` map already has the right locality.                                                                       |

Both Strong candidates are behaviour-preserving. A deletes a shallow
adapter (the deletion test says complexity vanishes) and adds the served
path's first direct test over a D1-shaped engine; B names the OpenAI
error envelope once. Two commits, `npm run check` + `npm test` green
(337 tests).

## Pass 2

Recorded in the Iteration Log; findings delta and rejections below.
