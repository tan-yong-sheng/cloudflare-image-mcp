# Environment Variable Setup (Workers-only)

## Overview

This project runs on **Cloudflare Workers**.

For deploying and developing with Wrangler, you only need:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

R2 and Workers AI are configured via `workers/wrangler.toml` bindings.

## Required Environment Variables

```bash
CLOUDFLARE_API_TOKEN="your_api_token_here"
CLOUDFLARE_ACCOUNT_ID="your_account_id_here"
```

## Optional Worker Secrets

- `API_KEYS` (comma-separated) to protect OpenAI + MCP endpoints
- `S3_CDN_URL` (public R2 URL) if you want absolute image URLs; otherwise responses use relative `/images/...`
- `TZ` for logging

## Part 1: Cloudflare Workers AI Setup

### Step 1: Get Cloudflare Account ID

1. Go to https://dash.cloudflare.com/
2. Click 'Overview'
3. Scroll down to find 'Account ID'

![Account ID location](../static/img/cloudflare-account-id.png)

### Step 2: Create API Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click 'Create Token'
3. Configure with these permissions:
   - **Workers AI**: Read
   - **Workers AI**: Write
   - **Account R2**: Read
   - **Account R2**: Write

![Create API Token - Part 1](../static/img/create-user-api-token-part1.png)

4. Fill in token name and settings:

![Create API Token - Part 2](../static/img/create-user-api-token-part2.png)

5. Review and create:

![Create API Token - Part 3](../static/img/create-user-api-token-part3.png)

6. Copy your API token:

![Create API Token - Part 4](../static/img/create-user-api-token-part4.png)

## Part 2: Cloudflare R2 Storage Setup

### Step 1: Create R2 Bucket

1. Go to R2 in Cloudflare Dashboard
2. Click 'Create Bucket'
3. Name it `cloudflare-image-mcp-images`

![Create R2 Bucket](../static/img/create_R2_bucket.png)

### Step 2: Enable Public Access

1. Go to bucket Settings
2. Enable 'Public access to bucket'
3. Set Allowed Origins to `*` for CORS

![R2 Public Access - Part 1](../static/img/r2-enable-public-access-part1.png)

![R2 Public Access - Part 2](../static/img/r2-enable-public-access-part2.png)

### Step 3: Create R2 API Token

1. Go to R2 > Manage R2 API Tokens
2. Create a new token with:
   - **Permissions**: Object Read, Object Write
   - **TTL**: Optional (or no expiration)

![R2 API Token - Part 1](../static/img/r2-create-user-api-token-part1.png)

![R2 API Token - Part 2](../static/img/r2-create-user-api-token-part2.png)

3. Copy the Access Key ID and Secret Access Key:

![R2 API Token - Part 3](../static/img/r2-create-user-api-token-part3.png)

![R2 API Token - Part 4](../static/img/r2-create-user-api-token-part4.png)

### Step 4: Get Public URL (optional)

From R2 bucket settings (after enabling public access), note:
- **Public bucket URL**: `https://pub-<id>.r2.dev`

If you set this as the Worker secret `S3_CDN_URL`, the API returns absolute image URLs; otherwise it returns relative `/images/...`.

## Setting Up Cloudflare Workers

### 1. Configure bindings (wrangler.toml)

- R2 bucket binding: `IMAGE_BUCKET`
- Workers AI binding: `AI`

### 2. Deploy

```bash
cd workers
npx wrangler deploy
```

### 3. Optional: set secrets

```bash
# Protect endpoints (optional)
echo "key1,key2" | npx wrangler secret put API_KEYS

# Use absolute image URLs (optional)
echo "https://pub-<id>.r2.dev" | npx wrangler secret put S3_CDN_URL
```

### 2. Deploy

```bash
npx wrangler deploy
```

## Troubleshooting

### API Token Not Working

- Ensure token has correct permissions
- Check token hasn't expired

### R2 Access Denied

- Verify Access Key ID and Secret Access Key
- Ensure R2 API token has Object Read/Write permissions
- Check bucket name matches exactly

### Public URL Not Loading

- Verify public access is enabled in R2 settings
- Check CORS allowed origins includes your domain or `*`

## References

- [Cloudflare Docs - Create API Token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Cloudflare R2 Setup Guide](https://developers.cloudflare.com/r2/get-started/)
- [R2 with S3 Compatibility](https://developers.cloudflare.com/r2/api/s3/)
