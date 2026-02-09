# Deployment Summary (Workers-only)

This repository deploys **Cloudflare Image MCP** as a **Cloudflare Worker**.

## What’s included

### 1) Cloudflare Workers deployment

- Worker entry: `workers/src/index.ts`
- OpenAI-compatible API: `/v1/images/*`
- MCP over HTTP/SSE:
  - `/mcp` (multi-model)
  - `/mcp/smart` (multi-model)
  - `/mcp/simple?model=@cf/...` (single-model; `model` is required)
- Web UI: `/`

CI workflow:
- `.github/workflows/deploy-workers.yml`

### 2) E2E testing (Playwright)

E2E tests run against **staging/production Workers**:
- `.github/workflows/e2e-tests.yml`
- Tests live in `e2e/tests/**`

## Required GitHub secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Optional:
- `API_KEYS` (protect MCP/OpenAI endpoints)
- `S3_CDN_URL` (absolute image URLs; otherwise relative `/images/...`)
- `TZ`

## Repo contents (high level)

- `workers/` — Cloudflare Worker implementation
- `e2e/` — Playwright test suite
- `docs/` — documentation
