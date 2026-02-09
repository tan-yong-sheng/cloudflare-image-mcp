# ============================================================================
# Variables for Cloudflare Image MCP Infrastructure
# ============================================================================

variable "cloudflare_api_token" {
  description = <<EOT
Cloudflare API Token with the following permissions:
  - Zone:Read (if using custom domains)
  - Account:Read
  - R2 Bucket:Edit
  - R2 Bucket Lifecycle:Edit
  - R2 Custom Domain:Edit
Create at: https://dash.cloudflare.com/profile/api-tokens
EOT
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Your Cloudflare Account ID (found in the right sidebar of Cloudflare dashboard)"
  type        = string
}

variable "bucket_name" {
  description = "Name of the R2 bucket for storing generated images"
  type        = string
  default     = "cloudflare-image-mcp-images"
}

variable "bucket_location" {
  description = "Geographic location hint for the R2 bucket"
  type        = string
  default     = "WNAM" # Match existing bucket location

  validation {
    condition     = contains(["APAC", "WNAM", "ENAM", "WEUR", "EEUR", "OC"], var.bucket_location)
    error_message = "Valid locations are: APAC, WNAM, ENAM, WEUR, EEUR, OC"
  }
}

variable "image_expiry_hours" {
  description = "Number of hours after which images are automatically deleted from R2"
  type        = number
  default     = 24
}

variable "environment" {
  description = "Deployment environment (staging or production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "workers_subdomain" {
  description = "Subdomain for the Workers deployment (used for output)"
  type        = string
  default     = "cloudflare-image-workers"
}
