# Deployment Guide

This guide covers deploying the Cloudflare Image MCP service to Cloudflare Workers.

## Architecture Overview

The project has two deployment targets:

| Target | Location | Purpose | Transport |
|--------|----------|---------|-----------|
| **Workers** | `workers/` | HTTP MCP + OpenAI API + Frontend | HTTP/SSE |
| **NPM Package** | `mcp/` | Stdio MCP Server | stdio |

---

## Deploying Cloudflare Workers

The `workers/` folder contains the complete service with:
- OpenAI-compatible REST API (`/v1/images/*`)
- HTTP MCP endpoint (`/mcp/message`)
- Web frontend (`/`)

### Prerequisites

1. **Cloudflare Account** with Workers AI and R2 storage enabled
2. **Wrangler CLI** installed: `npm install -g wrangler`
3. **R2 Bucket** created for image storage

### Step 1: Create R2 Buckets

```bash
# Production bucket
npx wrangler r2 bucket create cloudflare-image-mcp-images

# Preview bucket for development
npx wrangler r2 bucket create cloudflare-image-mcp-images-preview
```

### Step 2: Configure R2 Public Access

1. Go to Cloudflare Dashboard > R2 > Your bucket
2. Settings > Public access > Enable public read access
3. Create a custom domain or use R2.dev subdomain:
   - `https://pub-<your-id>.r2.dev`

### Step 3: Configure wrangler.toml

Edit `workers/wrangler.toml`:

```toml
name = "cloudflare-image-workers"
account_id = "YOUR_ACCOUNT_ID"
compatibility_date = "2025-01-01"
main = "src/index.ts"

# R2 Bucket configuration
[[r2_buckets]]
binding = "IMAGE_BUCKET"
bucket_name = "cloudflare-image-mcp-images"
preview_bucket_name = "cloudflare-image-mcp-images-preview"

# Workers AI
[ai]
binding = "AI"

# Environment variables
[vars]
IMAGE_EXPIRY_HOURS = 24  # Images auto-delete after 24 hours
CDN_URL = "https://pub-<your-id>.r2.dev"  # Your R2 public URL
```

### Step 4: Deploy to Production

```bash
cd workers

# Test locally with remote resources
npx wrangler dev --remote

# Deploy to production
npx wrangler deploy
```

Your worker will be available at:
- **Frontend**: `https://cloudflare-image-workers.<your-subdomain>.workers.dev`
- **API**: `https://cloudflare-image-workers.<your-subdomain>.workers.dev/v1/images/generations`
- **MCP**: `https://cloudflare-image-workers.<your-subdomain>.workers.dev/mcp/message`

---

## Deploying NPM Package (Stdio MCP)

The `mcp/` folder is a standalone npm package for stdio-based MCP transport.

### Step 1: Build the Package

```bash
cd mcp

# Install dependencies
npm install

# Type check
npm run check

# Lint
npm run lint

# Build
npm run build
```

### Step 2: Publish to NPM

```bash
# Login to NPM
npm login

# Publish
npm publish
```

### Step 3: Install and Use

```bash
# Install
npm install cloudflare-image-mcp

# Run directly
npx cloudflare-image-mcp
```

Or configure in your MCP client:

```json
{
  "mcpServers": {
    "cloudflare-image": {
      "command": "npx",
      "args": ["cloudflare-image-mcp"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your_token",
        "CLOUDFLARE_ACCOUNT_ID": "your_account_id",
        "S3_BUCKET": "your-bucket",
        "S3_ENDPOINT": "https://your-id.r2.cloudflarestorage.com",
        "S3_ACCESS_KEY": "your_key",
        "S3_SECRET_KEY": "your_secret",
        "S3_CDN_URL": "https://pub-your-id.r2.dev"
      }
    }
  }
}
```

---

## Environment Variables

### Workers Deployment (via wrangler.toml)

| Variable | Description | Default |
|----------|-------------|---------|
| `IMAGE_EXPIRY_HOURS` | Hours before images are deleted | 24 |
| `CDN_URL` | Public URL for generated images | Required |

### NPM Package (Stdio MCP)

| Variable | Description | Required |
|----------|-------------|----------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | Yes |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | Yes |
| `S3_BUCKET` | R2/S3 bucket name | Yes |
| `S3_REGION` | Region (use "auto" for R2) | Yes |
| `S3_ENDPOINT` | R2 endpoint URL | Yes |
| `S3_ACCESS_KEY` | R2 access key | Yes |
| `S3_SECRET_KEY` | R2 secret key | Yes |
| `S3_CDN_URL` | Public CDN URL for images | Yes |
| `DEFAULT_IMAGE_GENERATION_MODEL` | Default model ID | Optional |

---

## Troubleshooting

### R2 Access Issues

- Ensure public access is enabled on the bucket
- Check CORS settings if accessing from browser
- Verify CDN_URL points to a publicly accessible domain

### Worker Deployment Fails

```bash
# Check Wrangler version
npx wrangler --version

# Update if needed
npm install -D wrangler@latest

# Retry deployment
npx wrangler deploy
```

### Images Not Storing

- Check R2 bucket exists and is linked in wrangler.toml
- Verify IMAGE_BUCKET binding name matches code
- Check worker logs: `npx wrangler deploy --log-level debug`
