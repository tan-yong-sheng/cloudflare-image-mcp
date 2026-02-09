# CI/CD Deployment Guide

This guide covers automated deployment to Cloudflare Workers.

## 🚀 Quick Overview

This repository includes one automated deployment pipeline:

1. **Cloudflare Workers** - Deploys the `workers/` folder to Cloudflare Workers

---

## 📋 Prerequisites

### GitHub Repository Settings

1. **Enable GitHub Actions**
   - Go to repository Settings → Actions → General
   - Enable "Read and write permissions" for workflows
   - Enable "Allow GitHub Actions to create and approve pull requests"

---

## 🔐 Required Secrets

Add the following secrets to your repository (Settings → Secrets and variables → Actions → New repository secret):

| Secret Name | Description | How to Get It |
|-------------|-------------|---------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token with Workers permissions | Cloudflare Dashboard → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID | Cloudflare Dashboard (right sidebar) |

### Optional secrets

| Secret Name | Description |
|-------------|-------------|
| `API_KEYS` | Comma-separated API keys to protect MCP/OpenAI endpoints |
| `S3_CDN_URL` | Public R2 URL for absolute image URLs (otherwise relative `/images/...`) |
| `TZ` | Timezone for logging |

---

## 🎯 Deployment Workflow

### Cloudflare Workers Deployment

**File:** `.github/workflows/deploy-workers.yml`

**Triggers:**
- Push to `main` branch (when `workers/**` changes)
- Manual trigger via GitHub Actions UI

**What it does:**
1. Checks out code
2. Installs dependencies
3. Runs TypeScript type checking
4. Generates `wrangler.toml` for the selected environment
5. Deploys to Cloudflare Workers

---

## Running E2E tests

Use `.github/workflows/e2e-tests.yml` to run Playwright tests against staging/production Workers.
