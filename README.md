# Cloudflare Image MCP

[![Deploy to Cloudflare Workers](https://github.com/tan-yong-sheng/cloudflare-image-mcp/actions/workflows/deploy-workers.yml/badge.svg)](https://github.com/tan-yong-sheng/cloudflare-image-mcp/actions/workflows/deploy-workers.yml)

OpenAI-compatible image generation API + Streamable HTTP MCP server powered by Cloudflare Workers AI.

## 🌟 Features

- **OpenAI-Compatible API**: `/v1/images/generations` + `/v1/images/edits` endpoints
- **MCP Protocol Support**: HTTP transport with SSE (streamable)
- **10 Image Generation Models**: FLUX, SDXL, Stable Diffusion, and more
- **Multiple Tasks**: Text-to-image, image-to-image (masked edits supported)
- **Web Frontend**: Interactive UI for image generation
- **R2 Storage**: Auto-expiring image storage with CDN

## 📦 What's Included

```
cloudflare-image-mcp/
├── workers/           # Cloudflare Worker (API + MCP + Frontend)
└── e2e/               # Playwright E2E tests
```

---

## 🚀 Quick Start

### Prerequisites

1. **Deploy this MCP server** to your Cloudflare account (takes 5 minutes):
   👉 **[Deployment Guide](docs/DEPLOY.md)**

2. Note your worker URL after deployment:
   ```
   https://cloudflare-image-workers.<your-subdomain>.workers.dev
   ```

3. If you set `API_KEYS` during deployment, you'll need the key for authentication.

### MCP Client Configuration

Below are the configuration guides for different MCP clients. This server uses **HTTP/SSE transport** (not stdio) since it runs on Cloudflare Workers.

<details><summary>Claude Desktop</summary>

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cloudflare-image": {
      "url": "https://your-worker.workers.dev/mcp"
    }
  }
}
```

If using API key authentication:
```json
{
  "mcpServers": {
    "cloudflare-image": {
      "url": "https://your-worker.workers.dev/mcp?key=your-api-key"
    }
  }
}
```
</details>

<details><summary>Claude Code</summary>

Add the MCP server:

```bash
claude mcp add cloudflare-image https://your-worker.workers.dev/mcp
```

With API key:
```bash
claude mcp add cloudflare-image https://your-worker.workers.dev/mcp?key=your-api-key
```
</details>

<details><summary>Cursor</summary>

Go to: **Settings → Cursor Settings → MCP → Add new global MCP server**

```json
{
  "mcpServers": {
    "cloudflare-image": {
      "url": "https://your-worker.workers.dev/mcp"
    }
  }
}
```
</details>

<details><summary>Cline</summary>

Open Cline → Click **MCP Servers** icon → **Installed** tab → **Advanced MCP Settings**

Add to `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "cloudflare-image": {
      "url": "https://your-worker.workers.dev/mcp"
    }
  }
}
```
</details>


<details><summary>Other MCP Clients</summary>

This server implements the **MCP HTTP/SSE transport**. Configure your client with:

- **Transport**: HTTP/SSE (streamable)
- **URL**: `https://your-worker.workers.dev/mcp`
- **Auth** (if API_KEYS set): Add `?key=your-api-key` to the URL

</details>

---

## 📖 Usage

### OpenAI-Compatible API

```bash
curl -X POST "https://your-worker.workers.dev/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "@cf/black-forest-labs/flux-1-schnell",
    "prompt": "A beautiful sunset over mountains",
    "n": 1,
    "size": "1024x1024"
  }'
```

And it can be used for OpenWebUI's image generation feature:

![OpenWebUI image generation](/static/img/openwebui-image-settings.png)



### MCP Tools

**Available Tools:**
- `list_models` - List all available models
- `describe_model` - Get model parameters and limits
- `run_model` - Generate images


**Connect via MCP:**
```json
{
  "mcpServers": {
    "image-gen": {
      "url": "https://your-worker.workers.dev/mcp"
    }
  }
}
```



### Web Frontend

Open your worker URL in a browser for an interactive UI.

![Frontend](/static/img/image-generation-frontend.png)

---

## 🎨 Supported Models

📋 **[Detailed Model Specifications →](docs/models/generation/README.md)** — Full parameter reference, feature comparison, and capability matrix.

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

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Deployment Guide](docs/DEPLOY.md) | **Step-by-step deployment instructions** |
| [Credentials Setup](docs/CREDENTIALS_SETUP.md) | Environment variables and API tokens |
| [Usage Guide](docs/USAGE.md) | Detailed API usage examples |
| [MCP Guide](docs/MCP.md) | MCP protocol and tools reference |
| [API Reference](docs/API.md) | REST endpoints documentation |

---

## 🧪 Testing

```bash
# Run E2E tests against staging/production
npm run test:e2e:staging
npm run test:e2e:production
```

---

## 🔧 Development

```bash
# Type check
npm run build

# Run E2E tests
npm run test:e2e:staging
```

---

## 📝 License

MIT

---

**Built with:**
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
