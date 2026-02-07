# ============================================================================
# Cloudflare Image MCP - Infrastructure as Code
# Terraform configuration for R2 bucket with auto-provisioning
# ============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.15.0"
    }
  }

  # Local state for single-user setup
  # For teams, use remote state (S3, Terraform Cloud, etc.)
  backend "local" {
    path = "terraform.tfstate"
  }
}

# ============================================================================
# Variables
# ============================================================================

variable "cloudflare_api_token" {
  description = "Cloudflare API Token with R2 and Workers permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "bucket_name" {
  description = "Name of the R2 bucket for image storage"
  type        = string
  default     = "cloudflare-image-mcp-images"
}

variable "bucket_location" {
  description = "Location hint for R2 bucket (APAC, WNAM, ENAM, WEUR, EEUR)"
  type        = string
  default     = "APAC"
}

variable "image_expiry_hours" {
  description = "Hours after which images are auto-deleted"
  type        = number
  default     = 24
}

# ============================================================================
# Provider Configuration
# ============================================================================

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ============================================================================
# R2 Bucket
# ============================================================================

resource "cloudflare_r2_bucket" "images" {
  account_id = var.cloudflare_account_id
  name       = var.bucket_name
  location   = var.bucket_location
}

# ============================================================================
# Public Access (Auto-generates r2.dev URL)
# This creates the S3_CDN_URL automatically
# ============================================================================

resource "cloudflare_r2_managed_domain" "public" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.images.name
  enabled     = true

  depends_on = [cloudflare_r2_bucket.images]
}

# ============================================================================
# Lifecycle Rule - Auto-delete images after configured hours
# ============================================================================

resource "cloudflare_r2_bucket_lifecycle" "cleanup" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.images.name

  rules = [{
    id      = "delete-after-${var.image_expiry_hours}h"
    enabled = true
    conditions = {
      prefix = "" # Apply to all objects
    }
    delete_objects_transition = {
      condition = {
        max_age = var.image_expiry_hours * 3600 # Convert hours to seconds
        type    = "Age"
      }
    }
  }]

  depends_on = [cloudflare_r2_bucket.images]
}

# ============================================================================
# CORS Configuration for Web Access
# ============================================================================

resource "cloudflare_r2_bucket_cors" "web_access" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.images.name

  cors_rules = [{
    allowed_origins = ["*"] # Allow all origins (adjust for production)
    allowed_methods = ["GET", "HEAD"]
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }]

  depends_on = [cloudflare_r2_bucket.images]
}

# ============================================================================
# Outputs
# ============================================================================

output "bucket_name" {
  description = "Name of the created R2 bucket"
  value       = cloudflare_r2_bucket.images.name
}

output "s3_cdn_url" {
  description = "Public R2 URL (S3_CDN_URL) - Use this in your Workers environment"
  value       = "https://${cloudflare_r2_managed_domain.public.domain_name}"
}

output "s3_endpoint" {
  description = "S3-compatible endpoint for R2"
  value       = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
}

output "image_expiry_hours" {
  description = "Configured image expiration time"
  value       = var.image_expiry_hours
}
