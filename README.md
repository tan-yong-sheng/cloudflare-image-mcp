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

Generate an image using Cloudflare Workers AI.

```typescript
{
  "prompt": "A beautiful sunset over mountains",
  "size": "1024x1024",           // Optional
  "negativePrompt": "blurry, low quality",  // Optional
  "steps": 4,                     // Optional (model-dependent)
  "guidance": 7.5,               // Optional (model-dependent)
  "seed": 12345,                 // Optional
  "imageB64": "base64_encoded_image",  // Optional (for img2img)
  "strength": 1.0,               // Optional (for img2img)
  "model": "@cf/black-forest-labs/flux-1-schnell"  // Optional
}
```

#### list_models

List all available models with their capabilities and supported parameters.

## Model Support Matrix

| Model | Size | Guidance | Negative | img2img | Inpaint |
|-------|------|----------|----------|---------|--------|
| FLUX Schnell | ❌ | ❌ | ❌ | ❌ | ❌ |
| SDXL Base | ✅ | ✅ | ✅ | ✅ | ✅ |
| SDXL Lightning | ✅ | ✅ | ✅ | ✅ | ✅ |
| DreamShaper LCM | ✅ | ✅ | ✅ | ✅ | ✅ |
| Leonardo Phoenix | ✅ | ✅ | ✅ | ❌ | ❌ |
| Leonardo Lucid Origin | ✅ | ✅ | ❌ | ❌ | ❌ |

## Environment Variables

### Required
- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

### Optional
- `DEFAULT_MODEL`: Default model to use (optional, defaults to FLUX Schnell)

### Storage Configuration
- `IMAGE_OUTPUT_PATH`: Custom output folder path (default: 'outputs')
- `IMAGE_CLEANUP_ENABLED`: Enable automatic cleanup of old images (default: false)
- `IMAGE_CLEANUP_OLDER_THAN_DAYS`: Delete files older than N days (requires IMAGE_CLEANUP_ENABLED=true)

#### Example Configuration (.env file)
```bash
# Required Cloudflare credentials
CLOUDFLARE_API_TOKEN="your_api_token_here"
CLOUDFLARE_ACCOUNT_ID="your_account_id_here"
DEFAULT_MODEL="@cf/black-forest-labs/flux-1-schnell"

# Optional storage configuration
IMAGE_OUTPUT_PATH="my_images"
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
