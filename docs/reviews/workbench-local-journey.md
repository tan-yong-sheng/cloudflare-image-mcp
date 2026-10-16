# Workbench verification — real browser against a local Worker (#91)

The unit tests assert the served markup and the store contract; they cannot
tell whether the workbench _works_. This records a real-browser run of the
variant-A workbench against `wrangler dev` with a local D1, including the
lock/logout and sheet-lifecycle races that are the reason those guards exist.

## Harness (all local, no Cloudflare access)

Both config files are gitignored, so none of this touches the PR:

- `workers/wrangler.toml` — same shape CI generates, with
  `[[d1_databases]] binding = "PROVIDER_DB"` and `database_id = "local-…"`.
- `workers/.dev.vars` — fake values only:
  `API_KEYS=local-user-key`, `ADMIN_API_KEY=local-admin-key`,
  `PROVIDER_DATA_KEY=local-dev-sealing-key`.
- Schema, through wrangler's own D1 (workerd), not node:sqlite:
  `npx wrangler d1 execute PROVIDER_DB --local --file=migrations/000N_*.sql`
  (in order), or `npx wrangler d1 migrations apply PROVIDER_DB --local`.
- Server: `npx wrangler dev --port 8787 --ip 127.0.0.1`.
- Driver: Playwright from the npx cache, falling back to the system Chrome
  (`chromium.launch({ executablePath: "/usr/bin/google-chrome" })`) because
  Playwright's pinned chromium build is not downloaded in this environment.

## What the run verified (26 checks, twice, repeatable)

Journey: sign in through the login modal → admin button appears → panel hidden
until the management key is entered → empty state → add (sheet announces the
derived `imported-N` label, server stores account id + weight + v1, empty state
hides) → row switch disables in D1 → edit prefills the stored account id and
saves weight without touching the version → a token on save rotates to v2 in
one transaction → no token material appears in the DOM.

Race scenarios, each asserted against the server as well as the UI:

1. **Lock mid-save.** The PATCH is delayed; the panel is locked while it is in
   flight. The UI reports nothing (`#adminNotice` stays hidden) while the
   request still reaches the server (weight applied). The sheet stays closed
   and a reopened sheet is usable (the save button is re-enabled by `openSheet`,
   not by the stale handler).
2. **Dismiss mid-save, then reopen.** Escape dismisses the sheet while the save
   is pending, then the sheet is reopened for the same key. The late response
   must not close the new sheet, retitle it, or print a notice.

**Negative control.** With the PATCH sheet-scope guard removed, exactly the two
scenario-2 assertions fail (24/26), so those checks detect the real defect
rather than restating the implementation.

## Observations from the run

- `GET /favicon.ico 401` — the browser requests the favicon without a bearer
  token, so the auth gate rejects it. Pre-existing, cosmetic (console noise
  only); no favicon route exists. Worth a follow-up, not part of #91.
- The row switch's checkbox is `opacity: 0` behind `.track`, so a click lands
  on the visible track inside the wrapping `<label>`. `:focus-visible` styling
  exists, so keyboard use works.

## Not verified here

- The add branch's sheet-scope guard is exercised only through PATCH; the add
  path shares the same mechanism but its race is not reproduced in a browser.
- The failed-add retitle guard (`sheetTitle` written after an awaited
  `loadHealth()`) is inspected, not behaviourally tested: reproducing it needs
  a rejected POST plus a dismissal during that await.
- Anything about a deployed Worker: migrations applied to a real D1, the e2e
  admin spec, and `ADMIN_API_KEY` provisioning on staging are all out of scope.

## Reproduce

The driver script is intentionally not committed: a committed local-mode run
needs CI wiring (generated `wrangler.toml`, local D1 migration step, dev-server
lifecycle) that is a separate change. The recipe above plus the check list is
enough to rebuild it; say the word if it should become a committed
`e2e` target.
