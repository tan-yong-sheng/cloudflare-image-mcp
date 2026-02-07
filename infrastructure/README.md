# Cloudflare Image MCP - Infrastructure

Terraform configuration for provisioning Cloudflare R2 bucket with auto-generated public URL and lifecycle rules.

## What This Creates

1. **R2 Bucket** - Object storage for generated images
2. **Public Access** - Auto-generated `pub-xxx.r2.dev` URL via `cloudflare_r2_managed_domain`
3. **Lifecycle Rule** - Auto-delete images after 24 hours
4. **CORS Configuration** - Web access configuration

## Prerequisites

1. Install Terraform: https://developer.hashicorp.com/terraform/downloads
2. Create Cloudflare API Token with permissions:
   - Account:Read
   - R2 Bucket:Edit
   - R2 Bucket Lifecycle:Edit
   - R2 Custom Domain:Edit

## Setup

1. **Copy the example variables file:**
   ```bash
   cd infrastructure
   cp terraform.tfvars.example terraform.tfvars
   ```

2. **Edit `terraform.tfvars` with your values:**
   ```hcl
   cloudflare_account_id = "your-account-id"
   cloudflare_api_token  = "your-api-token"
   ```

3. **Initialize Terraform:**
   ```bash
   terraform init
   ```

4. **Plan the changes:**
   ```bash
   terraform plan
   ```

5. **Apply the infrastructure:**
   ```bash
   terraform apply
   ```

## Outputs

After successful deployment, you'll see:

```
Outputs:

bucket_name = "cloudflare-image-mcp-images"
s3_cdn_url = "https://pub-xxx.r2.dev"
s3_endpoint = "https://<account>.r2.cloudflarestorage.com"
```

**Important:** Copy the `s3_cdn_url` value - this is your `S3_CDN_URL` for the Workers.

## Set S3_CDN_URL in Workers

After infrastructure deployment, set the secret:

```bash
cd workers
echo "https://pub-xxx.r2.dev" | npx wrangler secret put S3_CDN_URL
```

Or via GitHub Actions (recommended for CI/CD):
1. Go to Repository Settings → Secrets
2. Add `S3_CDN_URL` with the value from Terraform output

## GitHub Actions Automation

Trigger infrastructure deployment via GitHub Actions:

1. Go to Actions → Deploy Infrastructure
2. Click "Run workflow"
3. Select action: `plan` (preview) or `apply` (deploy)

## Auto-Generated vs Custom Domain

### Option 1: Auto-Generated r2.dev URL (Default)
- Created automatically by `cloudflare_r2_managed_domain`
- Format: `https://pub-xxx.r2.dev`
- No custom domain needed
- Good for development and testing

### Option 2: Custom Domain (Optional)
If you want a custom domain like `images.yourdomain.com`:

```hcl
resource "cloudflare_r2_custom_domain" "custom" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.images.name
  domain      = "images.yourdomain.com"
  zone_id     = "your-zone-id"
  enabled     = true
}
```

## Lifecycle Rules

Images are automatically deleted after 24 hours (configurable via `image_expiry_hours` variable).

To change the expiration time:

```hcl
# terraform.tfvars
image_expiry_hours = 48  # Change to 48 hours
```

Then run:
```bash
terraform apply
```

## Destroy Infrastructure

⚠️ **Warning:** This will delete all stored images!

```bash
terraform destroy
```

Or via GitHub Actions with action: `destroy`

## Troubleshooting

### Error: "Invalid account ID"
- Verify your Cloudflare Account ID in the dashboard right sidebar

### Error: "Authentication error"
- Check that your API Token has the required permissions
- Ensure the token is not expired

### No S3_CDN_URL output
- The `cloudflare_r2_managed_domain` resource may take a moment to create
- Run `terraform refresh` to update outputs

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Cloudflare     │────▶│  R2 Bucket   │────▶│  Public Access  │
│  Workers        │     │  (Storage)   │     │  (r2.dev URL)   │
│                 │     │              │     │                 │
│  S3_CDN_URL     │◀────│              │     │  Auto-generated │
│  env variable   │     │  24-hour     │     │  by Terraform   │
│                 │     │  lifecycle   │     │                 │
└─────────────────┘     └──────────────┘     └─────────────────┘
```
