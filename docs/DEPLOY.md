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
`CLOUDFLARE_API_TOKEN` (required). Both are consumed by the **deploy workflow
itself** (wrangler, migrations) and are deliberately **not** shipped to the
Worker as runtime secrets — ADR-001 made inference credentials database-only.
Optional runtime secrets are `API_KEYS`, `TZ`, `PROVIDER_DATA_KEY`, and
`ADMIN_API_KEY` — see
[Credentials Setup](CREDENTIALS_SETUP.md#optional-secrets).

`AI_ACCOUNTS`, if present, is a **one-shot D1 import source only** and is never
read by the Worker. See
[Server-side migration](CREDENTIALS_SETUP.md#migrating-ai_accounts-to-d1-one-shot-import).

`D1_DATABASE_ID` is also required for deploy, but it is **environment-scoped**, not
repository-scoped — see Step 3b.

**Note on `API_KEYS`**: if set, all OpenAI API endpoints and MCP endpoints
require `Authorization: Bearer <key>`. The client prompts for the key in a
login modal and sends it as a Bearer header. The client itself — the document
and the files under `/assets/` — is public: every browser downloads it, so the
auth gate covers the API routes, not the build output.

---

### Step 3b: Create the D1 provider database

Deploy applies `workers/migrations/*.sql` to a D1 database **before** deploying
the Worker, so that database must already exist. D1 database names are unique
within a Cloudflare account, so each environment needs its own:

```bash
cd workers
npx wrangler d1 create cloudflare-image-mcp-providers            # production
npx wrangler d1 create cloudflare-image-mcp-providers-staging    # staging
```

Add each printed `database_id` as the `D1_DATABASE_ID` secret on the matching
GitHub environment (`staging` → the staging id, `production` → the production
id):

```
Settings → Environments → <staging|production> → Environment secrets → New secret
```

> ⚠️ **Set it per environment, not at repository level.** One repository secret
> would point both environments at the same database, so staging deploys would
> migrate the production provider store.

Deploy fails fast with a clear error when `D1_DATABASE_ID` is missing, rather than
shipping a Worker bound to a database that does not exist.

After the first deploy, migrate existing `AI_ACCOUNTS` credentials into D1
with the one-shot import — preferred from CI (dispatch the deploy workflow
with the `import_credentials` input; no local blob handling), manual
otherwise — see
[CREDENTIALS_SETUP.md → Migrating AI_ACCOUNTS to D1](CREDENTIALS_SETUP.md#migrating-ai_accounts-to-d1-one-shot-import).
ADR-001 made D1 the only credential source, so this is a flag day: without the
import (or a key added in the admin UI) generation fails with
`No AI provider credentials configured`.

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

### Removing secrets a Worker already has

`wrangler secret bulk` only sets the keys in its payload — it never deletes
anything. So after the payload stops shipping a secret (e.g. the deprecated
`AI_ACCOUNTS`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`), **already
deployed Workers keep them** until you remove them deliberately:

```bash
npx wrangler secret delete AI_ACCOUNTS --name <worker-name>
npx wrangler secret delete CLOUDFLARE_ACCOUNT_ID --name <worker-name>
npx wrangler secret delete CLOUDFLARE_API_TOKEN --name <worker-name>
```

None of them is read at runtime (ADR-001), so leaving them is harmless — the
benefit is a smaller blast radius if a Worker is ever compromised. Removing
them does not affect deploy: the workflow keeps its own copies as GitHub
secrets for wrangler and the one-shot D1 import.

---

## 📁 How CI/CD Works

The file `.github/workflows/deploy-workers.yml` handles everything:

1. **Generates** `wrangler.toml` dynamically from your GitHub secrets
2. **Installs** dependencies
3. **Applies D1 migrations** — `wrangler d1 migrations apply PROVIDER_DB` against
   the bound database, resolved per environment via the `database_id` from `D1_DATABASE_ID`
4. **Deploys** to Cloudflare Workers
5. **Cleans up** the generated `wrangler.toml`

> ⚠️ **Important**: The `wrangler.toml` in the repo is only for local development. CI/CD generates its own.

To cut a versioned release (bump `workers/package.json`, auto-tag + Release notes), see `RELEASING.md`.

---

## 📋 Troubleshooting

| Issue                    | Solution                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `Authentication error`   | Check that `CLOUDFLARE_API_TOKEN` has the correct permissions                                                      |
| `R2 bucket not found`    | Create an R2 bucket named `image-generation` in your Cloudflare dashboard, or update `bucket_name` in the workflow |
| `Workers AI not enabled` | Go to Cloudflare Dashboard → AI → Workers AI and accept the terms                                                  |
| `Deployment failed`      | Check the Actions logs for specific error messages                                                                 |
| `D1_DATABASE_ID not set` | Create the database and add the secret per environment (Step 3b)                                                   |

---

## 🔗 Next Steps

- **Read the [API Reference](API.md)** - REST endpoints and parameters
- **Read the [MCP Guide](MCP.md)** - Connect via MCP protocol
- **Customize the worker name** - Edit `name = "cloudflare-image-workers"` in the deploy workflow or wrangler.toml
