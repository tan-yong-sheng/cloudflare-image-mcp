# 🌍 Environment Setup (Cloudflare Workers Only)

This project runs **only on Cloudflare Workers**.

---

## ✅ Required Environment Variables

These **two variables are all you need** for deployment and CI:

| Variable                | Description                      |
| ----------------------- | -------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID       |
| `CLOUDFLARE_API_TOKEN`  | API token used to deploy Workers |

Create a Cloudflare API Token (user-scoped) here:
**[https://dash.cloudflare.com/](https://dash.cloudflare.com/)<CLOUDFLARE_ACCOUNT_ID>/api-tokens**

```bash
export CLOUDFLARE_ACCOUNT_ID="<your-account-id>"
export CLOUDFLARE_API_TOKEN="<your-api-token>"
```

---

## 🚀 GitHub Actions Setup

Store both values as **GitHub repository secrets** so CI can deploy automatically:

```
Settings → Secrets and variables → Actions → New repository secret
```

Used by:
`.github/workflows/deploy-workers.yml`

---

## 🔐 Required API Token Permissions

Your `CLOUDFLARE_API_TOKEN` must be an **Account-scoped token** with these permissions:

| Scope       | Permission                              |
| ----------- | --------------------------------------- |
| **Account** | Workers Scripts — **Edit**              |
| **Account** | Workers KV Storage — **Edit**           |
| **Account** | Workers R2 Storage — **Edit**           |
| **Account** | Workers AI — **Edit**                   |
| **Account** | Workers AI — **Read**                   |
| **Account** | Workers Builds Configuration — **Edit** |
| **Account** | Workers Observability — **Edit**        |
| **Account** | Workers Tail — **Read**                 |
| **Account** | Workers Agents Configuration — **Edit** |
| **Account** | Containers — **Edit**                   |
| **Account** | Cloudflare Pages — **Edit**             |
| **Account** | Account Settings — **Read**             |
| **Zone**    | Workers Routes — **Edit**               |

You can add more permissions later if new features need them.

---

## 🔎 Where to Find These Values

| Item           | Where to get it                                |
| -------------- | ---------------------------------------------- |
| **Account ID** | Cloudflare Dashboard → Account Overview        |
| **API Token**  | Cloudflare Dashboard → My Profile → API Tokens |

---

## ⚙️ Optional Worker Secrets

Not required for deployment, but useful for features:

| Secret     | Purpose                                          |
| ---------- | ------------------------------------------------ |
| `API_KEYS` | Protect OpenAI + MCP endpoints (comma-separated) |
| `TZ`       | Timezone for logs and file paths                 |

You can also store these as **GitHub Secrets**.

---

## 📚 Related Docs

* `docs/DEPLOY.md` — Deployment workflow and `wrangler.toml` notes
