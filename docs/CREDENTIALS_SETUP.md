# Quick Setup Guide - Required Credentials (Workers-only)

This is a quick reference for setting up credentials for Cloudflare Image MCP.

## ✅ Cloudflare API Access (for Wrangler / CI)

1. **Cloudflare API Token**
   - Purpose: Deploy and manage Cloudflare Workers (and related resources via Wrangler)
   - How to get:
     1. Go to https://dash.cloudflare.com/profile/api-tokens
     2. Click "Create Token"
     3. Use an appropriate template (or create custom) with Workers permissions
     4. Copy token (shown only once!)
   - Where to use:
     - GitHub Secret: `CLOUDFLARE_API_TOKEN`

2. **Cloudflare Account ID**
   - Purpose: Identify your Cloudflare account
   - How to get:
     1. Go to https://dash.cloudflare.com
     2. Navigate to Workers & Pages
     3. Account ID shown in right sidebar
   - Where to use:
     - GitHub Secret: `CLOUDFLARE_ACCOUNT_ID`

## ✅ R2 Storage

Images are stored in **Cloudflare R2** via the Worker’s `IMAGE_BUCKET` binding.

You do **not** need S3-compatible R2 API credentials (`S3_ACCESS_KEY`/`S3_SECRET_KEY`) for normal operation.

Optional:
- Enable R2 public access to get a public URL like `https://pub-<id>.r2.dev`
- Set this as the Worker secret `S3_CDN_URL` if you want absolute image URLs; otherwise the API returns relative `/images/...`.

## Optional: API authentication

To protect MCP/OpenAI endpoints:
- Set `API_KEYS` as a Worker secret (comma-separated)

Example:
```bash
echo "key1,key2" | npx wrangler secret put API_KEYS
```
