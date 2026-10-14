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

On every change under `terraform/`, CI runs per root — without any
Cloudflare or HCP credentials (the static gate, analogous to typecheck):

```sh
terraform -chdir=terraform/<env> fmt -check
terraform -chdir=terraform/<env> init -backend=false
terraform -chdir=terraform/<env> validate
```

The no-apply plan gate (`terraform plan -input=false` asserting **zero
destroys of D1 databases**) additionally needs an initialized remote
backend — `TF_TOKEN` (HCP Terraform) plus `CLOUDFLARE_API_TOKEN` and the
root's `terraform.tfvars` — because a declared remote backend makes
offline/local plans impossible. With those available, the gate plans
against real remote state; without them it is a credential-gated step.

## Local development

Unchanged: `cd workers && npm run check && npm test` and local serve gain no
Terraform dependency. Nothing in the typecheck, unit-test, or local-serve
loop reads `terraform/`.
