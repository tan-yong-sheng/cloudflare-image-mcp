# Cloudflare Image MCP - Architecture Guide (Workers-only)

## Project Overview

Cloudflare Image MCP is an image generation service deployed as a **Cloudflare Worker** providing:

- **OpenAI-compatible REST API** (`/v1/images/*`)
- **MCP Server** (Model Context Protocol) over **HTTP** (with optional **SSE** transport)
- **Web Frontend** for image generation
- **R2 Storage** for generated images with auto-expiry

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Cloudflare Workers |
| **Language** | TypeScript |
| **AI Provider** | Cloudflare Workers AI |
| **Storage** | Cloudflare R2 |
| **Protocols** | OpenAI REST API, MCP (HTTP/SSE) |
| **Frontend** | HTML + Tailwind CSS (bundled in Worker) |
| **Testing** | Playwright (E2E against staging/production) |

## Repository Structure

```
cloudflare-image-mcp/
├── workers/                     # Cloudflare Workers deployment
│   ├── src/
│   │   ├── index.ts             # Worker entry
│   │   ├── endpoints/           # HTTP handlers
│   │   ├── services/            # Worker services
│   │   └── config/              # Model registry
│   ├── wrangler.toml
│   └── package.json
│
├── e2e/                         # Playwright E2E tests
└── docs/                        # Documentation
```

## MCP Endpoints

- `/mcp` (default multi-model)
- `/mcp/smart` (explicit multi-model)
- `/mcp/simple?model=@cf/...` (single-model; `model` is required)

## Configuration

### For CI deploy / Wrangler

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Optional Worker secrets:
- `API_KEYS`
- `S3_CDN_URL`
- `TZ`
