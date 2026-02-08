# Deployment Guide

This guide covers deploying the Cloudflare Image MCP service to Cloudflare Workers with authentication enabled.

## Architecture Overview

The project supports two deployment targets:

| Target | Location | Purpose | Transport |
|--------|----------|---------|-----------|
| **Workers** | `workers/` | HTTP MCP + OpenAI API + Frontend | HTTP/SSE |
| **Local Server** | `packages/local/` | Local development server | HTTP + stdio MCP |

---

## Prerequisites

1. **Cloudflare Account** with Workers AI and R2 storage enabled
2. **GitHub Repository** with Actions enabled
3. **Required GitHub Secrets** (see below)

---

## GitHub Secrets Setup

### Required Secrets (Repository Level)

| Secret | Description | How to Get |
|--------|-------------|------------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers and R2 permissions | [Create here](https://dash.cloudflare.com/profile/api-tokens) |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | Dashboard right sidebar |

### Token Permissions Needed

Create a token with these permissions:
- **Account**: Cloudflare Workers:Edit, Account:Read
- **Zone** (if using custom domain): Zone:Read, Workers Routes:Edit
- **R2**: R2 Bucket:Edit, R2 Bucket Lifecycle:Edit

### Optional Secrets (For Authentication)

| Secret | Environment | Description |
|--------|-------------|-------------|
| `API_KEYS` | Repository | Comma-separated list of valid API keys (e.g., `key1,key2,key3`) |

---

## Deployment Steps

### Step 1: Deploy Infrastructure (R2 Bucket)

The infrastructure workflow creates the R2 bucket and sets up necessary secrets.

```bash
# Deploy infrastructure for production
gh workflow run deploy-infrastructure.yml \
  -f environment=production \
  -f action=apply
```

This creates:
- R2 bucket for image storage
- Public access configuration
- Lifecycle rules for automatic cleanup

**Note**: The infrastructure workflow outputs `S3_CDN_URL`, `S3_BUCKET`, and `S3_ENDPOINT` which are automatically saved to your GitHub Environment secrets.

### Step 2: Deploy Workers

```bash
# Deploy to production
gh workflow run deploy-workers.yml -f environment=production

# Or deploy to staging
gh workflow run deploy-workers.yml -f environment=staging
```

The worker will be available at:
- **Production**: `https://cloudflare-image-workers.<account_id>.workers.dev`
- **Staging**: `https://cloudflare-image-workers-staging.<account_id>.workers.dev`

### Step 3: Verify Deployment

```bash
# Check health endpoint
curl https://cloudflare-image-workers.<account_id>.workers.dev/health

# Expected response:
# {"status":"healthy","timestamp":1234567890,"authEnabled":true|false}
```

---

## Authentication Setup

### API Key Authentication

API keys protect the OpenAI API and MCP endpoints. Public endpoints (health, frontend, images) remain accessible without authentication.

#### Setting Up API Keys

**Option 1: Via GitHub Secrets (Recommended for CI/CD)**

1. Go to **Settings > Secrets and variables > Actions**
2. Add repository secret: `API_KEYS`
3. Value format: `key1,key2,key3` (comma-separated, no spaces)
4. Redeploy workers to apply changes

**Option 2: Via Wrangler CLI (For immediate testing)**

```bash
cd workers

# Set API keys directly on the worker
echo "my-api-key-1,my-api-key-2" | npx wrangler secret put API_KEYS
```

#### Using API Keys

Include the key in the `Authorization` header:

```bash
# OpenAI API
curl -H "Authorization: Bearer my-api-key-1" \
  https://cloudflare-image-workers.<account_id>.workers.dev/v1/images/generations \
  -d '{"prompt": "a cat"}'

# MCP endpoint
curl -H "Authorization: Bearer my-api-key-1" \
  https://cloudflare-image-workers.<account_id>.workers.dev/mcp/message \
  -d '{"jsonrpc":"2.0","method":"tools/list"}'
```

#### Public Endpoints (No Auth Required)

These endpoints work without authentication:
- `GET /health` - Health check
- `GET /` - Frontend UI
- `GET /images/*` - Generated images
- `GET /api/internal/models` - Model list

---

## Frontend Password Protection

The web frontend currently doesn't have built-in password protection. To add it, you have several options:

### Option 1: Cloudflare Access (Recommended)

Cloudflare Access provides zero-trust authentication without code changes.

**Setup:**
1. Go to Cloudflare Dashboard > Access > Applications
2. Add a self-hosted application
3. Domain: `cloudflare-image-workers.<account_id>.workers.dev`
4. Configure identity provider (Google, GitHub, etc.)
5. Add access policies

**Pros:**
- No code changes needed
- Supports SSO, MFA
- Audit logging
- Works with any identity provider

### Option 2: Basic Auth Middleware

Add simple password protection to the frontend:

Edit `workers/src/endpoints/frontend.ts`:

```typescript
// Add to serveFrontend function
const FRONTEND_PASSWORD = 'your-password-here';

export function serveFrontend(request: Request): Response {
  // Check for password in query or cookie
  const url = new URL(request.url);
  const providedPassword = url.searchParams.get('password') ||
                          getCookie(request, 'auth');

  if (providedPassword !== FRONTEND_PASSWORD) {
    return new Response(`
      <html>
        <body>
          <form method="GET">
            <input type="password" name="password" placeholder="Enter password" />
            <button type="submit">Login</button>
          </form>
        </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }

  // Set cookie and serve frontend
  // ... rest of function
}
```

### Option 3: Separate Frontend Deployment

Deploy the frontend separately with its own auth:
- Host on Cloudflare Pages with Access
- Or use Vercel/Netlify with their auth features
- Connect to the Workers API backend

---

## Running E2E Tests

### Test Against Production

```bash
# Run all E2E tests
gh workflow run e2e-tests.yml -f environment=production

# Run specific test file
gh workflow run e2e-tests.yml \
  -f environment=production \
  -f test_pattern="tests/api/mcp/mcp-sdk.spec.ts"
```

### Test Against Staging

```bash
gh workflow run e2e-tests.yml -f environment=staging
```

### Test Locally

```bash
# Start local server
cd packages/local
npm run dev

# In another terminal, run tests
cd e2e
TEST_TARGET=local npm test
```

---

## Environment Configuration

### Workers Environments

The `wrangler.toml` supports multiple environments:

```toml
# Production (default)
name = "cloudflare-image-workers"

# Staging
[env.staging]
name = "cloudflare-image-workers-staging"
vars = { ENVIRONMENT = "staging" }
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `IMAGE_EXPIRY_HOURS` | Hours before images auto-delete | 24 |
| `S3_CDN_URL` | Public CDN URL for images | (from secrets) |
| `API_KEYS` | Comma-separated API keys | (optional) |

---

## Troubleshooting

### Deployment Fails

```bash
# Check wrangler is configured
npx wrangler whoami

# Verify secrets are set
npx wrangler secret list

# Check logs
npx wrangler tail
```

### Authentication Errors

```bash
# Test with verbose output
curl -v -H "Authorization: Bearer YOUR_KEY" \
  https://your-worker.workers.dev/health

# Check if auth is enabled (should show "authEnabled": true)
curl https://your-worker.workers.dev/health
```

### Images Not Accessible

1. Verify R2 bucket has public access enabled
2. Check `S3_CDN_URL` secret is set correctly
3. Test direct R2 access: `curl $S3_CDN_URL/images/test.png`

### E2E Tests Fail

```bash
# Check URL construction
echo "https://cloudflare-image-workers.${CLOUDFLARE_ACCOUNT_ID}.workers.dev"

# Verify worker is accessible
curl -f "https://cloudflare-image-workers.${CLOUDFLARE_ACCOUNT_ID}.workers.dev/health"

# Run with debug output
TEST_TARGET=production DEBUG=1 npm test
```

---

## Migration from Old Naming Convention

If you previously used a custom subdomain (e.g., `tanyongsheng-net.workers.dev`), you need to:

1. **Update DNS** (if using custom domain):
   ```bash
   # Old: cloudflare-image-workers.tanyongsheng-net.workers.dev
   # New: cloudflare-image-workers.<account_id>.workers.dev
   ```

2. **Update wrangler.toml** (if needed):
   ```toml
   # If you want to keep old name, override in wrangler.toml
   name = "cloudflare-image-workers-tanyongsheng-net"
   ```

3. **Redeploy**:
   ```bash
   gh workflow run deploy-workers.yml -f environment=production
   ```

4. **Update tests** to use new URL or set `TEST_BASE_URL` override.

---

## Security Best Practices

1. **Rotate API keys regularly** - Generate new keys and retire old ones
2. **Use staging environment** - Test changes before production
3. **Enable Cloudflare Access** - For additional frontend protection
4. **Monitor access logs** - Check for unauthorized usage
5. **Set image expiry** - Keep `IMAGE_EXPIRY_HOURS` low to reduce storage costs and exposure
6. **Use HTTPS only** - Workers enforces this by default

---

## Cost Optimization

| Resource | Free Tier | Paid |
|----------|-----------|------|
| Workers | 100,000 requests/day | $0.50/million |
| Workers AI | Limited daily requests | Per-operation pricing |
| R2 Storage | 10GB/month | $0.015/GB/month |
| R2 Operations | 1M Class A, 10M Class B | Per-operation |

**Tips:**
- Set `IMAGE_EXPIRY_HOURS=1` for high-traffic scenarios
- Use staging for development to reduce production costs
- Monitor R2 usage in Cloudflare Dashboard

---

## Next Steps

1. ✅ Set up GitHub secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
2. ✅ Deploy infrastructure
3. ✅ Deploy Workers
4. ✅ Set up API keys (optional but recommended)
5. ✅ Configure frontend auth (optional)
6. ✅ Run E2E tests to verify

For support, check the [troubleshooting](#troubleshooting) section or review GitHub Actions logs.