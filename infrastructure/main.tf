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
# Local Values
# ============================================================================

locals {
  # Add environment suffix for non-production environments
  resource_suffix = var.environment == "production" ? "" : "-${var.environment}"
  bucket_name     = "${var.bucket_name}${local.resource_suffix}"
  workers_name    = "${var.workers_subdomain}${local.resource_suffix}"
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
  name       = local.bucket_name
  location   = var.bucket_location
}

# ============================================================================
# Public Access (Auto-generates r2.dev URL)
# This creates the S3_CDN_URL automatically
# ============================================================================

resource "cloudflare_r2_managed_domain" "public" {
  account_id  = var.cloudflare_account_id
  bucket_name = local.bucket_name
  enabled     = true

  depends_on = [cloudflare_r2_bucket.images]
}

# ============================================================================
# Lifecycle Rule - Auto-delete images after configured hours
# ============================================================================

resource "cloudflare_r2_bucket_lifecycle" "cleanup" {
  account_id  = var.cloudflare_account_id
  bucket_name = local.bucket_name

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
  bucket_name = local.bucket_name

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

output "workers_url" {
  description = "URL for the Cloudflare Workers deployment"
  value       = "https://${local.workers_name}.${var.cloudflare_account_id}.workers.dev"
}

output "workers_name" {
  description = "Name of the Workers script"
  value       = local.workers_name
}

output "environment" {
  description = "Deployment environment"
  value       = var.environment
}
