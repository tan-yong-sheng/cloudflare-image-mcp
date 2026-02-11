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
| `TZ` | Timezone for logging | `America/New_York` |

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
