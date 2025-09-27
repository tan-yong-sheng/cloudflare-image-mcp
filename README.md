# Cloudflare Image MCP Server

A TypeScript MCP server that provides image generation capabilities using Cloudflare Workers AI text-to-image models.

## Features

- **6 Supported Models**: FLUX Schnell, SDXL Base, SDXL Lightning, DreamShaper LCM, Leonardo Phoenix, Leonardo Lucid Origin
- **Modular Architecture**: Easy to extend with new models by adding files to `src/models/`
- **Advanced Features**: img2img, inpainting, negative prompts, size control, guidance optimization
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

## Adding New Models

The modular architecture makes it easy to add new models:

1. Create a new file in `src/models/` (e.g., `new-model.ts`)
2. Extend the `BaseModel` class
3. Implement model-specific logic
4. Add the model to `src/models/index.ts`

Example:

```typescript
// src/models/new-model.ts
import { BaseModel } from './base-model.js';
import { ModelConfig } from '../types.js';

export class NewModel extends BaseModel {
  readonly name = '@cf/provider/new-model';
  readonly config: ModelConfig = {
    maxPromptLength: 1000,
    defaultSteps: 10,
    maxSteps: 20,
    supportsNegativePrompt: true,
    supportsSize: true,
    supportsGuidance: true,
    supportsSeed: true,
    outputFormat: 'binary',
    recommendedFor: 'general purpose image generation',
  };

  protected enhancePrompt(prompt: string): string {
    // Model-specific prompt enhancement
    return `high quality, ${prompt}`;
  }
}
```

Then add to `src/models/index.ts`:

```typescript
import { NewModel } from './new-model.js';

export const SUPPORTED_MODELS: BaseModel[] = [
  // ... existing models
  new NewModel(),
];
```

## Architecture

```
src/
├── index.ts           # Main entry point
├── server.ts          # MCP server implementation
├── types.ts           # TypeScript types and Zod schemas
├── cloudflare-client.ts # Cloudflare API client
├── image-service.ts   # Image generation service
├── models/            # Modular model implementations
│   ├── base-model.ts    # Abstract base class
│   ├── flux-schnell.ts  # FLUX Schnell model
│   ├── sdxl-base.ts     # SDXL Base model
│   ├── sdxl-lightning.ts # SDXL Lightning model
│   ├── dreamshaper-lcm.ts # DreamShaper LCM model
│   ├── leonardo-phoenix.ts # Leonardo Phoenix model
│   ├── leonardo-lucid-origin.ts # Leonardo Lucid Origin model
│   └── index.ts         # Model registry
```

## Environment Variables

### Required
- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

### Optional
- `DEFAULT_MODEL`: Default model to use (optional, defaults to FLUX Schnell)

### Storage Configuration
- `IMAGE_CLEANUP_ENABLED`: Enable automatic cleanup of old images (default: false)
- `IMAGE_CLEANUP_OLDER_THAN_DAYS`: Delete files older than N days (requires IMAGE_CLEANUP_ENABLED=true)
- `IMAGE_CLEANUP_KEEP_COUNT`: Keep only N most recent files (requires IMAGE_CLEANUP_ENABLED=true)
- `IMAGE_CLEANUP_RUN_ON_SAVE`: Run cleanup automatically after each image save (default: false)

#### Example Configuration (.env file)
```bash
# Required Cloudflare credentials
CLOUDFLARE_API_TOKEN="your_api_token_here"
CLOUDFLARE_ACCOUNT_ID="your_account_id_here"
DEFAULT_MODEL="@cf/black-forest-labs/flux-1-schnell"

# Optional storage cleanup
IMAGE_CLEANUP_ENABLED=true
IMAGE_CLEANUP_OLDER_THAN_DAYS=30
IMAGE_CLEANUP_RUN_ON_SAVE=true
```

## Error Handling

The server provides comprehensive error handling for:
- Missing configuration
- Invalid parameters
- API errors
- Timeout issues
- Unsupported model features

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your new model in `src/models/`
4. Update documentation
5. Run tests and linting
6. Submit a pull request

## License

MIT License - see LICENSE file for details.