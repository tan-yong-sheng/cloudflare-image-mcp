# Full-Page Provider Credentials Admin Workspace (SPA View Transition)

Written against: `2ddcdb5` (branch `feat/admin-workbench`)

## Evidence chain

- Surface: `workers/src/endpoints/frontend.ts` (`getFrontendHTML`) rendered at `/` (and `/#admin` view state).
- Problem: The provider credentials administration interface is currently embedded inside a floating modal dialog (`div#adminWorkbench > div.card.p-6.w-full.max-w-4xl.max-h-[90vh].overflow-y-auto`, 896x645 on 1395x877 viewport). This introduces competing nested scrollbars, severely compresses horizontal space for the two-column layout (provider rail `md:w-56` leaving < 600px for key label, version, account ID, enable switch, and action buttons), and squeezes the right slide-over edit sheet (`adminSheet`). Furthermore, operators expect an administrative tool to feel like a dedicated management console rather than a modal dialog overlaying an image generator. A traditional browser redirect to `GET /admin` is unviable because standard browser navigations cannot attach custom `Authorization: Bearer` and `X-Admin-Key` headers without storing credentials in cookies or browser storage, which would violate the zero-persistence security invariant.
- Design evidence: `DESIGN.md` (colors, typography, container patterns, card styling), `design-plans/004-provider-credentials-workbench.md` (in-memory management key invariant, variant A components), rendered feedback from user tab `0a8a57f0-6d91-493a-933e-939e7f68cbbf`.
- Owner: `workers/src/endpoints/frontend.ts` (`getFrontendHTML`).
- Scope and affected surfaces: `workers/src/endpoints/frontend.ts`, `workers/src/index.test.ts`, and local browser journey tests.
- Uncertainty: none.

## Design decision

Transition the Provider Credentials Workbench from a floating modal overlay (`#adminWorkbench`) into a **full-page client-side SPA view (`#adminView`)** managed by hash routing (`/#admin`):

1. **Top-Level View Division**:
   - Wrap the image generation UI inside `<main id="generatorView" class="container mx-auto px-4 py-4 max-w-6xl">`.
   - Implement the administrative interface inside `<main id="adminView" class="container mx-auto px-4 py-4 max-w-6xl hidden">`.
   - Both views share the same responsive container width and grid alignment from `DESIGN.md`.

2. **Dedicated Admin Navigation Header**:
   - Header top bar:
     - Left: `<button id="adminBackBtn" class="btn btn-secondary p-2 h-10 flex items-center"><i class="fa-solid fa-arrow-left mr-2"></i>Back to Generator</button>` + `<h1 class="text-2xl font-bold flex items-center ml-3"><i class="fa-solid fa-server mr-2 text-primary"></i>AI Providers</h1>`.
     - Right: Status chips (`3/4 active keys`, `1 provider family`), `<button id="adminLock">` (visible when unlocked), Theme toggle, and Logout.

3. **Two-Stage Administrative View**:
   - **Gate State (`!adminKey`)**: When navigating to the admin view without an active key, present a clean, centered card:
     - Title: "Unlock Provider Credentials"
     - Subtitle: "Enter your management key to inspect and manage provider keys."
     - Input `<input id="adminKey" type="password">` + button `<button id="adminUnlock" class="btn btn-primary">Unlock</button>`.
     - Error line `#adminError` (styled with `text-red-500` / role="alert").
     - "Back to Generator" navigation link.
   - **Workspace State (`adminKey` active)**: Once unlocked, the full two-column workbench is displayed:
     - Left rail (`#adminRail`, `md:w-64`): Provider families with brand icon, name, and active key badge.
     - Center/Right table section: Family heading, "New key" primary action, full-width responsive table (`#adminKeys`) with Key, Account ID (monospace), and Actions (switch toggle + pen edit button).
     - Empty state `#adminEmpty` centered when a family has no keys.
     - Slide-over sheet (`#adminSheet`): Right-docked slide-over (`max-w-md`) with square left edge, full viewport height, and backdrop that docks cleanly to the full screen.

4. **URL Hash Routing & State Transitions**:
   - Clicking `#adminWorkbenchButton` sets `window.location.hash = '#admin'`.
   - A `hashchange` listener handles route switching:
     - If hash is `#admin`: hide `#generatorView`, show `#adminView`. If `adminKey` is already in memory, trigger `loadHealth()`.
     - If hash is empty or not `#admin`: hide `#adminView`, show `#generatorView`. Call `lock()` to wipe the in-memory management key and abort in-flight requests.
   - Clicking `#adminBackBtn` sets `window.location.hash = ''`.
   - Browser back/forward buttons naturally transition between Generator and Admin views.

5. **Security Invariant (Zero-Persistence)**:
   - Preserved 100%: `adminKey` remains held exclusively in JavaScript lexical closure memory (`let adminKey = ''`).
   - Never stored in `localStorage`, `sessionStorage`, cookies, or URL parameters.
   - Cleared on:
     - Clicking "Lock" (`#adminLock`)
     - Clicking "Back to Generator" (`#adminBackBtn`)
     - Navigating away from `#admin` (via browser back button or hash change)
     - Clicking "Logout" (`#logoutButton`)
     - Window unload / refresh

## Reuse

- Container layout: `container mx-auto px-4 py-4 max-w-6xl` (matches generator container in `frontend.ts`).
- Button classes: `btn`, `btn-primary`, `btn-secondary` (`DESIGN.md`).
- Chip classes: `chip`, `chip-ok` (`DESIGN.md`).
- Switch class: `tswitch`, `.track`, `.thumb` (custom toggle switch component).
- Card class: `card p-6`, `card p-4` (neutral dark-mode card styling).
- Sheet pattern: `#adminSheet` (`fixed inset-0 flex items-stretch justify-end z-50`).
- Exemplar: `#generatorView` in `workers/src/endpoints/frontend.ts`.

## Changes

1. `workers/src/endpoints/frontend.ts`
   - Change:
     - Wrap generator markup in `<main id="generatorView" ...>`.
     - Replace modal dialog `<div id="adminWorkbench" class="fixed inset-0 ...">` with full-page container `<main id="adminView" class="container mx-auto px-4 py-4 max-w-6xl hidden">`.
     - Structure `#adminView` into header bar, centered unlock card (`#adminGate`), and full-width operational panel (`#adminPanel`).
     - Wire `window.location.hash = '#admin'` on `#adminWorkbenchButton` click.
     - Add `hashchange` event listener syncing view display and clearing `adminKey` when leaving `#admin`.
     - Add `#adminBackBtn` click handler returning to generator (`window.location.hash = ''`).
   - Preserve:
     - All existing element IDs (`adminWorkbenchButton`, `adminKey`, `adminUnlock`, `adminLock`, `adminError`, `adminNotice`, `adminPanel`, `adminRail`, `adminKeys`, `adminSheet`, etc.).
     - Memory-only `adminKey` variable and request generation invalidation logic (`adminRequestGeneration`, `sheetGeneration`).
     - PATCH `/api/admin/keys/:id` and GET `/api/admin/health` API contracts.
   - Verify:
     - Navigating to `/#admin` displays `#adminView` and hides `#generatorView`.
     - Unlocking displays full-width rail and keys table with no nested modal scrollbars.
     - Clicking "Back to Generator" or browser back button returns to generator and clears `adminKey`.

2. `workers/src/index.test.ts`
   - Change:
     - Update DOM assertions to verify that `#generatorView` and `#adminView` exist and carry the expected container classes.
     - Verify `#adminBackBtn` is present in the rendered HTML.
     - Confirm memory-only management key assertion passes (`adminKey` not in storage).
   - Preserve:
     - All 359 existing unit/contract tests.
   - Verify:
     - `npm run check && npm test` passes.

## Scope

- Inherit: All existing frontend scripts, styles, route constants, and API endpoints.
- Verify: Workbench Playwright browser journey (`docs/reviews/workbench-local-journey.md`), contract tests in `workers/src/index.test.ts`.
- Exclude: Backend API route changes (all `/api/admin/*` endpoints remain identical), database migrations (no schema changes).

## Validation

- Product: Operator logs in with `API_KEY`, clicks "Admin", enters management key, views full-width provider table, edits a key, and clicks "Back to Generator". Key remains masked and memory-only.
- Interface:
  - Desktop (1395x877): Rail (`w-64`) and table (`flex-1`) have ample space; sheet docks to the right side of the screen without double scrollbars.
  - Mobile (<768px): Rail stacks on top of table; "Back to Generator" remains accessible.
- System: Confirm no duplicate modal or view-switching pattern; confirm zero storage of `adminKey`.
- Repository:
  - `cd workers && npm run check && npm test` → All test files pass.
  - `bash scripts/verify-admin-api.sh` → 22/22 pass.

## Stop conditions

- Stop if changing from modal to full-page requires storing `adminKey` in any client storage (violates security boundary).
- Stop if existing DOM ID contracts used by e2e/contract tests cannot be preserved.

## Design documentation

- After acceptance and validation: Record the full-page SPA route pattern in `design-plans/004-provider-credentials-workbench.md` under deviations or update `docs/CREDENTIALS_SETUP.md` with the new navigation screenshots/runbook.
