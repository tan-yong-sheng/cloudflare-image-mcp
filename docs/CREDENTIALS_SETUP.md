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
| `AI_ACCOUNTS`       | **Legacy — no longer read at runtime (ADR-001).** Source for the one-shot D1 import only.                                                                                          | See below                 |
| `TZ`                | Timezone for logging                                                                                                                                                               | `America/New_York`        |
| `PROVIDER_DATA_KEY` | AES-GCM data key that encrypts provider credential tokens in D1 (base64, 32 bytes). Required for the R1b D1 provider store; set it before running the one-shot import (see below). | `openssl rand -base64 32` |
| `ADMIN_API_KEY`     | Management key gating the `/api/admin/*` routes (R2 #74). Checked server-side against the `X-Admin-Key` header; never the login bearer. Generate like `PROVIDER_DATA_KEY`.         | `openssl rand -base64 32` |

### `AI_ACCOUNTS` Format

Inference credentials live in D1 only (ADR-001): the Worker reads no
credential environment variable at runtime. `AI_ACCOUNTS` survives only as
the source format the one-shot import reads to seed D1, so this section is
for migrating an existing deployment. If you still have it set, the JSON
array looks like:

```json
[
  { "account_id": "abc123...", "api_token": "token-for-account-1" },
  { "account_id": "def456...", "api_token": "token-for-account-2" }
]
```

Each entry needs an API token with **Workers AI Read + Edit** permissions for that account. The worker picks a random account per request for load distribution.

Setting `AI_ACCOUNTS` alone no longer enables inference: with an empty D1
store, generation fails with `No AI provider credentials configured`. Import
the array into D1 (below) to restore service.

### Migrating `AI_ACCOUNTS` to D1 (one-shot import)

Since R1b the provider store lives in D1: tokens are stored as AES-GCM
envelopes (encrypted with the `PROVIDER_DATA_KEY` Worker secret). ADR-001 made
D1 the **only** credential source, so this upgrade is a flag day rather than a
gradual migration: a deployment whose credentials live in `AI_ACCOUNTS` or
`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` stops generating until the
import below runs (or a key is added in the admin UI).

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

   Then call `GET /api/admin/health` and confirm the imported labels are
   listed with their weights, flags and active versions, and run one
   generation. An import that is not live shows up instead as
   `provider pool: no credentials in database` in the pool logs and
   `No AI provider credentials configured` on the request (labels and
   counts only — the logs never contain tokens or account ids).

**Rollback** — two independent options, both immediate:

- **Empty the tables** (ADR-001 removed the environment-variable
  fallback, so inference then has no credentials and fails with
  `No AI provider credentials configured. Add credentials via admin UI at
/#admin`. Keep the version bump, or a warm isolate keeps serving the
  deleted rows until its next deploy):

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

### Managing keys after the import (R2 admin API)

The import is one-shot; day-to-day key management goes through the
admin API (`/api/admin/*`, R2 #74), behind two gates: the usual login
bearer, then the `ADMIN_API_KEY` management key in the `X-Admin-Key`
header (wrong key → 403, checked constant-time). Both gates must be
configured: with `API_KEYS` unset the app-wide auth bypass would leave
admin on the management key alone, so `/api/admin/*` refuses with 403 in
that state.

- **Health** — `GET /api/admin/health` returns providers, key labels
  with weights/flags/active versions/account ids, the exposure overlay
  rows, the config version, and `hasServableCredential` (any provider)
  plus `hasServableCredentialByProvider` (per provider id): the same
  servable predicate inference routes on (enabled, weighted, envelope
  opens), so the workbench's "no credentials" warning cannot disagree
  with what generation will pick. Labels and counts only, never secret
  values.
- **Add** — `POST /api/admin/keys` with
  `{ "providerId", "label", "apiToken" }` plus optional
  `accountId`, `weight`, `enabled`. The token is sealed
  server-side with `PROVIDER_DATA_KEY`; the response echoes identity only
  (`id`, `label`, `providerId`, `activeVersion`). Duplicate labels fail
  with 409; unknown providers with 400. Cloudflare keys require
  `accountId` (inference addresses `/accounts/{account_id}/ai/run`).
  `providerId` rides on every write, so a second provider needs no API
  change — today `"cloudflare"` is the only row in the catalog. Each
  `providers` row names its seam by protocol in `transport`, and a model
  reaches that provider's credentials by declaring the same string as its
  `inferenceProvider` (ADR-002).
- **Edit / rotate-on-save** — `PATCH /api/admin/keys/:id` with any of
  `{ "accountId", "weight", "enabled", "apiToken" }`. A present
  token revokes the active version and inserts the next one in the same
  transaction as the field edits (rotate-on-save); an absent token keeps
  the current version. Echoes the stored row read back after the commit
  (identity, account id, weight, enabled, active version), so a concurrent
  save that changed another field is not reported as unchanged. This is
  the path the workbench's Edit sheet uses.
- **Rotate** — `POST /api/admin/keys/:id/rotate` with
  `{ "apiToken" }`: revokes the active version and inserts the next one
  in a single transaction (a concurrent rotation loses loudly with 409
  instead of forking versions).
- **Disable** — `POST /api/admin/keys/:id/disable`: the row is kept but no
  longer served (`enabled: 0` in health).

Every mutation bumps `config_versions` (the pool cache's reload signal)
and writes an `admin_audit` row (actor, action, key, timestamp) — who
acted, what changed, when. Tokens never appear in responses, logs, or the
audit table.

### Rotating and revoking the admin key

`ADMIN_API_KEY` is an **optional** Worker secret. The deploy workflow uploads
it in one bulk call and **omits it when the GitHub secret is unset** — an
omitted key is left untouched, so simply removing the GitHub secret does
**not** revoke the key on a running Worker. To change or revoke it, act on the
Worker secret directly:

```bash
cd workers
npx wrangler secret put ADMIN_API_KEY      # rotate to a new value
npx wrangler secret delete ADMIN_API_KEY   # revoke: X-Admin-Key then fails closed (403)
```

An absent or empty `ADMIN_API_KEY` disables the `/api/admin/*` routes (the
management-key gate fails closed); the rest of the Worker is unaffected.

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
