# Deployment Guide (Workers-only)

This guide covers deploying the Cloudflare Image MCP service to **Cloudflare Workers**.

## Architecture Overview

| Target | Location | Purpose | Transport |
|--------|----------|---------|-----------|
| **Workers** | `workers/` | MCP (HTTP/SSE) + OpenAI API + Frontend | HTTP/SSE |

---

## Prerequisites

1. Cloudflare Account with **Workers AI** and **R2** enabled
2. GitHub repository with Actions enabled (optional, for CI/CD)

---

## GitHub Secrets Setup (CI/CD)

### Required

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers deploy permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

### Optional

| Secret | Description |
|--------|-------------|
| `API_KEYS` | Comma-separated API keys to protect OpenAI + MCP endpoints |
| `S3_CDN_URL` | Public R2 URL for absolute image URLs (otherwise relative `/images/...`) |
| `TZ` | Timezone for logging |

---

## Local development (Wrangler)

```bash
cd workers
npm ci
npx wrangler dev --remote
```

---

## Manual deploy

```bash
cd workers
npm ci
npx wrangler deploy
```

---

## Verify deployment

```bash
curl https://<your-worker-url>/health
```

## Notes

- R2 bucket binding is configured in `wrangler.toml` as `IMAGE_BUCKET`.
- Workers AI binding is configured in `wrangler.toml` as `AI`.
