# Cloudflare Image MCP

[![Deploy to Cloudflare Workers](https://github.com/tan-yong-sheng/cloudflare-image-mcp/actions/workflows/deploy-workers.yml/badge.svg)](https://github.com/tan-yong-sheng/cloudflare-image-mcp/actions/workflows/deploy-workers.yml)

OpenAI-compatible image generation API + MCP server powered by Cloudflare Workers AI.

## 🌟 Features

- **OpenAI-Compatible API**: `/v1/images/generations` + `/v1/images/edits` endpoints
- **MCP Protocol Support**:
  - HTTP transport with SSE (streamable)
- **10 Image Generation Models**: FLUX, SDXL, Stable Diffusion, and more
- **Multiple Tasks**: Text-to-image, image-to-image (masked edits supported)
- **Deployment**: Cloudflare Workers
- **Web Frontend**: Interactive UI for image generation
- **R2 Storage**: Auto-expiring image storage with CDN

## 📦 Architecture

```
cloudflare-image-mcp/
├── workers/           # Cloudflare Workers deployment (HTTP MCP + API + UI)
└── e2e/               # Playwright E2E tests (staging/production)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account (for API access)
- R2 bucket (for image storage)

### Local Development

```bash
cd workers
npm ci
npx wrangler dev --remote
```

Then open:
- Web UI: http://localhost:8787/

### Deploy

```bash
cd workers
npm ci
npx wrangler deploy
```

### Cloudflare Workers Deployment (CI/CD)

**Option 1: Manual Deployment (local wrangler.toml)**

```bash
cd workers
# Configure your local workers/wrangler.toml (bindings: IMAGE_BUCKET, AI)
# Then deploy
npx wrangler deploy
```

**Option 2: Automated CI/CD (recommended)**

The repository includes automated deployment via GitHub Actions:

1. Add secrets to your GitHub repository:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `API_KEYS` (optional - protects endpoints and frontend)

2. Push to main branch or trigger workflow manually

3. Workers automatically deployed to: `https://cloudflare-image-workers.*.workers.dev/`

See `docs/` for detailed setup instructions.

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
| SDXL Base 1.0 | text-to-image, image-to-image (img2img + masked edits) | Stability AI |
| SDXL Lightning | text-to-image | ByteDance |
| Dreamshaper 8 LCM | text-to-image, image-to-image (img2img) | Lykon |
| Lucid Origin | text-to-image | Leonardo |
| Phoenix 1.0 | text-to-image | Leonardo |
| SD 1.5 Img2Img | image-to-image (img2img) | Runway ML |
| SD 1.5 Inpainting | image-to-image (requires mask) | Runway ML |

## 🧪 Testing

E2E tests run against Workers deployments (staging/production).

```bash
npm run test:e2e:staging
# or
npm run test:e2e:production
```

## 📚 Documentation

- [Usage Guide](docs/USAGE.md) - Detailed API usage
- [Environment Setup](docs/CREDENTIALS_SETUP.md) - Required Cloudflare credentials
- [Deployment Guide](docs/DEPLOY.md) - Production deployment
- [MCP Guide](docs/MCP.md) - MCP tools and transports
- [OpenAI-Compatible API](docs/API.md) - REST endpoints (`/v1/images/*`)

## 🔧 Development

### Type check Workers

```bash
npm run build
```

### Run E2E tests

```bash
npm run test:e2e:staging
# or
npm run test:e2e:production
```

## 🌐 Deployment

This project deploys to **Cloudflare Workers**.

### Automated Deployments

This repository includes CI/CD pipelines for automated deployments:

- **Cloudflare Workers** - Auto-deploys on push to main

See `docs/` for deployment instructions.

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
