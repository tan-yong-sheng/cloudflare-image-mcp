# Cloudflare Image MCP - Architecture Guide

## Project Overview

Cloudflare Image MCP is a modular, multi-deployment image generation service that provides:

- **OpenAI-compatible REST API**
- **MCP Server** (Model Context Protocol) - stdio and HTTP transports
- **Web Frontend** for image generation
- **R2 Storage** for generated images with auto-expiry

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 18+ (local), Cloudflare Workers (cloud) |
| **Language** | TypeScript |
| **AI Provider** | Cloudflare Workers AI (FLUX, SDXL, DreamShaper) |
| **Storage** | Cloudflare R2 (S3-compatible) |
| **Protocols** | OpenAI REST API, MCP (stdio + HTTP/SSE) |
| **Frontend** | HTML + Tailwind CSS (no framework) |
| **Container** | Docker (for local deployment) |

## Architecture

### Current Structure (Before Refactor)

```
cloudflare-image-mcp/
├── mcp/                    # NPM package - stdio MCP only
│   ├── src/
│   │   ├── server.ts       # Stdio MCP server
│   │   ├── cloudflare-client.ts
│   │   ├── image-service.ts
│   │   ├── storage/
│   │   └── models/generation/
│   └── package.json
│
└── workers/                # Cloudflare Workers - HTTP everything
    ├── src/
    │   ├── index.ts        # Worker entry
    │   ├── endpoints/
    │   │   ├── openai-endpoint.ts
    │   │   ├── mcp-endpoint.ts
    │   │   └── frontend.ts
    │   ├── services/
    │   │   ├── image-generator.ts
    │   │   ├── param-parser.ts
    │   │   └── r2-storage.ts
    │   └── config/models.ts
    └── wrangler.toml
```

**Problem**: Code duplication between `mcp/` and `workers/`

### Proposed Structure (After Refactor)

```
cloudflare-image-mcp/
├── packages/
│   ├── core/                    # Shared library
│   │   ├── src/
│   │   │   ├── types.ts         # TypeScript interfaces
│   │   │   ├── models/          # Model configurations
│   │   │   │   ├── index.ts     # Model registry & aliases
│   │   │   │   └── configs.ts   # All model configs
│   │   │   ├── ai/              # AI client abstraction
│   │   │   │   └── client.ts    # Cloudflare AI wrapper
│   │   │   └── storage/         # Storage abstraction
│   │   │       ├── index.ts     # Storage interface
│   │   │       └── s3.ts        # S3/R2 provider
│   │   └── package.json
│   │
│   └── local/                   # Local deployment (NPM + Docker)
│       ├── src/
│       │   ├── main.ts          # Entry point
│       │   ├── mcp/
│       │   │   └── stdio.ts     # Stdio transport
│       │   ├── api/
│       │   │   └── server.ts    # OpenAI-compatible REST
│       │   └── ui/              # Web frontend
│       ├── Dockerfile
│       └── package.json
│
├── workers/                     # Cloudflare Workers deployment
│   ├── src/
│   │   ├── index.ts             # Worker entry
│   │   ├── endpoints/           # HTTP handlers
│   │   │   ├── openai-endpoint.ts
│   │   │   ├── mcp-endpoint.ts
│   │   │   └── frontend.ts
│   │   └── services/            # Worker services
│   ├── wrangler.toml
│   └── package.json
│
├── docs/
│   ├── DEPLOY.md
│   └── USAGE.md
│
└── README.md
```

## Deployment Targets

| Target | Package | Transport | Storage | Use Case |
|--------|---------|-----------|---------|----------|
| **Local CLI** | `packages/local` | stdio | R2/S3 | MCP clients, CI/CD |
| **Local Server** | `packages/local` | HTTP | R2/S3 | Web UI, REST API |
| **Docker** | `packages/local` | HTTP | R2/S3 | Self-hosted |
| **Cloudflare** | `workers/` | HTTP/SSE | R2 | Serverless, free tier |

## Shared Components

### packages/core/

The core library provides:

1. **Model Configs** (`models/configs.ts`)
   - All model parameters, limits, aliases
   - Model-specific validation rules

2. **AI Client** (`ai/client.ts`)
   - Abstraction over Cloudflare AI
   - Handles both Workers AI (cloud) and API (local)

3. **Storage** (`storage/s3.ts`)
   - S3-compatible interface
   - R2, AWS S3, MinIO support
   - Auto-expiry logic

### packages/local/

The local deployment provides:

1. **Stdio MCP Server**
   - For Claude Desktop, other MCP clients
   - `npx @cloudflare-image-mcp/local`

2. **HTTP REST API**
   - OpenAI-compatible: `/v1/images/generations`
   - `npm run serve` → `http://localhost:3000`

3. **Web Frontend**
   - Same UI as Workers deployment
   - `http://localhost:3000/`

4. **Docker Support**
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY packages/local/dist ./dist
   CMD ["node", "dist/main.js"]
   ```

### packages/workers/

Cloudflare Workers deployment:

1. **HTTP MCP** (`/mcp/message`)
   - Streamable MCP over HTTP
   - SSE transport support

2. **REST API** (`/v1/images/*`)
   - OpenAI-compatible endpoints

3. **Static Frontend** (`/`)
   - Bundled at build time
   - No external dependencies

## Environment Variables

### Cloudflare Workers (wrangler.toml)

```toml
[vars]
IMAGE_EXPIRY_HOURS = 24
CDN_URL = "https://pub-<id>.r2.dev"
```

### Local Deployment (.env)

```env
# Cloudflare
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ACCOUNT_ID=xxx

# Storage
S3_BUCKET=cloudflare-image-mcp-images
S3_REGION=auto
S3_ENDPOINT=https://<id>.r2.cloudflarestorage.com
S3_ACCESS_KEY=xxx
S3_SECRET_KEY=xxx
S3_CDN_URL=https://pub-<id>.r2.dev

# Server
PORT=3000
IMAGE_EXPIRY_HOURS=24
```

## Model Support

| Model | Tasks | Parameters |
|-------|-------|------------|
| FLUX.1 [schnell] | txt2img | prompt, steps, seed |
| FLUX.2 [klein] | txt2img, img2img | prompt, steps, seed, width, height |
| FLUX.2 [dev] | txt2img, img2img | prompt, steps, seed, width, height |
| SDXL Base 1.0 | txt2img, img2img, inpaint | prompt, neg_prompt, steps, guidance, seed, size |
| SDXL Lightning | txt2img | prompt, neg_prompt, steps, guidance, seed, size |
| DreamShaper 8 LCM | txt2img, img2img | prompt, neg_prompt, steps, guidance, seed, size |

## Development Workflow

### Prerequisites

```bash
# Node.js 18+
node --version

# Cloudflare Wrangler
npm install -g wrangler

# Docker (optional)
docker --version
```

### Local Development

```bash
# Clone and install
git clone https://github.com/tan-yong-sheng/cloudflare-image-mcp.git
cd cloudflare-image-mcp

# Install root dependencies
npm install

# Build all packages
npm run build

# Test locally (Workers)
cd workers && npx wrangler dev --remote

# Test locally (Local server)
cd packages/local && npm run dev
```

### Deployment

```bash
# Deploy to Cloudflare Workers
cd workers && npx wrangler deploy

# Publish local package
cd packages/local && npm publish

# Build Docker image
cd packages/local && docker build -t cloudflare-image-local .
```

## CI/CD Pipeline

```yaml
# GitHub Actions (example)
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build
      - run: npm test

  deploy-workers:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npm run build
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes to `packages/core/` first
4. Update `packages/local/` and `packages/workers/` to use new core
5. Add tests for new functionality
6. Run full test suite
7. Submit pull request

## License

MIT License - see LICENSE file for details.
