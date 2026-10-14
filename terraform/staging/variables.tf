# Values live in terraform.tfvars (gitignored); see terraform.tfvars.example.
# None of these are secrets, but keeping them out of versioned config keeps
# each root's environment binding filled by a human, per environment.

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the staging D1 provider store."
  type        = string
}

variable "provider_db_name" {
  description = "Name of the live D1 database in staging (Cloudflare dashboard or `wrangler d1 list`). Plans show an in-place rename if this does not match the live name."
  type        = string
}

variable "hcp_organization" {
  description = "HCP Terraform organization that hosts this root's remote-state workspace."
  type        = string
}
