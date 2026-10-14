# Terraform deploy prerequisites (TF1, #84)

Terraform now owns **resource identity** for the two live D1 databases
(staging + production, adopted by import); wrangler keeps owning **schema
evolution** (the versioned `workers/migrations/*.sql` suite applied before
each deploy). See `terraform/README.md` for the layout and the local static
gate.

This page is the declared, short list of deploy prerequisites. Setup is a
one-time human cutover; day-to-day local development needs no Terraform.

## Prerequisites

| Prerequisite                     | Where                                                              | Notes                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Terraform ≥ 1.7                  | your machine / CI                                                  | `terraform -chdir=terraform/<env> ...`                                                                                                    |
| Cloudflare API token             | `CLOUDFLARE_API_TOKEN` env var                                     | custom token, **D1 Read + D1 Write** scopes only for TF1 (scopes are declared beside their operations; full scope declaration is TF4/#87) |
| D1 database UUIDs                | Cloudflare dashboard → D1, or `cd workers && npx wrangler d1 list` | one per environment; never committed — they are import arguments, not tfvars values                                                       |
| HCP Terraform org + 2 workspaces | `terraform login` (or `TF_TOKEN`)                                  | workspaces `cloudflare-image-mcp-staging` and `cloudflare-image-mcp-production`, one per root                                             |
| Per-root `terraform.tfvars`      | copy from `terraform/<env>/terraform.tfvars.example`               | holds account ID, live DB name, HCP org — no secrets                                                                                      |

Credential values never appear in configuration or state. The provider reads
`CLOUDFLARE_API_TOKEN` from the environment; remote state (HCP) stores
resource identity only.

## One-time cutover, per environment

Run for `staging` first, then `production` (same order as the existing
deploy promotion). Replace `<env>` with `staging` or `production`.

```sh
# 1. Fill the root's tfvars (from the .example), then connect to remote state:
terraform -chdir=terraform/<env> init

# 2. Adopt the live database (one-time import by account + database ID):
terraform -chdir=terraform/<env> import \
  cloudflare_d1_database.provider_db "<cloudflare_account_id>/<d1_database_uuid>"

# 3. Zero-destroy plan gate (the import-only, zero-destroy evidence):
terraform -chdir=terraform/<env> plan -input=false -out=tfplan
#    expected: "No changes." (or only the imported resource, 0 to destroy).
#    Any plan that would DESTROY cloudflare_d1_database.provider_db fails the
#    cutover — re-check the tfvars values; do not apply.

# 4. Persist the adoption into remote state:
terraform -chdir=terraform/<env> apply -input=false
```

After import, Terraform manages the database identity (name, account
binding). Re-runs are safe: the plan shows no changes, and migrations keep
running through the existing pipeline (wrangler `d1 migrations apply`
against the same bound database). Abandoning Terraform later returns to the
current pipeline with no data loss — the databases were adopted, not
recreated.

## CI gates

`.github/workflows/terraform.yml` owns both gates (its own file; the deploy
pipeline in `deploy-workers.yml` is untouched).

**Static gate** — on every PR, per root, without any Cloudflare or HCP
credentials (analogous to typecheck):

```sh
terraform -chdir=terraform/<env> fmt -check
terraform -chdir=terraform/<env> init -backend=false
terraform -chdir=terraform/<env> validate
```

**No-apply plan gate** — one job per environment (`plan-gate-staging`,
`plan-gate-production`), on push to `main` or manual dispatch. It plans
with `-input=false` against real HCP remote state and fails on any destroy
of a D1 database; it never applies. It is credential-gated by construction
(a declared remote backend cannot be planned offline) and skips loudly with
a `::notice::` when the prerequisites are absent. Human prerequisites:

- GitHub secrets (per environment, as the deploy pipeline uses): `CLOUDFLARE_API_TOKEN` (existing) and `TF_TOKEN` (new, HCP Terraform)
- GitHub variables: `HCP_ORGANIZATION` (repo-level), `STAGING_PROVIDER_DB_NAME` (environment `staging`), `PRODUCTION_PROVIDER_DB_NAME` (environment `production`)
- the one-time cutover from the previous section (`init` + `import` + zero-destroy `plan` + `apply`)

## Local development

Unchanged: `cd workers && npm run check && npm test` and local serve gain no
Terraform dependency. Nothing in the typecheck, unit-test, or local-serve
loop reads `terraform/`.
