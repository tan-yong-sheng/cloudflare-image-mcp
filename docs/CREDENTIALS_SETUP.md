# Quick Setup Guide - Required Credentials

This is a quick reference for setting up credentials for Cloudflare Image MCP.

## 📋 Credentials Checklist

### ✅ Cloudflare API Access

1. **Cloudflare API Token**
   - Purpose: Access Cloudflare Workers AI
   - How to get:
     1. Go to https://dash.cloudflare.com/profile/api-tokens
     2. Click "Create Token"
     3. Use "Edit Cloudflare Workers" template OR create custom with:
        - Account → Workers Scripts → Edit
        - Account → Workers R2 Storage → Edit
     4. Copy token (shown only once!)
   - Where to use:
     - GitHub Secret: `CLOUDFLARE_API_TOKEN`
     - `.env` file: `CLOUDFLARE_API_TOKEN=xxx`

2. **Cloudflare Account ID**
   - Purpose: Identify your Cloudflare account
   - How to get:
     1. Go to https://dash.cloudflare.com
     2. Navigate to Workers & Pages
     3. Account ID shown in right sidebar
   - Where to use:
     - GitHub Secret: `CLOUDFLARE_ACCOUNT_ID`
     - `.env` file: `CLOUDFLARE_ACCOUNT_ID=xxx`

### ✅ R2 Storage (Cloudflare Object Storage)

3. **R2 Bucket**
   - Purpose: Store generated images
   - How to create:
     1. Go to Cloudflare Dashboard → R2
     2. Click "Create bucket"
     3. Name: `cloudflare-image-mcp-images` (or custom)
     4. Click "Create bucket"
   - Where to use:
     - `.env` file: `S3_BUCKET=cloudflare-image-mcp-images`

4. **R2 Endpoint URL**
   - Purpose: API endpoint for R2 bucket
   - How to get:
     1. Open your R2 bucket
     2. Go to Settings
     3. Copy the S3 API endpoint
     4. Format: `https://<account-id>.r2.cloudflarestorage.com`
   - Where to use:
     - `.env` file: `S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com`

5. **R2 API Token (Access Key & Secret Key)**
   - Purpose: Authenticate to R2 storage
   - How to create:
     1. Cloudflare Dashboard → R2
     2. Click "Manage R2 API Tokens"
     3. Click "Create API token"
     4. Permissions: Admin Read & Write
     5. Copy Access Key ID and Secret Access Key
   - Where to use:
     - `.env` file: 
       ```
       S3_ACCESS_KEY=xxx
       S3_SECRET_KEY=xxx
       ```

6. **CDN URL (Optional)**
   - Purpose: Public URL for generated images
   - How to setup:
     1. Open your R2 bucket
     2. Settings → Public Access
     3. Click "Allow Access" or "Connect Domain"
     4. Copy the public URL
     5. Format: `https://pub-xxx.r2.dev` or custom domain
   - Where to use:
     - GitHub Secret: `CDN_URL` (optional)
     - `.env` file: `S3_CDN_URL=https://pub-xxx.r2.dev`

## 🔒 GitHub Secrets Setup

For automated deployments via GitHub Actions:

1. Go to your repository on GitHub
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each secret:

| Secret Name | Value | Required For |
|-------------|-------|--------------|
| `CLOUDFLARE_API_TOKEN` | Your API token | Workers deployment |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID | Workers deployment |
| `CDN_URL` | Your R2 public URL | Optional |

**Note:** `GITHUB_TOKEN` is automatically provided for GHCR pushes.

## 📝 Environment File (.env)

For local development or Docker deployment:

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in all values:
   ```bash
   # Required
   CLOUDFLARE_API_TOKEN=your_token_here
   CLOUDFLARE_ACCOUNT_ID=your_account_id_here
   S3_BUCKET=cloudflare-image-mcp-images
   S3_ENDPOINT=https://your_account.r2.cloudflarestorage.com
   S3_ACCESS_KEY=your_access_key_here
   S3_SECRET_KEY=your_secret_key_here
   
   # Optional but recommended
   S3_CDN_URL=https://pub-xxx.r2.dev
   ```

## ✅ Verification

After setting up credentials:

### Test Cloudflare API Access

```bash
curl https://api.cloudflare.com/client/v4/user/tokens/verify \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

Expected response: `{"success":true,...}`

### Test R2 Access

```bash
# Using AWS CLI with R2
aws s3 ls --endpoint-url https://YOUR_ACCOUNT.r2.cloudflarestorage.com \
  --profile cloudflare

# Or test from local server
cd packages/local
npm run dev
# Check logs for storage connection
```

## 🚨 Security Reminders

- ✅ Never commit `.env` files to Git
- ✅ Never commit `wrangler.toml` with credentials
- ✅ Use GitHub Secrets for CI/CD
- ✅ Rotate API tokens regularly
- ✅ Use minimal permissions for tokens
- ✅ Enable 2FA on Cloudflare and GitHub

## 📞 Troubleshooting

### "Authentication failed"
- Verify API token is correct and not expired
- Check token has required permissions
- Ensure Account ID matches the token's account

### "Bucket not found"
- Verify bucket name is exact match
- Check bucket exists in your account
- Ensure R2 is enabled for your account

### "Access denied" for R2
- Verify R2 API token credentials
- Check token has Read & Write permissions
- Ensure endpoint URL is correct

## 📚 More Information

- Full deployment guide: [CICD_DEPLOYMENT.md](CICD_DEPLOYMENT.md)
- Cloudflare API docs: https://developers.cloudflare.com/api/
- R2 documentation: https://developers.cloudflare.com/r2/

---

**Quick Start:** Once you have all credentials, you can deploy in minutes!

1. Add GitHub Secrets → Auto-deploy to Cloudflare Workers ✅
2. Create `.env` file → Run locally with `docker-compose up -d` ✅
