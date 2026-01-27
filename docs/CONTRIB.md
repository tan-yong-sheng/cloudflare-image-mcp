# Contributing Guide

## Project Overview

Cloudflare Image MCP is a modular image generation service that provides:
- OpenAI-compatible REST API
- MCP Server (Model Context Protocol) - stdio and HTTP transports
- Web Frontend for image generation
- R2 Storage for generated images with auto-expiry

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 18+ (local), Cloudflare Workers (cloud) |
| **Language** | TypeScript |
| **AI Provider** | Cloudflare Workers AI (FLUX, SDXL, @cf/lykon/dreamshaper-8-lcm) |
| **Storage** | Cloudflare R2 (S3-compatible) |
| **Protocols** | OpenAI REST API, MCP (stdio + HTTP/SSE) |
| **Frontend** | HTML + Tailwind CSS (no framework) |
| **Container** | Docker (for local deployment) |

## Project Structure

```
cloudflare-image-mcp/
├── packages/
│   ├── core/                    # Shared library
│   │   ├── src/
│   │   │   ├── types.ts         # TypeScript interfaces
│   │   │   ├── models/          # Model configurations
│   │   │   ├── ai/              # AI client abstraction
│   │   │   └── storage/         # Storage abstraction
│   │   └── package.json
│   │
│   └── local/                   # Local deployment (NPM + Docker)
│       ├── src/
│       │   ├── main.ts          # Entry point
│       │   ├── mcp/             # MCP server
│       │   ├── api/             # REST API
│       │   └── ui/              # Web frontend
│       ├── Dockerfile
│       └── package.json
│
├── workers/                     # Cloudflare Workers deployment
│   ├── src/
│   │   ├── index.ts             # Worker entry
│   │   ├── endpoints/           # HTTP handlers
│   │   └── services/            # Worker services
│   ├── wrangler.toml
│   └── package.json
│
└── docs/
```

## Available Scripts

### packages/core/

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run check` | Type-check without emitting files |
| `npm run clean` | Remove `dist/` directory |

### packages/local/

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run check` | Type-check without emitting files |
| `npm run clean` | Remove `dist/` directory |
| `npm run dev` | Start dev server with hot reload (tsx) |
| `npm start` | Start production server |

### workers/

| Script | Description |
|--------|-------------|
| `npx wrangler dev` | Start local dev server |
| `npx wrangler dev --remote` | Dev server with remote Cloudflare resources |
| `npx wrangler deploy` | Deploy to Cloudflare |
| `npx wrangler deploy --dry-run` | Test deployment without publishing |

## Development Workflow

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/cloudflare-image-mcp.git
cd cloudflare-image-mcp

# Install dependencies for each package
cd packages/core && npm install && cd ../..
cd packages/local && npm install && cd ../..
cd workers && npm install && cd ..
```

### 2. Set Up Environment Variables

Copy the example environment file and fill in your values:

```bash
cp packages/local/.env.example packages/local/.env
```

Required variables:

| Variable | Description | Required For |
|----------|-------------|--------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with AI permissions | All deployments |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | All deployments |
| `S3_BUCKET` | R2 bucket name | Storage |
| `S3_REGION` | Region (use `auto` for R2) | Storage |
| `S3_ENDPOINT` | R2 endpoint URL | Storage |
| `S3_ACCESS_KEY` | R2 API token access key | Storage |
| `S3_SECRET_KEY` | R2 API token secret key | Storage |
| `S3_CDN_URL` | Public CDN URL for images | Storage |
| `PORT` | Server port (default: 3000) | Local only |
| `DEFAULT_MODEL` | Default model ID | All deployments |

### 3. Build and Test

```bash
# Build core package first
cd packages/core && npm run build && cd ../..

# Build local package
cd packages/local && npm run build && cd ../..

# Test local server (needs credentials)
cd packages/local && npm run dev

# Test workers (needs credentials)
cd workers && npx wrangler dev --remote
```

## Adding New Models

To add a new AI model:

1. Add model configuration to `packages/core/src/models/configs.ts`:

```typescript
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // ... existing models
  '@cf/provider/new-model': {
    id: '@cf/provider/new-model',
    name: 'New Model',
    provider: 'Cloudflare',
    description: 'Description of the model',
    taskType: 'image-generation',
    parameters: {
      prompt: { type: 'string', required: true, maxLength: 2048 },
      // ... other parameters
    },
    defaults: {
      prompt: '',
      steps: 20,
    },
    limits: {
      maxPromptLength: 2048,
      minSteps: 1,
      maxSteps: 50,
      defaultSteps: 20,
      supportsSize: true,
      sizes: ['512x512', '1024x1024'],
    },
    aliases: ['new-model', 'nm'],
  },
};
```

2. Rebuild the core package:
```bash
cd packages/core && npm run build
```

## Adding Storage Providers

1. Create a new provider in `packages/core/src/storage/`:

```typescript
import type { StorageProvider, StorageConfig, StorageResult } from '../types.js';

export function createCustomStorageProvider(config: StorageConfig): StorageProvider {
  return {
    async uploadImage(base64Data: string, metadata: Record<string, string>): Promise<StorageResult> {
      // Implementation
    },
    async deleteImage(id: string): Promise<boolean> {
      // Implementation
    },
    async cleanupExpired(): Promise<number> {
      // Implementation
    },
    async listImages(prefix?: string): Promise<string[]> {
      // Implementation
    },
  };
}
```

2. Export from `packages/core/src/storage/index.ts`:

```typescript
export { createCustomStorageProvider, type CustomStorageConfig } from './custom.js';
```

## Code Style

- TypeScript strict mode enabled
- Use ES modules (`.js` extension in imports)
- Follow existing patterns in the codebase
- Run `npm run check` before committing

## Testing

### Local Package Tests

1. Start the server:
```bash
cd packages/local && npm run dev
```

2. Test endpoints:
```bash
curl http://localhost:3000/health
curl http://localhost:3000/v1/models
```

### Workers Tests

1. Start dev server with remote resources:
```bash
cd workers && npx wrangler dev --remote
```

2. Access at the provided local URL (usually http://localhost:8787)

## Docker

Build and run locally:

```bash
cd packages/local
docker build -t cloudflare-image-mcp .
docker run -p 3000:3000 --env-file .env cloudflare-image-mcp
```

## Troubleshooting

### TypeScript Errors

Run type checking to identify issues:
```bash
cd packages/local && npm run check
```

### Cloudflare API Errors

Ensure your API token has the following permissions:
- `Workers AI: Read`
- `Workers AI: Write` (for image generation)
- `Account R2: Read/Write` (for storage)

### R2 Access Issues

Verify your R2 endpoint and credentials in `.env`. The endpoint should be:
```
https://<account-id>.r2.cloudflarestorage.com
```
