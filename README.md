# Cloudflare Image MCP

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

### Cloudflare Workers Deployment

1. **Configure wrangler**

```bash
cd workers
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with your account details
```

2. **Deploy**

```bash
npm run deploy
```

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
| **Cloudflare Workers** | HTTP + SSE | Production, serverless |

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
