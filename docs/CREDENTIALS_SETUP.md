# Environment Setup

This page lists all environment variables used by this project.

For **step-by-step deployment instructions**, see [DEPLOY.md](DEPLOY.md).

---

## Required for Deployment

| Variable                | Description                                                                                                           | How to Get It                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                                                                                            | [Dashboard](https://dash.cloudflare.com) → Account Overview → right sidebar                        |
| `CLOUDFLARE_API_TOKEN`  | API token for deploying Workers                                                                                       | [Profile](https://dash.cloudflare.com/profile/api-tokens) → Create Token → Custom token            |
| `D1_DATABASE_ID`        | Id of the D1 provider database (deploy applies migrations to it). One per environment — names are unique per account. | `npx wrangler d1 create cloudflare-image-mcp-providers[-staging]` — set **per GitHub environment** |

### Required API Token Permissions

Create a token with these **Account-scoped** permissions:

| Scope   | Permission                |
| ------- | ------------------------- |
| Account | Workers Scripts — Edit    |
| Account | Workers R2 Storage — Edit |
| Account | Workers D1 — Edit         |
| Account | Workers AI — Edit         |
| Account | Workers AI — Read         |
| Account | Workers KV Storage — Read |

> **Why KV Read when this project uses no KV?** The staging cleanup job runs
> `wrangler delete --force`, which enumerates _all_ bindings (including KV
> namespaces) before deleting the worker. Without KV Read the pre-check
> fails with `Authentication error [code: 10000]` and the delete aborts —
> even though there is nothing KV-related to delete (storage is R2 only).
> Alternatively, keep the token minimal and replace the cleanup step with a
> direct `DELETE .../workers/scripts/<name>?force=true` API call, which
> needs only Workers Scripts Edit.

---

## Optional Secrets

| Variable            | Description                                                                                                                                                                        | Example                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `API_KEYS`          | Protect endpoints with API key auth (comma-separated)                                                                                                                              | `mykey1,mykey2`           |
| `AI_ACCOUNTS`       | Multi-account AI inference credentials (JSON array)                                                                                                                                | See below                 |
| `TZ`                | Timezone for logging                                                                                                                                                               | `America/New_York`        |
| `PROVIDER_DATA_KEY` | AES-GCM data key that encrypts provider credential tokens in D1 (base64, 32 bytes). Required for the R1b D1 provider store; set it before running the one-shot import (see below). | `openssl rand -base64 32` |

### `AI_ACCOUNTS` Format

By default, the worker uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for both deployment **and** AI inference. If you want to distribute AI inference across multiple Cloudflare accounts (e.g. for rate limit distribution), set `AI_ACCOUNTS` as a JSON array:

```json
[
  { "account_id": "abc123...", "api_token": "token-for-account-1" },
  { "account_id": "def456...", "api_token": "token-for-account-2" }
]
```

Each entry needs an API token with **Workers AI Read + Edit** permissions for that account. The worker picks a random account per request for load distribution.

If `AI_ACCOUNTS` is **not set**, the worker falls back to `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` for AI inference.

### Migrating `AI_ACCOUNTS` to D1 (one-shot import)

Since R1b, the provider store lives in D1: tokens are stored as AES-GCM
envelopes (encrypted with the `PROVIDER_DATA_KEY` Worker secret), and D1 wins
over `AI_ACCOUNTS` whenever rows exist. `AI_ACCOUNTS` keeps working as a
fallback with a deprecation warning, so there is **no flag day** — import at
your own pace, then unset the blob in a later deploy.

**Preferred path — import from CI.** `AI_ACCOUNTS` is a write-only GitHub
secret: no shell can read it back, so the local steps below cannot even
fetch it unaided. The deploy workflow carries an opt-in `import_credentials`
input that runs the import inside CI, where the blob and the sealing key
already live (staging first):

```bash
gh workflow run deploy-workers.yml \
  --ref <branch being deployed> \
  -f environment=staging -f import_credentials=true
```

(Or from the Actions tab: **Deploy to Cloudflare Workers → Run workflow →
environment: staging → import_credentials: ✅**.) The job applies the schema
first, seals each token with the same `PROVIDER_DATA_KEY` it pushes to the
Worker in the same run — so the sealing and opening keys cannot drift — and
prints the imported rows (`SELECT label, enabled`) as run-log evidence. The
blob never touches a local disk.

**Manual fallback — import from a local shell.** For environments CI cannot
reach. One-time steps, per environment (staging first):

1. **Set the data key** (once, before the Worker ever needs to open D1
   envelopes):

   ```bash
   cd workers
   npx wrangler secret put PROVIDER_DATA_KEY   # value: openssl rand -base64 32
   ```

2. **Generate the import SQL.** Take the JSON array from your `AI_ACCOUNTS`
   secret and pipe it through the import script. The output is envelope SQL
   only — plaintext tokens never appear in it. The script never prompts for
   the key — pass it in the environment, and it must match the Worker
   secret:

   ```bash
   PROVIDER_DATA_KEY=<same value as the Worker secret> \
     node scripts/import-ai-accounts.mjs < ai-accounts.json > import.sql
   ```

3. **Review, then apply** through the D1 CLI (nothing in the Worker changes;
   the script emits SQL only):

   ```bash
   cd workers
   npx wrangler d1 execute cloudflare-image-mcp-providers-staging \
     --remote --file ../import.sql
   ```

4. **Verify:**

   ```bash
   npx wrangler d1 execute cloudflare-image-mcp-providers-staging --remote \
     --command "SELECT label, external_account_id, enabled FROM provider_keys"
   ```

   Then hit any inference endpoint and check the logs for
   `AI inference path: d1 with N account(s)` (labels and counts only — the
   logs never contain tokens or account ids).

**Rollback** — two independent options, both immediate:

- **Empty the tables** (Worker falls back to `AI_ACCOUNTS` / deploy
  credentials on the next version-poll, ≤ 5 s — keep the version bump, or a
  warm isolate keeps serving the deleted rows until its next deploy):

  ```sql
  DELETE FROM credential_versions;
  DELETE FROM provider_keys;
  UPDATE config_versions SET version = version + 1, updated_at = unixepoch() WHERE id = 1;
  ```

- **D1 Time Travel** restores the whole database to any point in the last 30
  days (use for a bad rotation or partial import).

**Re-running the import** fails loudly on the UNIQUE guards (one row per
label; one active version per key) — it never double-imports. To rotate a
token afterwards, use the ledger path (revoke + insert in one transaction),
not a second import run.

Treat `import.sql` as sensitive-but-not-secret (envelopes only): do not
commit it, and delete it after applying.

---

## Where to Set These

### GitHub Actions (Recommended)

Add as repository secrets:

```
https://github.com/YOUR_USERNAME/cloudflare-image-mcp/settings/secrets/actions
```

### Local Development

```bash
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"
```

---

See [DEPLOY.md](DEPLOY.md) for the complete deployment guide.
