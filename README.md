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
# Clone the repository
git clone https://github.com/tan-yong-sheng/cloudflare-image-mcp.git

# Install dependencies
npm install
```

### Configuration

Set environment variables:

```bash
export CLOUDFLARE_API_TOKEN="your_api_token_here"
export CLOUDFLARE_ACCOUNT_ID="your_account_id_here"
export DEFAULT_IMAGE_GENERATION_MODEL="@cf/black-forest-labs/flux-1-schnell"  # Optional
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

Generate an image using Cloudflare Workers AI. The model is configured via the `DEFAULT_IMAGE_GENERATION_MODEL` environment variable.

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

Read more [here](./docs/env_setup.md) to know how to get all environment variables for Cloudflare Workers AI and Cloudflare R2 storage required for this MCP setup.

### Cloudflare Workers AI Configuration for image generation (Required, except DEFAULT_IMAGE_GENERATION_MODEL)
- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `DEFAULT_IMAGE_GENERATION_MODEL`: Default model to use (optional, defaults to lucid-origin)

### S3 Storage Configuration (Required)
- `S3_BUCKET`: S3 bucket name for storing generated images
- `S3_REGION`: S3 region (e.g., "auto")
- `S3_ACCESS_KEY`: S3 access key
- `S3_SECRET_KEY`: S3 secret key
- `S3_ENDPOINT`: Custom endpoint (e.g., Cloudflare R2 endpoint)
- `S3_CDN_URL`: Custom CDN URL for image links

### Storage Cleanup Configuration (Optional)
- `IMAGE_CLEANUP_ENABLED`: Enable automatic cleanup of old images (default: false)
- `IMAGE_CLEANUP_OLDER_THAN`: Delete files older than N days (requires IMAGE_CLEANUP_ENABLED=true)

### Performance & Rate Limiting Configuration (Optional)
- `IMAGE_GENERATION_CONCURRENCY`: Number of concurrent image generation requests (default: 2, range: 1-8)
- `IMAGE_GENERATION_BATCH_DELAY_MS`: Delay between batches of concurrent requests in milliseconds (default: 1000, range: 100-10000)
- `IMAGE_GENERATION_MAX_RETRIES`: Maximum retry attempts for rate-limited requests (default: 3, range: 0-10)

### Logging Configuration (Optional)
- `LOG_LEVEL`: Control logging verbosity (error, warn, info, debug) (default: info)
- `NODE_ENV=development`: Auto-enables debug mode with detailed logging

**Logging Features:**
- **Centralized logging system** with consistent formatting and timestamps
- **Service-specific prefixes**: `[Server]`, `[ImageService]`, `[S3 Storage]` for easy identification
- **Specialized loggers**: 🧹 cleanup, 🚦 rate limiting, 🌐 API, 💾 storage operations
- **Conditional logging**: Debug messages only show in debug mode
- **Performance timing**: Built-in timing helpers for performance monitoring


#### Example Configuration (.env file)
```bash
# Required Cloudflare credentials
CLOUDFLARE_API_TOKEN="your_api_token_here"
CLOUDFLARE_ACCOUNT_ID="your_account_id_here"
DEFAULT_IMAGE_GENERATION_MODEL="@cf/black-forest-labs/flux-1-schnell"

# Required S3 storage configuration
S3_BUCKET="your-bucket-name"
S3_REGION="auto"
S3_ACCESS_KEY="your_access_key"
S3_SECRET_KEY="your_secret_key"
S3_ENDPOINT="https://your-account-id.r2.cloudflarestorage.com"
S3_CDN_URL="https://pub-....r2.dev"

# Optional cleanup configuration
IMAGE_CLEANUP_ENABLED=true
IMAGE_CLEANUP_OLDER_THAN=1d # (supports: 30s, 5min, 2h, 7d, 2w, 6mon, 1y)

# Optional performance configuration
IMAGE_GENERATION_CONCURRENCY=2    # Default: 2 concurrent requests (range: 1-8)
IMAGE_GENERATION_BATCH_DELAY_MS=1000  # Default: 1s delay between batches (range: 100-10000ms)
IMAGE_GENERATION_MAX_RETRIES=3   # Default: 3 retry attempts (range: 0-10)

# Optional logging configuration
LOG_LEVEL=info                    # Control verbosity: 'error', 'warn', 'info', 'debug'
NODE_ENV=production              # Set to 'development' for debug mode
```

## Error Handling

The server provides comprehensive error handling for:
- Missing configuration
- Invalid parameters
- API errors
- Timeout issues
- Unsupported model features
