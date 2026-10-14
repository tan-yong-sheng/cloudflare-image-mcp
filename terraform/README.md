# Terraform (TF1, #84)

Foundation for Terraform-managed D1 resource identity. The two live D1
databases (staging + production) are **adopted by import**, never recreated.

## Layout — one root per environment

| Root                   | Environment | Remote-state workspace            |
| ---------------------- | ----------- | --------------------------------- |
| `terraform/staging`    | staging     | `cloudflare-image-mcp-staging`    |
| `terraform/production` | production  | `cloudflare-image-mcp-production` |

Per-environment isolation (spec #83): separate roots with separate remote
state. No shared modules, no shared state, and no single value can address
both stores — a staging apply cannot touch the production store.

Each root manages `cloudflare_d1_database.provider_db` — the D1 provider
store the deploy pipeline binds as `PROVIDER_DB`
(`.github/workflows/deploy-workers.yml`).

## Local static gate (no credentials, no backend connectivity)

```sh
terraform -chdir=terraform/staging fmt -check
terraform -chdir=terraform/staging init -backend=false
terraform -chdir=terraform/staging validate
# ...and the same three for terraform/production
```

This is the static gate analogous to typecheck; it runs in CI without any
Cloudflare or HCP credentials.

## Human steps (credentials required)

Remote backend setup, the one-time `terraform import` of both live databases,
and the zero-destroy plan check are recorded in
[docs/TERRAFORM.md](../docs/TERRAFORM.md). Nothing in this run applies from a
feature branch.
