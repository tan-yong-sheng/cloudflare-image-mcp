# Cloudflare Image MCP Server

A TypeScript MCP server that provides image generation capabilities using Cloudflare Workers AI text-to-image models.

## Features

- **6 Supported Models**: FLUX Schnell, SDXL Base, SDXL Lightning, DreamShaper LCM, Leonardo Phoenix, Leonardo Lucid Origin
- **Modular Architecture**: Easy to extend with new models by adding files to `src/models/`
- **Advanced Features**: negative prompts, size control, guidance optimization
- **Type-Safe**: Full TypeScript support with Zod validation
- **MCP Compliant**: Works with Model Context Protocol

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare API Token and Account ID

### Installation

```bash
npm install
```

### Configuration

Set environment variables:

```bash
export CLOUDFLARE_API_TOKEN="your_api_token_here"
export CLOUDFLARE_ACCOUNT_ID="your_account_id_here"
export DEFAULT_MODEL="@cf/black-forest-labs/flux-1-schnell"  # Optional
```

### Development

```bash
# Type checking
npm run check

# Linting
npm run lint

# Build
npm run build

# Run in development mode
npm run dev
```

### Publishing

```bash
npm run lint
npm run check
npm run build
npm publish
```

## Usage

### Available Tools

#### generate_image

Generate an image using Cloudflare Workers AI. The model is configured via the `DEFAULT_MODEL` environment variable.

```typescript
{
  "prompt": "A beautiful sunset over mountains",
  "size": "1024x1024",           // Optional
  "negativePrompt": "blurry, low quality",  // Optional
  "steps": 4,                     // Optional (model-dependent)
  "guidance": 7.5,               // Optional (model-dependent)
  "seed": 12345,                 // Optional
  "imageB64": "base64_encoded_image",  // Optional (for img2img)
  "strength": 1.0                // Optional (for img2img)
}
```

#### list_models

List all available models with their capabilities and supported parameters.

## Model Support Matrix

| Model | Model ID | Size | Guidance | Negative |
|-------|------|------|----------|----------|
| FLUX Schnell | @cf/black-forest-labs/flux-1-schnell | ❌ | ❌ | ❌ |
| Stable Diffusion XL | @cf/stabilityai/stable-diffusion-xl-base-1.0 | ✅ | ✅ | ✅ |
| SDXL Lightning | @cf/bytedance/stable-diffusion-xl-lightning | ✅ | ✅ | ✅ |
| DreamShaper 8 LCM | @cf/lykon/dreamshaper-8-lcm | ✅ | ✅ | ✅ |
| Leonardo AI Phoenix 1.0 | @cf/leonardo/phoenix-1.0 | ✅ | ✅ | ✅ |
| Leonardo Lucid Origin | @cf/leonardo/lucid-origin | ✅ | ✅ | ❌ |


## Environment Variables

### Required
- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

### Optional
- `DEFAULT_MODEL`: Default model to use (optional, defaults to FLUX Schnell)

### S3 Storage Configuration (Required)
- `S3_BUCKET`: S3 bucket name for storing generated images
- `S3_REGION`: S3 region (e.g., "us-east-1")
- `S3_ACCESS_KEY`: S3 access key (optional for public buckets)
- `S3_SECRET_KEY`: S3 secret key (optional for public buckets)
- `S3_ENDPOINT`: Custom endpoint (e.g., Cloudflare R2 endpoint)
- `S3_CDN_URL`: Custom CDN URL for image links

### Storage Cleanup Configuration
- `IMAGE_CLEANUP_ENABLED`: Enable automatic cleanup of old images (default: false)
- `IMAGE_CLEANUP_OLDER_THAN_DAYS`: Delete files older than N days (requires IMAGE_CLEANUP_ENABLED=true)
- `IMAGE_CLEANUP_KEEP_COUNT`: Keep N most recent files (optional)
- `IMAGE_CLEANUP_RUN_ON_SAVE`: Run cleanup after each save (default: false)

#### Example Configuration (.env file)
```bash
# Required Cloudflare credentials
CLOUDFLARE_API_TOKEN="your_api_token_here"
CLOUDFLARE_ACCOUNT_ID="your_account_id_here"
DEFAULT_MODEL="@cf/black-forest-labs/flux-1-schnell"

# Required S3 storage configuration
S3_BUCKET="your-bucket-name"
S3_REGION="auto"
S3_ACCESS_KEY="your_access_key"
S3_SECRET_KEY="your_secret_key"
S3_ENDPOINT="https://your-account-id.r2.cloudflarestorage.com"
S3_CDN_URL="https://pub-....r2.dev"

# Optional cleanup configuration
IMAGE_CLEANUP_ENABLED=true
IMAGE_CLEANUP_OLDER_THAN_DAYS=30
```

## Error Handling

The server provides comprehensive error handling for:
- Missing configuration
- Invalid parameters
- API errors
- Timeout issues
- Unsupported model features
