# Cloudflare Image MCP

[![Deploy to Cloudflare Workers](https://github.com/tan-yong-sheng/cloudflare-image-mcp/actions/workflows/deploy-workers.yml/badge.svg)](https://github.com/tan-yong-sheng/cloudflare-image-mcp/actions/workflows/deploy-workers.yml)
[![Build and Push to GHCR](https://github.com/tan-yong-sheng/cloudflare-image-mcp/actions/workflows/deploy-ghcr.yml/badge.svg)](https://github.com/tan-yong-sheng/cloudflare-image-mcp/actions/workflows/deploy-ghcr.yml)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker)](https://github.com/tan-yong-sheng/cloudflare-image-mcp/pkgs/container/cloudflare-image-mcp)

OpenAI-compatible image generation API + MCP server powered by Cloudflare Workers AI.

## 🌟 Features

- **OpenAI-Compatible API**: `/v1/images/generations` endpoint
- **MCP Protocol Support**: 
  - Stdio transport (local CLI)
  - HTTP transport with SSE (streamable)
- **10 Image Generation Models**: FLUX, SDXL, Stable Diffusion, and more
- **Multiple Tasks**: Text-to-image, image-to-image, inpainting
- **Dual Deployment**: Local server or Cloudflare Workers
- **Web Frontend**: Interactive UI for image generation
- **R2 Storage**: Auto-expiring image storage with CDN

## 📦 Architecture

```
cloudflare-image-mcp/
├── packages/
│   ├── core/          # Shared library (models, AI client, storage)
│   └── local/         # Local deployment (stdio MCP + HTTP server + UI)
└── workers/           # Cloudflare Workers deployment (HTTP MCP + API + UI)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account (for API access)
- R2 bucket (for image storage)

### Local Development

1. **Install dependencies**

```bash
# Install all packages
cd packages/core && npm install && npm run build
cd ../local && npm install && npm run build
cd ../..
```

2. **Configure environment**

```bash
cd packages/local
cp .env.example .env
# Edit .env with your credentials
```

3. **Start the server**

```bash
npm run dev
```

The server will start on `http://localhost:3000` with:
- **Web UI**: http://localhost:3000/
- **OpenAI API**: http://localhost:3000/v1/images/generations
- **HTTP MCP**: http://localhost:3000/mcp
- **Stdio MCP**: `node dist/main.js --stdio`

### Docker Deployment

**Option 1: Docker Compose (Recommended)**

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Access at http://localhost:3000
```

**Option 2: Pre-built Image from GHCR**

```bash
docker pull ghcr.io/tan-yong-sheng/cloudflare-image-mcp:latest

docker run -d \
  --name cloudflare-image-mcp \
  -p 3000:3000 \
  -e CLOUDFLARE_API_TOKEN=your_token \
  -e CLOUDFLARE_ACCOUNT_ID=your_account_id \
  -e S3_BUCKET=your_bucket \
  -e S3_ENDPOINT=https://your_account.r2.cloudflarestorage.com \
  -e S3_ACCESS_KEY=your_access_key \
  -e S3_SECRET_KEY=your_secret_key \
  ghcr.io/tan-yong-sheng/cloudflare-image-mcp:latest
```

### Cloudflare Workers Deployment

**Option 1: Manual Deployment**

```bash
cd workers
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with your account details
npm run deploy
```

**Option 2: Automated CI/CD**

The repository includes automated deployment via GitHub Actions:

1. Add secrets to your GitHub repository:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CDN_URL` (optional)

2. Push to main branch or trigger workflow manually

3. Workers automatically deployed to: `https://cloudflare-image-workers.*.workers.dev/`

See [CICD_DEPLOYMENT.md](CICD_DEPLOYMENT.md) for detailed setup instructions.

## 📖 Usage

### OpenAI-Compatible API

```bash
curl -X POST "http://localhost:3000/v1/images/generations" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/black-forest-labs/flux-1-schnell",
    "prompt": "A beautiful sunset over mountains",
    "n": 1,
    "size": "1024x1024"
  }'
```

### MCP Tools

**Available Tools:**
- `list_models` - List all available models
- `describe_model` - Get model parameters and limits
- `run_models` - Generate images

**Workflow:**
1. Call `list_models` to get available models
2. Call `describe_model(model_id)` to understand parameters
3. Call `run_models(model_id, prompt, ...)` to generate

### Web Frontend

Open http://localhost:3000/ in your browser for an interactive UI.

## 🎨 Supported Models

| Model | Tasks | Provider |
|-------|-------|----------|
| FLUX.1 [schnell] | text-to-image | Black Forest Labs |
| FLUX.2 [klein] | text-to-image, image-to-image | Black Forest Labs |
| FLUX.2 [dev] | text-to-image, image-to-image | Black Forest Labs |
| SDXL Base 1.0 | text-to-image, image-to-image, inpainting | Stability AI |
| SDXL Lightning | text-to-image | ByteDance |
| Dreamshaper 8 LCM | text-to-image, image-to-image | Lykon |
| Lucid Origin | text-to-image | Leonardo |
| Phoenix 1.0 | text-to-image | Leonardo |
| SD 1.5 Img2Img | image-to-image | Runway ML |
| SD 1.5 Inpainting | inpainting | Runway ML |

## 🧪 Testing

Run the verification script:

```bash
./test-verification.sh
```

This tests:
- Package builds
- File structure
- Core exports
- MCP tool definitions
- Model configurations
- Documentation

## 📚 Documentation

- [Usage Guide](docs/USAGE.md) - Detailed API usage
- [Deployment Guide](docs/DEPLOY.md) - Production deployment
- [Implementation Plan](docs/PLAN.md) - Architecture details
- [OpenAI API Spec](docs/api/openai_standard/image_endpoint.md) - API reference

## 🔧 Development

### Build all packages

```bash
# Core
cd packages/core && npm run build

# Local
cd packages/local && npm run build

# Workers (type check only)
cd workers && npm run check
```

### Run tests

```bash
./test-verification.sh
```

## 🌐 Deployment Options

| Option | Transport | Best For |
|--------|-----------|----------|
| **Local Server** | HTTP | Development, self-hosted |
| **Local CLI** | stdio | MCP clients (Claude Desktop) |
| **Docker** | HTTP | Production, containerized |
| **Cloudflare Workers** | HTTP + SSE | Production, serverless, global CDN |

### Automated Deployments

This repository includes CI/CD pipelines for automated deployments:

- **Cloudflare Workers** - Auto-deploys on push to main
- **GitHub Container Registry** - Builds and publishes Docker images

See [CICD_DEPLOYMENT.md](CICD_DEPLOYMENT.md) for setup instructions.

## 📝 License

MIT

## 🤝 Contributing

See [CONTRIB.md](docs/CONTRIB.md) for guidelines.

---

**Built with:**
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- TypeScript + Node.js
