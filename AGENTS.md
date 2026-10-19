# Cloudflare Image MCP - Agent Guide (Workers-only)

For project overview, tech stack, and layout see `README.md`.

## MCP Endpoints

- `/mcp` (default multi-model)
- `/mcp/smart` (explicit multi-model)
- `/mcp/simple?model=@cf/...` (single-model; `model` is required)

## Web client (React SPA)

**Source of truth:** `client/`

- The frontend is a React SPA (Vite + Tailwind + TanStack Query) built to
  `client/dist` and deployed as Workers Static Assets. The Worker owns
  the API routes and serves the client's build output through the
  `ASSETS` binding; `/` and `/admin` both serve the client document.
- The client is a **separate package** with its own lockfile. Install and
  build it before running the Worker locally:
  `npm --prefix client ci && npm --prefix client run build`.
- `client/src/index.css` holds the design tokens; `DESIGN.md` is their
  source of truth. The client loads **no third-party origin** — Tailwind
  and Font Awesome are bundled from packages.
- The management key that gates `/api/admin/*` is **memory-only** in the
  client: never `sessionStorage`, `localStorage` or a cookie.
- Local gates: `npm --prefix client run check` and
  `npm --prefix client test`. Conventions: read `CODING_STANDARDS.md`
  when editing `client/src`.
- The browser journey lives in `e2e/tests/ui/spa.spec.ts`: Playwright
  drives the served Worker through login, the playground form and the
  workbench. It stubs the model registry and the generation request, so
  it makes no provider call.

## Configuration & deployment (source of truth)

### CI/CD deploy (GitHub Actions)

**Source of truth:** `.github/workflows/deploy-workers.yml`

- CI **generates `workers/wrangler.toml` at deploy time** from GitHub Secrets and then **deletes it** after deploy.
- `workers/wrangler.toml` is gitignored (local template only) — never commit it; not authoritative for production.

Required GitHub Secrets (CI deploy):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `D1_DATABASE_ID` — one per GitHub environment (`staging`, `production`);
  the id of the pre-created D1 provider database. Deploy applies
  `workers/migrations/*.sql` to it before deploying the Worker.

Optional Worker secrets:

- `API_KEYS` (protects the MCP + OpenAI API routes; the client's document and
  its files under `/assets/` stay public — every browser downloads them)
- `TZ`
  Details: see `docs/DEPLOY.md` (AGENTS.md is authoritative if there is any contradiction).

### Model Configuration (Source of Truth)

**Source of truth:** `workers/src/config/models.json`, projected into
`workers/src/config/models.generated.ts` by `scripts/generate-models.mjs`
(`npm run models:gen`; `npm run check` fails when the projection is stale).

To add a model, follow the `add-cf-models` skill in `.agents/skills/`;
the frontend dropdown and MCP model discovery both read from this configuration.

## Pointers

- `main` is protected — branch + PR for all changes.
- Conventions: read `CODING_STANDARDS.md` when editing `workers/src`.
- Workflow/scripts/model-add: `CONTRIB.md`. Deploy secrets: `.github/workflows/deploy-workers.yml`.
- Agent context: read `docs/agents/domain.md` + `docs/agents/issue-tracker.md` when the task touches domain terms or issue tracking.
- Handoff oracles: when recording a count-based oracle (test counts, tier
  `--list` numbers), record the derivation — what is included and what
  would move it — not just the number.
