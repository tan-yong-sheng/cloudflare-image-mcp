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

## Configuration & deployment (source of truth)

### CI/CD deploy (GitHub Actions)

**Source of truth:** `.github/workflows/deploy-workers.yml`

- CI **generates `workers/wrangler.toml` at deploy time** from GitHub Secrets and then **deletes it** after deploy.
- The checked-in `workers/wrangler.toml` should be treated as a **local/dev convenience**, not authoritative for production.

Required GitHub Secrets (CI deploy):
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Optional Worker secrets:
- `API_KEYS` (protects MCP + OpenAI endpoints + Frontend)
- `TZ`

Details: see `docs/DEPLOY.md` (AGENTS.md is authoritative if there is any contradiction).

### Model Configuration (Source of Truth)

**Source of truth:** `workers/src/config/models.json`

This file defines all available image generation models, their parameters, and capabilities. It is the authoritative source for:
- Model IDs and names
- Supported tasks (text-to-image, image-to-image)
- Input/output formats (json, multipart, base64, binary)
- Parameter schemas (prompt, steps, seed, width, height, etc.)
- Model limits (max prompt length, supported sizes)
- Edit capabilities (mask support for inpainting)

To add or update models:
1. Edit `workers/src/config/models.json`
2. Mirror the changes in `workers/src/config/models.ts` (TypeScript version used at runtime)
3. Deploy to apply changes

The frontend dropdown and MCP model discovery both use this configuration.
