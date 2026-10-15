# Provider Credentials Workbench — Overnight Quality Pass (feat/admin-workbench, Issue #91)

Record of the `ocr` passes and the bounded fixes applied on
`feat/admin-workbench` (stacked on `feat/r2-admin-api`, #90). Raw review
output is kept at `/tmp/ocr-wb-pass1.txt` and `/tmp/ocr-wb-pass2.txt`; the
architecture candidate list is rendered to
`/tmp/architecture-candidates-wb.html`.

## Phase 0 — sync

`origin/feat/r2-admin-api` had advanced five commits past the merge-base
(`0394f8c` → `f25aa7b`: its own OCR passes plus the collapsed D1 adapter and
single error-envelope refactors). Rebased `feat/admin-workbench` onto
`f25aa7b`. Conflicts were confined to `workers/src/endpoints/admin.ts`
(imports, 404 envelope) and `workers/src/endpoints/admin.test.ts` (one
insertion point); both sides were kept. The R2 add test
"add resolves the key id from the atomic batch" gained `accountId: "acct-1"`
because the workbench add path now requires a non-empty account id for
`cloudflare` keys (plan 004).

## Phase 1 — pass 1

Command: `ocr review --from origin/feat/r2-admin-api --to feat/admin-workbench`
Result: 4 findings across 8 reviewed items (round-2 was cancelled by an
interactive timeout; round 1 findings are complete).

### Finding 1 — `workers/src/utils/cors.ts:15` (bug, medium)

> The admin update/toggle endpoints use `PATCH`, but preflight responses omit
> it from `Access-Control-Allow-Methods`.

Triage: **real, in scope**. Fix: add `PATCH` to the shared CORS contract and
update `cors.test.ts`. Commit `fix(cors): allow PATCH in the preflight method
list (#91)`.

### Finding 2 — `workers/src/services/admin-store.ts:541-543` (bug, medium)

> Unlike `addProviderKey` and `rotateProviderKey`, this update/rotate path
> never calls `assertTokenLength` before sealing and persisting the token.

Triage: **real, in scope**. Fix: guard the token in `updateProviderKey` like
its siblings. A unit test asserts a 4097-char token is rejected before the
config bump.

### Finding 3 — `workers/src/services/admin-store.ts:551-558` (bug, medium)

> This rewrites every editable column using values from the earlier
> `keyRowFull` read, even when the caller omitted those fields. Concurrent
> partial updates can overwrite another request's newer values.

Triage: **real, in scope**. Fix: emit `UPDATE provider_keys` only for the
fields the caller supplied, so an omitted column is never written from a
stale read. A unit test records the committed statements and asserts only the
supplied column appears.

### Finding 4 — `workers/src/endpoints/frontend.ts:1219` (bug, medium)

> `provider_keys.label` is globally UNIQUE, but `nextLabel` only scans keys in
> the selected family, so adding the first key to a second family submits a
> duplicate label and fails with 409.

Triage: **real, in scope**. Fix: scan every key when picking the next
sequential default label. Commit `fix(frontend): derive the default key label
across all providers (#91)`.

Findings 2 and 3 landed together in `fix(admin): guard token length and write
only supplied fields on update (#91)`.

## Phase 3 — architecture pass

Explored per the `improve-codebase-architecture` skill (hot spots from
`git log`, `GLOSSARY.md` vocabulary, the deletion test). Candidate list
rendered to `/tmp/architecture-candidates-wb.html`.

| #   | Candidate                                                            | Strength        | Outcome                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | One home for the rotate ledger writes (`appendRotateWrites`)         | Strong          | **Implemented** — commit `refactor(admin): one home for the rotate ledger writes (#91)`. Both `rotateProviderKey` and the update-with-token path now share the revoke-then-insert order.          |
| B   | Extract the workbench script from the `frontend.ts` template literal | Worth exploring | Rejected this pass — a structural change to a served asset; no deployed target here to verify the UI (e2e not allowed). Recorded as the top follow-up; it is why both OCR passes found bugs here. |
| C   | The store owns the default key label                                 | Worth exploring | Rejected — changes the documented add contract (label required today) and the e2e surface; a contract change, not a bounded fix.                                                                  |
| D   | Extract the shared admin write preamble                              | Speculative     | Rejected — the three handlers differ enough that a helper relocates complexity rather than shrinking it (deletion test fails); R2 already centralised the envelope.                               |
| E   | Merge `KeyFields` with the store input types                         | Speculative     | Rejected — different seams; merging couples the transport parser to the store contract for a cosmetic gain.                                                                                       |

Only candidate A is behaviour-preserving and bounded; it is the sole Strong
candidate and is implemented. The workbench-script extraction (B) is the
highest-leverage follow-up.

## Phase 4 — pass 2

Command: `ocr review --from origin/feat/r2-admin-api --to feat/admin-workbench`
(after the Phase 2 fixes and the Phase 3 commit). Result: 4 findings across 8
reviewed items, all in the workbench script (`frontend.ts`); the four pass-1
findings are gone.

| Finding                                | Triage / outcome                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `api()` rejection escapes `loadHealth` | **real, in scope** — catch the fetch failure and surface it instead of an unhandled rejection.                         |
| Toggle `change` handler has no catch   | **real, in scope** — catch the failure and restore the checkbox state.                                                 |
| Stale `aria-checked` on the toggle     | **real, in scope** — update `aria-checked` on `change` and on restore.                                                 |
| Weight field not capped at 1,000,000   | **real, in scope** — reject values above the advertised maximum client-side (the server already caps at `MAX_WEIGHT`). |

All four landed in `fix(frontend): handle workbench fetch failures and weight
bounds (#91)`. They are frontend-behaviour fixes verified by `npm run check`
and `npm test` (the workbench script is a template literal, so the unit suite
covers it only through the DOM-id contract; runtime UI verification was not
possible — no deployed target and the e2e suite is out of scope).

### Delta

Pass 1 found 4 bugs (all fixed); pass 2 found 4 different bugs, every one in
the same template-literal script that resolver candidate B targets. Both
passes confirm the seam: the workbench script is the only part of the branch
without a real test surface. `npm run check` + `npm test` green throughout
(352 tests).
