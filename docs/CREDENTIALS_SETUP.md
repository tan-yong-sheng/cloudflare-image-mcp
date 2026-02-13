# Environment Setup

This page lists all environment variables used by this project.

For **step-by-step deployment instructions**, see [DEPLOY.md](DEPLOY.md).

---

## Required for Deployment

| Variable | Description | How to Get It |
|----------|-------------|---------------|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | [Dashboard](https://dash.cloudflare.com) → Account Overview → right sidebar |
| `CLOUDFLARE_API_TOKEN` | API token for deploying Workers | [Profile](https://dash.cloudflare.com/profile/api-tokens) → Create Token → Custom token |

### Required API Token Permissions

Create a token with these **Account-scoped** permissions:

| Scope | Permission |
|-------|------------|
| Account | Workers Scripts — Edit |
| Account | Workers R2 Storage — Edit |
| Account | Workers AI — Edit |
| Account | Workers AI — Read |

---

## Optional Secrets

| Variable | Description | Example |
|----------|-------------|---------|
| `API_KEYS` | Protect endpoints with API key auth (comma-separated) | `mykey1,mykey2` |
| `AI_ACCOUNTS` | Multi-account AI inference credentials (JSON array) | See below |
| `TZ` | Timezone for logging | `America/New_York` |

### `AI_ACCOUNTS` Format

By default, the worker uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for both deployment **and** AI inference. If you want to distribute AI inference across multiple Cloudflare accounts (e.g. for rate limit distribution), set `AI_ACCOUNTS` as a JSON array:

```json
[
  { "account_id": "abc123...", "api_token": "token-for-account-1" },
  { "account_id": "def456...", "api_token": "token-for-account-2" }
]
```

Each entry needs an API token with **Workers AI Read + Edit** permissions for that account. The worker picks a random account per request for load distribution.

If `AI_ACCOUNTS` is **not set**, the worker falls back to `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` for AI inference.

---

## Where to Set These

### GitHub Actions (Recommended)

Add as repository secrets:

```
https://github.com/YOUR_USERNAME/cloudflare-image-mcp/settings/secrets/actions
```

### Local Development

```bash
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"
```

---

See [DEPLOY.md](DEPLOY.md) for the complete deployment guide.
