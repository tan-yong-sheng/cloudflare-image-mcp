# Gateway / Management API Key Management (D1-backed, client UI)

Written against: current `main` — no branch yet. Prototype of record: none (first cut).
Related: `design-plans/004-provider-credentials-workbench.md` (provider keys, separate concern), `design-plans/005-full-page-admin-workbench.md` (admin view navigation).

## Evidence chain

- Surface: OpenAI-compatible `/v1/*` and MCP `/mcp*` routes are gated by `env.API_KEYS` (`workers/src/middleware/auth.ts`): `Authorization: Bearer <token>` split-and-compare against `env.API_KEYS.split(',').map(trim)`. The client's management key is memory-only — never `sessionStorage`/`localStorage`/cookie (`AGENTS.md`, `client/src/components/Auth/LoginDialog.tsx`).
- Problem: `API_KEYS` is an env var. Rotating, revoking, or adding a key requires a redeploy and a secret update. Operators cannot view, name, disable, or rotate management keys from the client UI; there is no key list, no masked-value surface, no copy-to-reveal, and no per-key state. `POST /api/admin/keys/:id/rotate` and `.../disable` exist only for provider keys (workbench), not for management keys.
- Design evidence: magpie (`yetone/magpie`) gateway/caller-key UX — masked keys (`sk-magpie-…` + last 6 for generated, `…` + last 4 for user-supplied), copy-to-reveal via a dedicated endpoint, per-key enable/disable toggle, inline rename, confirmation modals for rotate/remove ("clients using {name} will need the new key"), per-key limits (token/cost, day/week/month/custom), status toasts (`ok`/`err`), auto-refresh while visible. The project's own workbench (004/005) provides the modal/backdrop, `btn`/`btn-primary`/`btn-secondary`, FontAwesome icons, and the memory-only management-key invariant to preserve.
- Schema facts (unverified — no caller-keys table exists yet): none. A new D1 table is required (`caller_keys`: `id, name, secret_hash, prefix, suffix, enabled, created_at, updated_at`). The full secret is never stored reversibly — store a keyed verifier (HMAC-SHA256, pepper from `PROVIDER_DATA_KEY`) and return the plaintext only once, at creation or rotation. No reveal endpoint: a one-way verifier cannot reproduce a secret that was never stored.
- Owner: `client/src` (UI), `workers/src/endpoints/admin.ts` + `workers/src/services/admin-store.ts` (routes/store), `workers/src/middleware/auth.ts` (auth gate, unchanged).
- Contract tests: `workers/src/index.test.ts`, `workers/src/endpoints/admin.test.ts`, `e2e/tests/api/admin.spec.ts` (401/403/200 + secret non-leakage), `npm --prefix client test`.

## Design decision

1. **Two key kinds stay distinct.** Management keys (gate `/v1/*` + `/mcp*`) and provider keys (workbench table, 004) are not merged. This spec adds management-key CRUD only. Provider keys remain out of scope.
2. **Management keys persist in D1**, not `API_KEYS` env. `API_KEYS` stays as the transition path (Q1, decided): a request authenticates if it matches ANY enabled D1 caller key OR any `API_KEYS` env value. The env-only path is deprecated once D1 rows exist; retiring it is a follow-up ticket, not part of this slice.
3. **Auth gate unchanged.** The new `/api/admin/caller-keys/*` routes sit behind the existing two gates (`requiresAuth` + `authenticateRequest` against `env.API_KEYS`/`n` header), same as other `/api/admin/*` routes. No new auth scheme.
4. **Secret handling.** List endpoint returns masked values only (`sk-mgmt-…` + last 4 for generated keys; `…` + last 4 for user-supplied). Plaintext is returned exactly once, in the `201 Created` response at creation and in the rotate response — it is never stored. A caller key is only ever COMPARED, never opened, so it is stored as a verifier rather than an envelope: hex `HMAC-SHA256(pepper, secret)`, where the pepper is derived from `PROVIDER_DATA_KEY` (a Worker secret, never in D1). A D1 dump alone therefore cannot be brute-forced against the rows, and the deterministic verifier can be looked up through an index. **No reveal endpoint**: a one-way verifier cannot reproduce a secret that was never stored. If a key is lost, rotate it. (`cf.` magpie's `caller-keys.json` — 0600, atomic write, masked list, copy-key — stores secrets reversibly, which is why it can offer copy-key; this Worker cannot.)
5. **Per-key state:** enabled toggle (disable without deleting), name (rename), created-at, last-used-at (best-effort, updated lazily). No per-key rate/request limits in Slice 1 (magpie has them; this project's admin surface doesn't yet — deferred, see Open questions).
6. **Client UI** (React SPA, Vite + Tailwind + TanStack Query, per `AGENTS.md`): admin key-management view following the 005 full-page admin pattern (`/#admin` hash view or a dedicated admin route), with:
   - Unlock gate: management-key input (memory-only, cleared on close/logout/navigate away) — preserves the zero-persistence invariant.
   - Key list: rows with enable/disable switch, name, masked value, actions menu (Rotate / Remove). No copy-reveal button: the plaintext is shown once, in the create/rotate response the operator just received.
   - Add-key form: name + optional "your own key" password (eye toggle, `autocomplete="new-password"`, `data-1p-ignore`); empty → server generates `sk-mgmt-<24 hex>`.
   - Confirmation modals for rotate (new secret; clients using this key need it) and remove (clients lose access; history kept).
   - `ok` (success `#10b981`) / `err` (error `#ef4444`) toasts, auto-dismiss ~1.5–2.5s.
   - No `innerHTML` on untrusted store data (`textContent` only).
7. **Rotate semantics:** rotation creates a new version; the old secret stops authenticating immediately (revoke-before-insert pattern). The key's id/name/enabled state are preserved. Response returns the new plaintext once.
8. **Validation (hand-rolled, no zod for this surface):** name 1–120 chars; user-supplied secret 8–256 chars, printable ASCII, no spaces, cannot start with `sk-mgmt-` (reserved prefix), must be unique across enabled+disabled keys. Weight/not-applicable (management keys have no weight).
9. **Errors:** standard envelopes — 400 validation (`{ error:'Unauthorized', message }` shape for auth, `400 { error:{message,type:'invalid_request_error',code:null}}` style for validation is not used here; keep `{ error:{message} }` or match existing admin.ts style), 403/404/409, 500. Admin routes return HTTP 200 for JSON-RPC? No — `/api/admin/*` is plain JSON, not MCP JSON-RPC (per CODING_STANDARDS, MCP/JSON-RPC is always HTTP 200; `/api/admin/*` is not MCP). Use the Worker top-level style (`{ error:'Unauthorized', message }` + `WWW-Authenticate: Bearer` for 401; `{ error:{message,type:'invalid_request_error',code:null}}` for 400).

## Open questions (decisions needed before implement)

- **Q1: `API_KEYS` fallback once D1 has rows.** Auth currently consults `env.API_KEYS`. If D1 is authoritative after seed, do we stop consulting `env.API_KEYS`? Recommendation: keep consulting it as an OR (a request authenticates if it matches ANY D1-enabled key OR any `API_KEYS` env value) during a transition window, then deprecate. State the chosen behavior in the impl ticket.
- **Q2: Hash storage — decided.** Keyed verifier, not a stored salt: `secret_hash = HMAC-SHA256(pepper, secret)` (hex) with the pepper derived from `PROVIDER_DATA_KEY`. `crypto.subtle` provides the HMAC, so no WASM dependency is needed. Consequences: no `secret_salt` column, no salt in D1, and a deterministic verifier the auth path can look up by index.
- **Q3: last_used_at.** Updating it on every authenticated request adds a write to the hot path. Recommendation: lazy/best-effort (update asynchronously or on a TTL), or omit in Slice 1. Decide in impl.
- **Q4: per-key limits.** Magpie has token/cost + day/week/month/custom limits per gateway key. This project has no usage metering on management keys yet. Deferred to a follow-up issue; the D1 schema should reserve space (`limit_json`, `limit_reset_at`) so Slice 2 doesn't need a migration.

## Existing endpoint fate

- `authenticateRequest` (`middleware/auth.ts`): **unchanged** in Slice 1 (still `env.API_KEYS` split-and-compare). Q1 decides whether D1 rows are consulted here too.
- No management-key rotation/disable endpoints exist today — nothing to preserve or deprecate.
- `/api/admin/health`: may be extended to return key counts (enabled/disabled/total) without secrets — optional, not required for Slice 1.

## Reuse

- Modal backdrop/dialog: `fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50` + `card` — the `#loginModal` pattern (`frontend.ts` / client modal).
- Buttons: `btn`, `btn-secondary`, `btn-primary`; FontAwesome `fa-solid`/`fa-brands` already loaded.
- Fetch/auth idiom: existing `authToken` + `Authorization: Bearer` header (`client/src/api/client.ts`).
- Store: D1 via `env.DB`; existing migration pattern in `workers/migrations/*.sql` (deploy applies migrations to D1 before deploy, per `deploy-workers.yml`).
- Validation: hand-rolled (zod reserved for MCP tool schemas, per CODING_STANDARDS).
- No inline `onclick` handlers (`addEventListener`, per removed-panel precedent).
- Toast/error rendering with `textContent` only.

## Changes

### 1. `workers/migrations/0006_caller_keys.sql` (new migration)

- `caller_keys` table: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `name TEXT NOT NULL UNIQUE`, `secret_hash TEXT NOT NULL` (the keyed verifier — never a salt), `prefix TEXT NOT NULL` (display prefix, e.g. `sk-mgmt-`), `suffix TEXT NOT NULL` (last 4 for masking), `enabled INTEGER NOT NULL DEFAULT 1`, `created_at INTEGER NOT NULL`, `updated_at INTEGER NOT NULL`.
- Unique index on `secret_hash`: the auth path looks a key up by verifier, and one secret is one key.
- `last_used_at` is deferred (Q3), so no column is reserved for it yet.
- Seed logic is in the Worker, not the migration (migration creates schema only).

### 2. `workers/src/endpoints/admin.ts`

- Routes (all behind existing two gates):
  - `GET /api/admin/caller-keys` → list: `{ keys: [{ id, name, maskedKey, enabled, createdAt, updatedAt }] }`. The mask is composed server-side (`prefix + "…" + suffix`), so the client holds no secret material and cannot decide what may be shown. No verifier, no secret.
  - `POST /api/admin/caller-keys` → create: body `{ name?, secret? }`; name 1–120 (default "Key N"), optional user secret validated; server generates `sk-mgmt-<24hex>` when absent. Returns `{ key: {id,name,prefix,suffix,enabled,created_at}, secret: "<plaintext once>" }`.
  - `POST /api/admin/caller-keys/:id/rotate` → new secret, old revoked immediately; returns new plaintext once. 404 unknown.
  - `POST /api/admin/caller-keys/:id/toggle` → flip enabled. 404 unknown.
  - `POST /api/admin/caller-keys/:id/rename` → body `{ name }`; 1–120 chars, unique. 404 unknown / 400 validation.
  - `DELETE /api/admin/caller-keys/:id` → remove. 404 unknown. Refuse to delete the last enabled key? (Decision: allow, but return a warning; an operator with no keys locks themselves out until redeploy with `API_KEYS`.) State chosen behavior in impl.
- Standard error envelopes; 401 `{ error:'Unauthorized', message }` + `WWW-Authenticate: Bearer`; 400 `{ error:{message,type:'invalid_request_error',code:null}}`; 404 `{ error:{message} }`; 409 `{ error:{message} }`.
- Hand-rolled body validation mirroring the rules above; map to store calls.

### 3. `workers/src/services/admin-store.ts` (or new `management-store.ts`)

- `listCallerKeys(db)` → rows without verifiers (the read path, #125).
- `createCallerKey(db, input)` → insert + return id + plaintext (caller separates).
- No reveal function: a one-way verifier cannot reproduce a secret that was never stored. The plaintext is returned once at create/rotate and never persisted.
  - Revisit: if operators need reveal, store encrypt-at-rest (D1 has no built-in encryption; would need app-layer encryption with a key — key-management-of-the-key-management problem). Deferred.
- `rotateCallerKey(db, id)` → new secret, old invalidated immediately.
- `toggleCallerKey(db, id, enabled)`, `renameCallerKey(db, id, name)`, `deleteCallerKey(db, id)`.
- Auth lookup: `getCallerKeyByVerifier(db, verifier)` — compute `HMAC-SHA256(pepper, secret)` for the presented bearer and look the row up by that value through the unique index. No scan, no per-row compare. Consulted per request once Q1's OR-path lands (#129).
- Single transaction per write (key row + audit row in `admin_audit` if table exists; else skip audit).

### 4. `workers/src/middleware/auth.ts`

- **Slice 1:** no change. (Q1 may add a D1-backed `authenticateViaD1` OR-path later.)

### 5. `client/src` — key-management UI

- Admin view (reuse 005 pattern: hash route or dedicated route), unlock gate (memory-only management key).
- Key list component: rows with switch, name, masked value (`prefix + "…" + suffix`), actions menu (Rotate / Remove with confirmation modals). The plaintext is shown once, at create/rotate, in the response the operator just received — it is not fetched later and never persisted. Until the write path exists the state renders as a chip, not a switch.
- Add-key form: name + optional secret (eye toggle), server-generated when empty.
- Confirmation modals: rotate ("Clients using this key will need the new key"), remove ("Clients using this key will lose access").
- Toasts: `ok`/`err`, auto-dismiss.
- Validation errors inline, field-level, matching existing label styling (`text-red-500` error per DESIGN.md).
- No `innerHTML`; `textContent` only; no credential persistence (`sessionStorage`/`localStorage`/cookie).

### 6. Tests

- `workers/src/endpoints/admin.test.ts`: describe for each key route — create (generated + user secret), reveal-absent (secret shown once), rotate (old fails, new works), toggle, rename, delete, unknown id 404, validation 400 (empty name, short secret, reserved prefix, duplicate), response contains no secret material in list.
- `workers/src/index.test.ts`: any new DOM-id contract if the admin UI is served from the Worker shell (the client is built to `client/dist` and served as static assets — the key-management UI lives in the client bundle, not `frontend.ts` HTML; confirm: `AGENTS.md` says the Worker owns API routes and serves client build output through `ASSETS` binding). So UI tests are `npm --prefix client test` (component/RTL) + `e2e/tests/ui/spa.spec.ts` (Playwright) for the admin journey.
- `e2e/tests/api/admin.spec.ts`: API e2e for the key routes (401/403/200 + secret non-leakage).

## Reversibility

Easy. All changes are additive behind `/api/admin/caller-keys/*` plus a D1 migration. Reverting = drop the routes, drop the migration table, resume `env.API_KEYS`-only auth. No data loss for operator keys (they can be re-added via env var on redeploy).

## Verification

- `npm --prefix client run check` (client typecheck/lint) and `npm --prefix client test` (client unit tests).
- `workers/src/endpoints/admin.test.ts` and `workers/src/index.test.ts` pass.
- `e2e/tests/api/admin.spec.ts` passes (API e2e).
- Manual: unlock gate clears on logout/navigate-away (zero-persistence invariant), masked list never shows plaintext, rotate invalidates old secret, create shows plaintext once.
- Not run yet: full `wrangler deploy` smoke test (requires secrets/CI).
