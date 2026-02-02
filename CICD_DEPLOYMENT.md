# CI/CD Deployment Guide

This guide covers automated deployment to Cloudflare Workers and GitHub Container Registry (GHCR).

## 🚀 Quick Overview

This repository includes two automated deployment pipelines:

1. **Cloudflare Workers** - Deploys the `workers/` folder to Cloudflare Workers
2. **GHCR (Docker)** - Builds and publishes the `packages/` folder as a Docker image

---

## 📋 Prerequisites

### GitHub Repository Settings

1. **Enable GitHub Actions**
   - Go to repository Settings → Actions → General
   - Enable "Read and write permissions" for workflows
   - Enable "Allow GitHub Actions to create and approve pull requests"

2. **Enable GitHub Packages**
   - Go to repository Settings → Packages
   - Ensure packages are enabled for your repository

---

## 🔐 Required Secrets

### For Cloudflare Workers Deployment

Add the following secrets to your repository (Settings → Secrets and variables → Actions → New repository secret):

| Secret Name | Description | How to Get It |
|-------------|-------------|---------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token with Workers permissions | [Generate here](https://dash.cloudflare.com/profile/api-tokens) |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID | Found in Cloudflare Dashboard → Workers & Pages |
| `CDN_URL` (optional) | Your R2 CDN URL | R2 bucket → Settings → Public access |

#### Creating Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use template "Edit Cloudflare Workers" or create custom token with:
   - **Permissions:**
     - Account → Workers Scripts → Edit
     - Account → Workers KV Storage → Edit (if using KV)
     - Account → Workers R2 Storage → Edit
   - **Account Resources:**
     - Include → Your account
4. Copy the token (you won't see it again!)
5. Add to GitHub Secrets as `CLOUDFLARE_API_TOKEN`

#### Getting Cloudflare Account ID

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to Workers & Pages
3. Your Account ID is shown in the right sidebar
4. Add to GitHub Secrets as `CLOUDFLARE_ACCOUNT_ID`

### For GitHub Container Registry (GHCR)

**No additional secrets needed!** 

GitHub automatically provides `GITHUB_TOKEN` with permissions to push to GHCR. However, ensure your workflow has the correct permissions (already configured in the workflow file).

---

## 🎯 Deployment Workflows

### 1. Cloudflare Workers Deployment

**File:** `.github/workflows/deploy-workers.yml`

**Triggers:**
- Push to `main` branch (when `workers/**` changes)
- Manual trigger via GitHub Actions UI

**What it does:**
1. ✅ Checks out code
2. ✅ Installs dependencies
3. ✅ Runs TypeScript type checking
4. ✅ Creates `wrangler.toml` from template with secrets
5. ✅ Deploys to Cloudflare Workers
6. ✅ Provides deployment summary

**Manual Deployment:**
1. Go to Actions tab in GitHub
2. Select "Deploy to Cloudflare Workers"
3. Click "Run workflow"
4. Choose environment (production/staging)
5. Click "Run workflow"

**Deployed Endpoints:**
- Frontend: `https://cloudflare-image-workers.<subdomain>.workers.dev/`
- OpenAI API: `https://cloudflare-image-workers.<subdomain>.workers.dev/v1/images/generations`
- MCP HTTP: `https://cloudflare-image-workers.<subdomain>.workers.dev/mcp`
- MCP SSE: `https://cloudflare-image-workers.<subdomain>.workers.dev/mcp?transport=sse`

### 2. Docker Image to GHCR

**File:** `.github/workflows/deploy-ghcr.yml`

**Triggers:**
- Push to `main` branch (when `packages/**` or `Dockerfile` changes)
- New version tags (`v*`)
- Manual trigger via GitHub Actions UI

**What it does:**
1. ✅ Checks out code
2. ✅ Sets up Docker Buildx (multi-platform builds)
3. ✅ Logs in to GHCR
4. ✅ Extracts metadata and tags
5. ✅ Builds Docker image (amd64 + arm64)
6. ✅ Pushes to GHCR
7. ✅ Runs smoke test
8. ✅ Generates attestation

**Image Tags:**
- `latest` - Latest build from main branch
- `main` - Main branch
- `v1.0.0` - Semantic version tags
- `sha-<commit>` - Git commit SHA

**Pull the image:**
```bash
docker pull ghcr.io/tan-yong-sheng/cloudflare-image-mcp:latest
```

---

## 🐳 Using the Docker Image

### Option 1: Docker Run

```bash
docker run -d \
  --name cloudflare-image-mcp \
  -p 3000:3000 \
  -e CLOUDFLARE_API_TOKEN=your_token \
  -e CLOUDFLARE_ACCOUNT_ID=your_account_id \
  -e S3_BUCKET=your_bucket \
  -e S3_ENDPOINT=https://your_account.r2.cloudflarestorage.com \
  -e S3_ACCESS_KEY=your_access_key \
  -e S3_SECRET_KEY=your_secret_key \
  -e S3_CDN_URL=https://pub-xxx.r2.dev \
  ghcr.io/tan-yong-sheng/cloudflare-image-mcp:latest
```

### Option 2: Docker Compose

1. **Create `.env` file:**

```bash
# Copy example and fill in your credentials
cp .env.example .env
```

2. **Start with Docker Compose:**

```bash
docker-compose up -d
```

3. **View logs:**

```bash
docker-compose logs -f
```

4. **Stop:**

```bash
docker-compose down
```

**Access the service:**
- Frontend: http://localhost:3000/
- OpenAI API: http://localhost:3000/v1/images/generations
- MCP HTTP: http://localhost:3000/mcp

---

## 🔄 Deployment Process

### Automatic Deployment

Both workflows are triggered automatically:

1. **Make changes** to `workers/` or `packages/`
2. **Commit and push** to main branch
3. **GitHub Actions** automatically builds and deploys
4. **Check status** in Actions tab
5. **View summary** in workflow run

### Manual Deployment

**Cloudflare Workers:**
1. Go to Actions → "Deploy to Cloudflare Workers"
2. Click "Run workflow"
3. Select environment
4. Monitor progress

**Docker Image:**
1. Go to Actions → "Build and Push to GHCR"
2. Click "Run workflow"
3. Monitor progress
4. Image available in Packages

---

## 🧪 Testing Deployments

### Test Cloudflare Workers

```bash
# Health check
curl https://cloudflare-image-workers.*.workers.dev/health

# List models
curl https://cloudflare-image-workers.*.workers.dev/api/internal/models

# MCP initialize
curl -X POST https://cloudflare-image-workers.*.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### Test Docker Container

```bash
# Health check
curl http://localhost:3000/health

# List models
curl http://localhost:3000/api/internal/models

# MCP tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## 🔒 Security Best Practices

1. **Never commit secrets** to the repository
2. **Use GitHub Secrets** for sensitive data
3. **Rotate API tokens** regularly
4. **Use minimal permissions** for API tokens
5. **Enable 2FA** on GitHub and Cloudflare accounts
6. **Review workflow logs** for sensitive data leaks
7. **Use environment-specific secrets** for staging/production

---

## 📊 Monitoring Deployments

### GitHub Actions

- **Status badges** in README
- **Deployment history** in Actions tab
- **Workflow run summaries**
- **Email notifications** (configure in Settings)

### Cloudflare Workers

- **Analytics** in Cloudflare Dashboard
- **Logs** in Workers → Your Worker → Logs
- **Metrics** for requests, errors, duration

### Docker Container

```bash
# Container logs
docker logs cloudflare-image-mcp -f

# Container stats
docker stats cloudflare-image-mcp

# Health check
docker inspect cloudflare-image-mcp | grep Health
```

---

## 🐛 Troubleshooting

### Cloudflare Workers Deployment Fails

**Check:**
1. API token has correct permissions
2. Account ID is correct
3. R2 bucket exists
4. wrangler.toml.example is properly formatted

**Common errors:**
- "Authentication error" → Check API token
- "Account not found" → Verify Account ID
- "Binding not found" → Check R2 bucket name

### Docker Build Fails

**Check:**
1. Dockerfile syntax
2. Package.json dependencies
3. TypeScript compilation
4. Build context includes required files

**Common errors:**
- "npm ci failed" → Delete package-lock.json locally and regenerate
- "TypeScript errors" → Run `npm run check` locally first
- "Context size too large" → Check .dockerignore

### GHCR Push Fails

**Check:**
1. Workflow has correct permissions
2. Package settings allow public access
3. GITHUB_TOKEN has write permissions

**Fix permissions:**
- Settings → Actions → General
- Enable "Read and write permissions"

---

## 📝 Environment Variables Reference

### Required for Both Deployments

| Variable | Description | Example |
|----------|-------------|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | `abc123...` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | `a1b2c3d4...` |
| `S3_BUCKET` | R2 bucket name | `cloudflare-image-mcp-images` |
| `S3_ENDPOINT` | R2 endpoint | `https://abc.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY` | R2 access key | `abc123...` |
| `S3_SECRET_KEY` | R2 secret key | `xyz789...` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `S3_CDN_URL` | Public R2 URL | `https://pub-xxx.r2.dev` |
| `IMAGE_EXPIRY_HOURS` | Image auto-delete time | `24` |
| `DEFAULT_MODEL` | Default AI model | `@cf/black-forest-labs/flux-1-schnell` |
| `PORT` | Server port (Docker only) | `3000` |

---

## 🎓 Learn More

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Docker Documentation](https://docs.docker.com/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

---

## 📞 Support

If you encounter issues:

1. Check GitHub Actions logs
2. Review this documentation
3. Check Cloudflare Dashboard logs
4. Open an issue on GitHub

---

**Last Updated:** 2026-02-02  
**Version:** 1.0.0
