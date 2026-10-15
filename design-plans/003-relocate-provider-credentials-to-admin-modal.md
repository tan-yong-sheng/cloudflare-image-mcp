# Relocate Provider Credentials to Admin Modal Dialog

Written against: 732ee14 (branch feat/r2-admin-api)

## Evidence chain

- Surface: Single-page web generator at `/` (`workers/src/endpoints/frontend.ts`, served by `serveFrontend()`).
- Problem: The "Provider Credentials" administrative panel sits directly above the "Result" canvas in the right column (`div.card.p-4:nth-of-type(1)`, bounds 686×192px at `y=96..288`), inverting visual hierarchy by displacing and compressing the primary image output canvas (`y=304`). Furthermore, end users with bearer API tokens are exposed to an operator management-key form they do not possess credentials for.
- Design evidence:
  - Rendered browser viewport (1517×908 on staging `https://cloudflare-image-workers-staging.tanyongsheng-net.workers.dev/`): credentials card consumes half the right-column height above the output placeholder.
  - User feedback: "can we remove this and make it to become a button to click to enter admin page? why or why not?".
  - Existing modal exemplar: `#loginModal` in `workers/src/endpoints/frontend.ts:206-224` establishes the design system's modal backdrop and dialog card tokens (`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50` with inner `card p-6 md:p-8 max-w-xl w-full mx-4 max-h-[90vh] overflow-y-auto`).
- Owner: `workers/src/endpoints/frontend.ts` (`getFrontendHTML`).
- Scope and affected surfaces:
  - Header actions: `#logoutButton` container (`workers/src/endpoints/frontend.ts:230-238`).
  - Right content column: `div.w-full.lg\:w-3\/5.space-y-6` (`workers/src/endpoints/frontend.ts:340-375`).
  - Modal container: New `#adminModal` overlay preceding or alongside `#loginModal`.
  - Client script: Event listeners and modal visibility toggle in `<script>` block (`workers/src/endpoints/frontend.ts`).
  - Contract tests: `workers/src/index.test.ts` (asserts presence of all 12 admin DOM element IDs and endpoints).
- Uncertainty: None. Verified via rendered staging viewport, accessibility tree, and live test suite.

## Design decision

Relocate the Provider Credentials management markup out of the main page column flow and into an overlay modal dialog (`#adminModal`). Introduce a dedicated header trigger button (`#adminModalButton`) in the top navigation toolbar next to `#logoutButton`.

This resolves the persona and hierarchy contradiction by:

1. Restoring the "Result" card as the sole occupant of the right-hand desktop column, allowing the image preview container to occupy full vertical height without visual competition.
2. Hiding operator-only management fields from ordinary end-users while keeping credentials management accessible via a single explicit click.
3. Preserving all existing DOM element IDs, routes, and security sanitization behavior so tests in `workers/src/index.test.ts` remain green.

## Reuse

- Modal backdrop and container: `fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50` (identical to `#loginModal`).
- Card container and padding: `card p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl` using existing Tailwind and theme tokens.
- Button styles: `btn btn-secondary text-sm py-1 px-3` and `btn btn-primary text-sm py-1 px-3`.
- Icon styling: FontAwesome icons (`fa-solid fa-key`, `fa-solid fa-xmark`, `fa-solid fa-sliders`).
- Exemplar: `#loginModal` in `workers/src/endpoints/frontend.ts:206-224`.

## Changes

1. `workers/src/endpoints/frontend.ts` — Top Navigation Header
   - Change: Add `<button id="adminModalButton" class="btn btn-secondary p-2 h-10 flex items-center justify-center hidden" aria-label="Manage Provider Credentials"><i class="fa-solid fa-key mr-2 text-primary"></i>Admin</button>` next to `#logoutButton`.
   - Preserve: `#themeToggle` and `#logoutButton` positions, styles, and event bindings.
   - Verify: When authenticated (`authToken` present), `#adminModalButton` becomes visible alongside `#logoutButton`. When logged out, `#adminModalButton` is hidden.

2. `workers/src/endpoints/frontend.ts` — Main Column Layout
   - Change: Remove the static `<div class="card p-4 space-y-4 fade-in">` Provider Credentials card from `<div class="w-full lg:w-3/5 space-y-6">`. The right column now contains only the `<!-- Panel: Result -->` card (`<div class="card p-4 space-y-4 fade-in">`).
   - Preserve: All internal elements, IDs, and structure of the Result panel (`#downloadButton`, `#loadingOverlay`, `#initialPrompt`, `#aiImage`, `#generateError`, `#imageInfo`, `#usedModel`, `#generationTime`).
   - Verify: The Result card occupies the entire right column without any card above it.

3. `workers/src/endpoints/frontend.ts` — Admin Modal Dialog Markup
   - Change: Add `#adminModal` dialog markup (adjacent to `#loginModal`):
     ```html
     <div
       id="adminModal"
       class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden"
       role="dialog"
       aria-modal="true"
       aria-labelledby="adminModalTitle"
     >
       <div
         class="card p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl space-y-4"
       >
         <div
           class="flex justify-between items-center border-b border-gray-700 pb-3"
         >
           <h2
             id="adminModalTitle"
             class="text-xl font-semibold flex items-center"
           >
             <i class="fa-solid fa-key mr-2 text-primary"></i>Provider
             Credentials
           </h2>
           <div class="flex items-center gap-2">
             <span
               id="adminHealthState"
               class="text-xs opacity-75"
               role="status"
             ></span>
             <button
               id="adminModalClose"
               class="btn btn-secondary p-1 h-8 w-8 flex items-center justify-center rounded"
               aria-label="Close admin dialog"
             >
               <i class="fa-solid fa-xmark"></i>
             </button>
           </div>
         </div>
         <p class="text-sm opacity-75">
           Keys are sealed server-side on save. Unlock with the management key
           to view and manage them.
         </p>
         <div>
           <label for="adminKey" class="block text-sm font-medium mb-1"
             >Management key</label
           >
           <div class="flex gap-2">
             <input
               type="password"
               id="adminKey"
               class="w-full"
               placeholder="Admin key (never stored)"
               autocomplete="off"
             />
             <button
               id="adminUnlock"
               class="btn btn-secondary text-sm py-1 px-3"
             >
               Unlock
             </button>
             <button
               id="adminLock"
               class="btn btn-secondary text-sm py-1 px-3 hidden"
             >
               Lock
             </button>
           </div>
           <p
             id="adminError"
             class="text-sm text-red-500 hidden"
             role="alert"
           ></p>
         </div>
         <div id="adminPanel" class="space-y-3 hidden">
           <div id="adminKeys" class="space-y-2"></div>
           <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
             <input
               id="newKeyLabel"
               class="w-full"
               placeholder="Label (e.g. billing)"
               aria-label="New key label"
             />
             <input
               type="password"
               id="newKeyToken"
               class="w-full"
               placeholder="API token"
               aria-label="New API token"
               autocomplete="off"
             />
             <select
               id="newKeyProvider"
               class="w-full"
               aria-label="Provider"
             ></select>
             <button
               id="addKeyButton"
               class="btn btn-primary text-sm py-1 px-3"
             >
               Add key
             </button>
           </div>
           <p id="adminNotice" class="text-sm hidden" role="status"></p>
         </div>
       </div>
     </div>
     ```
   - Preserve: All 12 element IDs (`adminKey`, `adminUnlock`, `adminLock`, `adminError`, `adminPanel`, `adminKeys`, `adminHealthState`, `newKeyLabel`, `newKeyToken`, `newKeyProvider`, `addKeyButton`, `adminNotice`).
   - Verify: Dialog renders with modal backdrop and dismiss controls.

4. `workers/src/endpoints/frontend.ts` — Client Script Modal Management
   - Change:
     - Wire `#adminModalButton` to show `#adminModal` (`adminModal.classList.remove('hidden')`).
     - Wire `#adminModalClose` to hide `#adminModal` (`adminModal.classList.add('hidden')`).
     - Wire `Escape` keydown on `window` to close `#adminModal` when open.
     - In `checkAuth()`: toggle visibility of `#adminModalButton` alongside `#logoutButton` based on `authToken`.
     - In `lockAdmin()`: hide `#adminModal` if desired or keep within modal view; ensure `newKeyToken.value = ''` and `adminKey = ''` remain active.
   - Preserve: Existing key rotation, addition, disabling, auth token lifecycle, and constant-time error handling.
   - Verify: Opening and closing the modal leaves background interaction intact; locking/closing clears credentials cleanly.

## Scope

- Inherit: Single-page frontend at `/` (`workers/src/endpoints/frontend.ts`).
- Verify: `workers/src/index.test.ts` (checks DOM IDs on `/`), `workers/src/endpoints/admin.test.ts` (checks backend endpoints).
- Exclude: Backend API routes (`/api/admin/*`), inference routes (`/v1/*`), migration files, worker configuration.

## Validation

- Product: Open `/` in browser. Sign in with bearer token. The main view displays only "Settings" on the left and "Result" on the right. Click "Admin" in top navbar -> modal dialog appears. Enter management key and click "Unlock" -> keys load into view. Click "X" or press Escape -> modal closes. Result image canvas remains unobstructed.
- Interface: Viewport 1517×908 (desktop) and 375×667 (mobile). Modal is centered, scrolls gracefully if key list grows, and does not push or shift the page canvas.
- System: Clean reuse of existing modal and button classes. Zero duplicate utility classes.
- Repository:
  - `npm run check` in `workers/` → 0 errors.
  - `npm test` in `workers/` → 333 / 333 passed.
  - `npx prettier --check workers/src/endpoints/frontend.ts` → Clean.

## Stop conditions

- Stop if any of the 12 element IDs checked by `workers/src/index.test.ts` must be renamed or removed.
- Stop if backend `/api/admin/*` contracts must change.
- Stop if `sessionStorage` or local storage needs to store the management key (management key must remain memory-only).

## Design documentation

- After acceptance and validation: Record decision in `docs/CREDENTIALS_SETUP.md` updating UI screenshots/descriptions to reflect that Provider Credentials reside in the header Admin modal dialog.
