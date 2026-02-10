# Environment setup (Workers-only)

This project runs on **Cloudflare Workers**.

## Required environment variables

Only these two are required for deployment / CI:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

```bash
export CLOUDFLARE_ACCOUNT_ID="<your-account-id>"
export CLOUDFLARE_API_TOKEN="<your-api-token>"
```

You could put these environment variable in github secrets on this repo, so the [Github Actions](/.github/workflows/deploy-workers.yml) could deploy this repo to Cloudflare Workers.

## Getting the values

- **Account ID**: Cloudflare Dashboard → account overview
- **API token**: Cloudflare Dashboard → API tokens

Reference (account-scoped tokens UI):
- `https://dash.cloudflare.com/{CLOUDFLARE_ACCOUNT_ID}/api-tokens`

## Optional Worker secrets

These are not required to deploy, but enable common features:

- `API_KEYS` — protect OpenAI + MCP endpoints (comma-separated)
- `S3_CDN_URL` — return absolute image URLs (otherwise `/images/...`)
- `TZ` — timezone for logging/paths

See also:
- `docs/DEPLOY.md` (deploy workflow and wrangler.toml note)
