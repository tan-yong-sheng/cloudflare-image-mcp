# Cloudflare Image MCP - Agent Guide (Workers-only)

For project overview, tech stack, and layout see `README.md`.

## MCP Endpoints

- `/mcp` (default multi-model)
- `/mcp/smart` (explicit multi-model)
- `/mcp/simple?model=@cf/...` (single-model; `model` is required)

## Configuration & deployment (source of truth)

### CI/CD deploy (GitHub Actions)

**Source of truth:** `.github/workflows/deploy-workers.yml`

- CI **generates `workers/wrangler.toml` at deploy time** from GitHub Secrets and then **deletes it** after deploy.
- `workers/wrangler.toml` is gitignored (local template only) — never commit it; not authoritative for production.

Required GitHub Secrets (CI deploy):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Optional Worker secrets:

- `API_KEYS` (protects MCP + OpenAI endpoints + Frontend)
- `TZ`

Details: see `docs/DEPLOY.md` (AGENTS.md is authoritative if there is any contradiction).

### Model Configuration (Source of Truth)

**Source of truth:** `workers/src/config/models.json`

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
