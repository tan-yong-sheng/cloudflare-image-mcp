# Deployment Guide (Workers-only)

This guide covers deploying the Cloudflare Image MCP service to **Cloudflare Workers** using automated CI/CD.

---

## 🚀 Quick Deploy (5 Minutes)

### Step 1: Fork This Repository

Click the **Fork** button at the top right of this repo to create your own copy.

```
https://github.com/tan-yong-sheng/cloudflare-image-mcp → YourAccount/cloudflare-image-mcp
```

---

### Step 2: Get Your Cloudflare Credentials

You need **2 values** from your Cloudflare dashboard:

| Credential | Where to Find It |
|------------|------------------|
| **Account ID** | [Cloudflare Dashboard](https://dash.cloudflare.com) → Right sidebar on any domain |
| **API Token** | [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile → API Tokens → Create Token |

#### Creating Your API Token

1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens) in your Cloudflare profile
2. Click **Create Token** → **Custom token**
3. Configure these settings:

| Setting | Value |
|---------|-------|
| Token name | `Cloudflare Image MCP Deploy` |
| Permissions | `Account` → `Workers Scripts` → `Edit` |
| | `Account` → `Workers R2 Storage` → `Edit` |
| | `Account` → `Workers AI` → `Edit` |
| | `Account` → `Workers AI` → `Read` |
| Account Resources | Include: `<your account>` |

4. Click **Continue to summary** → **Create Token**
5. **Copy the token immediately** (you won't see it again!)

---

### Step 3: Add GitHub Secrets

Go to your forked repository and add the credentials:

```
https://github.com/YOUR_USERNAME/cloudflare-image-mcp/settings/secrets/actions
```

Click **New repository secret** and add these:

| Secret Name | Value | Required |
|-------------|-------|----------|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID | Yes |
| `CLOUDFLARE_API_TOKEN` | The API token you just created | Yes |
| `API_KEYS` | Comma-separated list of API keys (e.g., `key1,key2,key3`) | Optional |
| `AI_ACCOUNTS` | JSON array of `{"account_id","api_token"}` for multi-account AI inference (see [Credentials Setup](CREDENTIALS_SETUP.md#ai_accounts-format)) | Optional |
| `TZ` | Your timezone (e.g., `America/New_York`, `Asia/Singapore`) | Optional |

**Note on `API_KEYS`**: If set, all OpenAI API endpoints, MCP endpoints, and the web frontend will require authentication via the `Authorization: Bearer YOUR_KEY` header or `?key=YOUR_KEY` query parameter.

---

### Step 4: Deploy!

The deployment happens automatically when you:

1. **Push to the `main` branch**, OR
2. **Manually trigger** the workflow:
   - Go to **Actions** tab in your repo
   - Select **Deploy to Cloudflare Workers**
   - Click **Run workflow**

You'll see the deployment progress in real-time.

---

### Step 5: Verify Deployment

Once the workflow completes, your worker will be live at:

```
https://cloudflare-image-workers.<your-subdomain>.workers.dev
```

Test it:

```bash
curl https://<your-worker-url>/health
```

You should see: `{"status":"ok"}`

---

## 📁 How CI/CD Works

The file `.github/workflows/deploy-workers.yml` handles everything:

1. **Generates** `wrangler.toml` dynamically from your GitHub secrets
2. **Installs** dependencies
3. **Deploys** to Cloudflare Workers
4. **Cleans up** the generated `wrangler.toml`

> ⚠️ **Important**: The `wrangler.toml` in the repo is only for local development. CI/CD generates its own.

---

## 🖥️ Local Development (Optional)

If you want to test locally before deploying:

```bash
cd workers
npm ci
npx wrangler dev --remote
```

Then open:
- Web UI: http://localhost:8787/
- API: http://localhost:8787/v1/images/generations

### Local Dev Notes

You may need to configure a **preview R2 bucket** for local development:

1. Create a dev bucket in Cloudflare R2
2. Edit `workers/wrangler.toml` and add:

```toml
[[r2_buckets]]
binding = "IMAGE_BUCKET"
bucket_name = "your-production-bucket"
preview_bucket_name = "your-dev-bucket"  # Add this line
```

---

## 🔧 Manual Deploy (Alternative)

If you prefer not to use GitHub Actions:

```bash
cd workers
npm ci

# Set your credentials as environment variables
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"

# Deploy
npx wrangler deploy
```

---

## 📋 Troubleshooting

| Issue | Solution |
|-------|----------|
| `Authentication error` | Check that `CLOUDFLARE_API_TOKEN` has the correct permissions |
| `R2 bucket not found` | Create an R2 bucket named `image-generation` in your Cloudflare dashboard, or update `bucket_name` in the workflow |
| `Workers AI not enabled` | Go to Cloudflare Dashboard → AI → Workers AI and accept the terms |
| `Deployment failed` | Check the Actions logs for specific error messages |

---

## 🔗 Next Steps

- **Read the [Usage Guide](USAGE.md)** - Learn how to use the API
- **Read the [MCP Guide](MCP.md)** - Connect via MCP protocol
- **Customize the worker name** - Edit `name = "cloudflare-image-workers"` in the deploy workflow or wrangler.toml
