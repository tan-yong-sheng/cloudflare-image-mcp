# Adopted, never recreated. The one-time cutover import is a human command
# (needs credentials):
#
#   terraform import cloudflare_d1_database.provider_db \
#     "<cloudflare_account_id>/<d1_database_uuid>"
#
# The UUID comes from the Cloudflare dashboard or `wrangler d1 list`.
# Full procedure: docs/TERRAFORM.md. After import, every plan must show
# zero destroys of this resource; a plan that would destroy the live store
# fails the deploy gate.

resource "cloudflare_d1_database" "provider_db" {
  account_id = var.cloudflare_account_id
  name       = var.provider_db_name
}
