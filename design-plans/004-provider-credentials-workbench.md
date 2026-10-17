# Provider Credentials Workbench (variant A) + PATCH endpoint

Written against: `0394f8c` (branch `feat/r2-admin-api`, after the panel
removal) — implements #91. Prototype of record:
`workers/src/endpoints/admin-providers.prototype.html` on branch
`prototype/admin-workbench` (throwaway, parked).

## Evidence chain

- Surface: single-page generator at `/` (`workers/src/endpoints/frontend.ts`, `getFrontendHTML`), plus the `/api/admin/*` routes in `workers/src/endpoints/admin.ts` and the store in `workers/src/services/admin-store.ts`.
- Problem: #74 landed the admin API with **no frontend** (the interim panel was removed, #90). Operators today must curl `POST /api/admin/keys/:id/rotate` etc. with `X-Admin-Key`. There is no supported UI to view pool state or edit a key.
- Design evidence: prototype variant A validated over ~10 rounds of rendered feedback (Orca browser, screenshots): provider-family rail (single family: Cloudflare Workers AI, `fa-cloudflare`) → masked key table (`cf-sk******a1b2 v1`, Account ID, actions) → right-docked full-height Edit sheet (square left edge, `max-width:30rem`) → success panel. Reference model: CLIProxyAPI management center (rail + per-key Test + masked entries).
- Schema facts (verified in `workers/migrations/0001_provider_schema.sql`):
  - `provider_keys`: `id, provider_id, label, external_account_id, weight, enabled, created_at` — **no `base_url`, no models column**.
  - `exposure_overrides` / `excluded_scopes` are keyed by `model_id` and are **global** (registry-level overlays), not per-key.
- Owner: `workers/src/endpoints/frontend.ts` (UI), `workers/src/endpoints/admin.ts` + `workers/src/services/admin-store.ts` (PATCH).
- Contract tests: `workers/src/index.test.ts` (DOM ids on `/`), `workers/src/endpoints/admin.test.ts` (routes), `e2e/tests/api/admin.spec.ts` (API e2e, 401/403/200 + secret non-leakage).

## Design decision

Reintroduce the header **Admin** button (next to `#logoutButton`, visible only
when `authToken` is present) opening a workbench modal that mirrors variant A:

1. **Unlock gate** — management-key input at the top of the workbench; memory-only (never `sessionStorage`/`localStorage`, matching the removed panel's tested invariant); wrong key → 403 message; logout and modal close clear it.
2. **Header** — title "AI Providers" (`fa-server`), chips: `N/M active keys`, `1 provider family`.
3. **Rail** (left, `md:w-56`) — one `rail-item` per family: brand icon + display name + `active/total`; Cloudflare is the only row today; selection state only.
4. **Table** — columns: Key (masked hint + `vN`), Account ID (monospace, `—` when unset), actions. Row actions: enabled toggle switch (`role="switch"`, aria-checked, dims row at 55% when off) + pen Edit button. Disabled rows render `opacity:.55`. Empty state: "No keys yet." + New key button.
5. **Right sheet** (add | edit modes):
   - Add: eyebrow `NEW`; Cloudflare account ID (required — validated **before** the token; hint: inference calls `/accounts/{account_id}/ai/run/…`, stored alongside the key, not sealed); API token (eye toggle, `autocomplete="new-password"`, `data-1p-ignore`); scheduling weight + Disable checkbox (hint: default 1, ≤ 0 excluded, max 1,000,000); footer Cancel + Add key. Validation order: accountId → token present → length ≥ 8 → weight ≥ 0.
   - Edit: eyebrow `EDIT`; title `Edit key — <label> (cloudflare · currently vN)`; note "Leave the token blank to keep the current version. Filling it rotates as part of save."; same fields; footer Cancel + Save.
   - Success: "✓ `<label>` added (v1, untested)" + "Token sealed server-side; re-test recommended." + Add another / Done.
6. **Backend `PATCH /api/admin/keys/:id`** — body `{ accountId?, weight?, enabled?, apiToken? }`; a present token triggers the rotate path inside the same transaction; response echoes identity only (id, label, providerId, activeVersion, weight, enabled, accountId). Extends the audit action vocabulary with `"update"` (token present also records rotation — same row, action `"update"` plus the new version). 404 unknown key, 400 validation (mirror add-path rules; cloudflare requires non-empty accountId), 409 rotate-without-active-version.

### Deferred from the prototype (recorded decisions, follow-up issue)

- **Base URL and Custom models UI + persistence**: no schema home. `provider_keys` has no `base_url`/models column and `exposure_overrides` is keyed by `model_id` and global. Per-key models/baseUrl is a routing-affecting feature (which models a key may serve) needing its own migration + pool-loader/orchestrator work. **Slice 1 drops those sheet fields and table columns.**
- **Connectivity Test button + test-model picker**: needs a new endpoint that decrypts the envelope and performs a real inference call (`POST /api/admin/keys/:id/test`). **Slice 1 omits it.** Picker merge fix (custom models vs family registry) is moot until models land.

### Existing endpoint fate

`POST /api/admin/keys/:id/rotate` and `.../disable` **stay**: they shipped to the API surface via #74 and are covered by e2e; removing them would be a breaking change needing a deprecation window. PATCH is documented as the path the workbench uses; docs note both.

## Reuse

- Modal backdrop/dialog: `fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50` + `card` — the `#loginModal` pattern (`frontend.ts:206-224`).
- Buttons: existing `btn`, `btn-secondary`, `btn-primary` classes; icons FontAwesome `fa-solid`/`fa-brands` already loaded by the page.
- Fetch/auth: the existing `authToken` + `X-Admin-Key` header idiom; `GET /api/admin/health` for state (counts, labels, weights, flags, active versions — never secrets).
- Store: the shared atomic batch in `admin-store.ts` (key + version + config bump + audit) already used by add/rotate/disable — PATCH reuses it; only the field set grows.
- No inline `onclick` handlers in shipped code (removed-panel precedent used `addEventListener`); prototype's inline handlers are converted.

## Changes

1. `workers/src/endpoints/frontend.ts`
   - Add `#adminWorkbenchButton` (`btn btn-secondary p-2 h-10 … hidden`, `aria-label="Manage provider credentials"`, `fa-key` icon) next to `#logoutButton`; toggle in `checkAuth()` alongside `logoutButton`; logout clears the workbench (key state, modal hidden).
   - Add `#adminWorkbench` modal markup: unlock row (management key input + Unlock + Lock, error line), chips, rail, table, sheet (add/edit), success panel — the DOM-id contract lives here.
   - Script: unlock/lock (memory-only `adminKey` variable, cleared on close/logout), rail selection, table render from `GET /api/admin/health`, sheet open (add/edit) + validation order + eye toggle + weight/enabled bindings, `POST /api/admin/keys` (add) and `PATCH /api/admin/keys/:id` (edit; token only when filled), Escape/backdrop close (locks), toast/error rendering with `textContent` only (labels are untrusted store data — never `innerHTML`).
2. `workers/src/endpoints/admin.ts` — route `PATCH /api/admin/keys/:id` behind the existing two gates; hand-rolled body validation mirroring add-path rules; map to the store call; standard error envelopes (400/403/404/409/500).
3. `workers/src/services/admin-store.ts` — `updateProviderKey(db, input)`: single transaction — update `provider_keys` (`external_account_id`, `weight`, `enabled`; label/provider immutable), optional rotate (revoke active version, insert new envelope — revoke-before-insert per `uq_credential_single_active`), bump `config_versions`, insert `admin_audit` row (action `"update"`; actor `ADMIN_ACTOR`). `AdminWrite` action type extends to `"update"`.
4. `workers/src/index.test.ts` — replace nothing (panel block already removed); add the workbench DOM-id contract: `adminWorkbenchButton`, `adminWorkbench`, `adminWorkbenchClose`, `adminKey`, `adminUnlock`, `adminLock`, `adminError`, `adminPanel`, `adminKeys`, `adminRail`, `adminSheet`, `adminSheetAcct`, `adminSheetToken`, `adminSheetWeight`, `adminSheetEnabled`, `adminSheetError`, `adminSheetSave`, `adminSheetCancel`, `adminAddKey`, `adminNotice` — plus the memory-only invariant assertions (no `sessionStorage` admin key, no `localStorage`).
5. `workers/src/endpoints/admin.test.ts` — PATCH describe: weight/enabled/accountId update; rotate-on-save bumps version and revokes the old one in one transaction; unknown id 404; cloudflare empty accountId 400; non-integer/negative weight 400; response contains no secret material; audit row written with action `"update"`; config_versions bumped.
6. `e2e/tests/api/admin.spec.ts` — add PATCH coverage (edit weight+enabled, rotate-on-save reflected in health), keep the existing 401/403/200 + secret-non-leakage assertions.
7. `docs/CREDENTIALS_SETUP.md` — document the workbench flow and `PATCH /api/admin/keys/:id` beside the existing rotate/disable runbook entries.

## Scope

- Inherit: `/` frontend, `/api/admin/*`, the D1 provider store.
- Exclude: Base URL / per-key models persistence, connectivity-test endpoint (deferred, follow-up issue), `/v1/*` inference routes, migrations (no schema change in this slice — `external_account_id` already exists), worker config.
- Route auth: unchanged two-gate (`requiresAuth` + admin store gate).

## Validation

- Product: `/` → sign in → Admin button appears → workbench opens → unlock with management key → rail shows Cloudflare Workers AI active/total → table lists masked keys with Account ID → pen opens Edit sheet prefilled → blank token keep-version save PATCHes (health `configVersion` bumps; no version change); filled token rotates (version +1, old revoked). New key via add sheet auto-labels `imported-N`. Logout/close clears the management key from memory.
- Interface: viewport 1517×908 (desktop) and 375×667 (mobile — rail stacks above the table, `md:` breakpoints); sheet is right-docked full height with backdrop + Escape close; table reflows to Key + actions on narrow screens.
- System: reuse of existing modal/button/icon classes; new CSS limited to the switch component + sheet docking (~40 lines); zero duplicate utility classes.
- Repository:
  - `npm run check` in `workers/` → 0 errors.
  - `npm test` in `workers/` → all pass (333 baseline − panel test + workbench contract + PATCH tests).
  - `npx prettier --check workers/src/endpoints/frontend.ts workers/src/endpoints/admin.ts workers/src/services/admin-store.ts` → clean.
  - `e2e` admin spec green against deployed staging (or recorded as skipped with sentinel pass).

## Stop conditions

- Stop if the PATCH transaction cannot reuse the shared atomic batch without weakening the revoke-before-insert invariant.
- Stop if persisting Base URL / per-key models turns out to be required for the UI to make sense (it is deferred above — a schema migration would change the blast radius).
- Stop if the management key would need any persistence (memory-only is a tested invariant).
- Stop if contract tests require removing the 401/403/secret assertions.

## Design documentation

- After acceptance: update `docs/CREDENTIALS_SETUP.md` (workbench flow + PATCH) and record the deferred-items decision in the follow-up issue for Base URL / per-key models / connectivity test.

## Deviations recorded during implementation

- **Add path extended**: `POST /api/admin/keys` now also accepts
  `{ accountId, weight, enabled }` (the workbench's add sheet writes
  them). Cloudflare keys require `accountId` at add **and** edit — the
  account id is load-bearing for inference (`/accounts/{id}/ai/run`).
  This changes the `POST` contract #74 shipped; existing store/e2e
  tests were updated explicitly (seeds gained an account id).
- **Checkbox label semantics**: the prototype's "Disable this entry"
  checkbox rendered checked-when-enabled, which reads backwards. The
  implementation labels the control **Enabled** (checked = served,
  uncheck = parked); row switch and edit checkbox share that semantics.
- **Health read extended**: `getAdminHealth` keys now carry
  `accountId` (the table's Account ID column reads it).
- **Update echo re-read**: the `PATCH` response is the stored row read
  _after_ the commit, and the active version too when no token is sent —
  not the pre-commit snapshot. A concurrent save that changed another
  field had already committed by then, and echoing the snapshot reported
  that field as unchanged. `activeVersionOf` is the single home for the
  version query, which also simplified `appendRotateWrites`.
- **Concurrency semantics, stated rather than implied**: version
  allocation is guarded by the schema, not by read-modify-write.
  `UNIQUE (provider_key_id, version)` plus the partial unique index that
  admits one unrevoked row per key make a racing rotate or rotate-on-save
  fail loudly (409 "changed concurrently; retry the save") instead of
  forking versions — including two racers that both observe no active
  version, where the `UNIQUE` constraint is what blocks the second insert.
  Field-only edits are last-writer-wins per column: an omitted field is
  never written (the pass-1 fix) and the response is the stored row read
  back, so a concurrent edit to another column cannot be reported as
  unchanged. There is deliberately **no** compare-and-set precondition on
  `weight`/`enabled`; adding one (ETag or version precondition) is a
  follow-up for when more than one operator writes at once.
- **Weight ceiling lives in the store**: `MAX_WEIGHT` is exported from
  `admin-store.ts` and enforced there for both write paths, with the route
  importing it rather than redeclaring it. The served UI cannot import a
  TS constant, so `index.test.ts` pins the HTML's `max` attribute to the
  same constant — the drift the endpoint-local copy allowed.
- **Selective deferral**: Base URL / per-key Custom models /
  connectivity Test are absent from the shipped UI this slice (no
  schema home / no test endpoint) — see "Deferred" above; the sheet ends
  at account id, token, weight, enabled.
