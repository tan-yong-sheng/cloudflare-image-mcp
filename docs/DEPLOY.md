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

| Credential     | Where to Find It                                                                             |
| -------------- | -------------------------------------------------------------------------------------------- |
| **Account ID** | [Cloudflare Dashboard](https://dash.cloudflare.com) → Right sidebar on any domain            |
| **API Token**  | [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile → API Tokens → Create Token |

#### Creating Your API Token

1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens) in your Cloudflare profile
2. Click **Create Token** → **Custom token**
3. Token name: `Cloudflare Image MCP Deploy`; account resources: your account.
   Required permissions — see [Credentials Setup](CREDENTIALS_SETUP.md#required-api-token-permissions).
4. Click **Continue to summary** → **Create Token**
5. **Copy the token immediately** (you won't see it again!)

---

### Step 3: Add GitHub Secrets

Go to your forked repository and add the credentials:

```
https://github.com/YOUR_USERNAME/cloudflare-image-mcp/settings/secrets/actions
```

Click **New repository secret** and add `CLOUDFLARE_ACCOUNT_ID` (required) and
`CLOUDFLARE_API_TOKEN` (required). Optional secrets (`API_KEYS`, `AI_ACCOUNTS`, `TZ`)
— see [Credentials Setup](CREDENTIALS_SETUP.md#optional-secrets).

**Note on `API_KEYS`**: if set, all OpenAI API endpoints, MCP endpoints, and the
web frontend require `Authorization: Bearer <key>`. The frontend prompts for the
key in a login modal and sends it as a Bearer header.

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

You should see `{"status":"healthy", ...}` with version, timezone, and `authEnabled`.

---

## 📁 How CI/CD Works

The file `.github/workflows/deploy-workers.yml` handles everything:

1. **Generates** `wrangler.toml` dynamically from your GitHub secrets
2. **Installs** dependencies
3. **Deploys** to Cloudflare Workers
4. **Cleans up** the generated `wrangler.toml`

> ⚠️ **Important**: The `wrangler.toml` in the repo is only for local development. CI/CD generates its own.

---

## 📋 Troubleshooting

| Issue                    | Solution                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `Authentication error`   | Check that `CLOUDFLARE_API_TOKEN` has the correct permissions                                                      |
| `R2 bucket not found`    | Create an R2 bucket named `image-generation` in your Cloudflare dashboard, or update `bucket_name` in the workflow |
| `Workers AI not enabled` | Go to Cloudflare Dashboard → AI → Workers AI and accept the terms                                                  |
| `Deployment failed`      | Check the Actions logs for specific error messages                                                                 |

---

## 🔗 Next Steps

- **Read the [API Reference](API.md)** - REST endpoints and parameters
- **Read the [MCP Guide](MCP.md)** - Connect via MCP protocol
- **Customize the worker name** - Edit `name = "cloudflare-image-workers"` in the deploy workflow or wrangler.toml
