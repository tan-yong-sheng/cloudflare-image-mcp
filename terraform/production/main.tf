# TF1 (#84): production root — adopts the live production Cloudflare D1
# resources.
#
# Per-environment isolation (spec #83): production is a separate root with
# its own remote-state workspace. No shared modules, no shared state, and no
# single value can address both stores — a staging apply can never reach the
# production store.
#
# Local static gate (no credentials, no backend connectivity):
#   terraform fmt -check
#   terraform init -backend=false
#   terraform validate
#
# Human cutover steps (credentials required): docs/TERRAFORM.md

terraform {
  required_version = ">= 1.7"

  required_providers {
    cloudflare = {
      source  = "registry.terraform.io/cloudflare/cloudflare"
      version = "= 5.28.0"
    }
  }

  # Remote state: one HCP Terraform workspace per environment root. A full
  # `terraform init` connects to it and requires HCP credentials (TF_TOKEN or
  # login) plus the two provisioned workspaces — a human step (docs/
  # TERRAFORM.md). Nothing here applies from a feature branch.
  backend "remote" {
    organization = var.hcp_organization
    workspace    = "cloudflare-image-mcp-production"
  }
}

# No credential values in configuration: the provider reads
# CLOUDFLARE_API_TOKEN from the environment (required scopes: D1 Read + D1
# Write, see docs/TERRAFORM.md). The token never reaches state.

provider "cloudflare" {}
