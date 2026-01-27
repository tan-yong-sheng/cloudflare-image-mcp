# Usage Guide

This guide covers all ways to use the Cloudflare Image MCP service.

## Available Access Methods

| Method | URL/Setup | Transport | Best For |
|--------|-----------|-----------|----------|
| **Web Frontend** | `http://localhost:8787/` or Workers URL | HTTP | Browser UI |
| **OpenAI API** | `/v1/images/generations` | HTTP REST | API integration |
| **HTTP MCP** | `/mcp/message` | HTTP + SSE | Claude Desktop, other MCP clients |
| **Stdio MCP** | npm install cloudflare-image-mcp | stdio | CLI MCP clients |

---

## Web Frontend

### Local Development

```bash
cd workers
npx wrangler dev --remote
```

Access at: **http://localhost:8787/**

### Production

Deploy to Cloudflare Workers (see [DEPLOY.md](./DEPLOY.md)), then access at your worker URL:
- `https://cloudflare-image-workers.<your-subdomain>.workers.dev/`

### Features

- Model selection dropdown
- Prompt input with `--param=value` syntax support
- Negative prompt field
- Advanced options (steps, seed, guidance, size)
- Dark/light theme toggle
- Image preview with download

---

## OpenAI-Compatible API

The API is compatible with OpenAI's `/v1/images/generations` endpoint.

### Base URLs

| Environment | URL |
|-------------|-----|
| Local | `http://localhost:8787` |
| Production | `https://cloudflare-image-workers.<your-subdomain>.workers.dev` |

### Generate Images

```bash
curl -X POST "http://localhost:8787/v1/images/generations" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/black-forest-labs/flux-1-schnell",
    "prompt": "A beautiful sunset over mountains",
    "n": 1,
    "size": "1024x1024"
  }'
```

### Response

```json
{
  "created": 1700000000,
  "data": [
    {
      "url": "https://pub-images.example.com/images/2024/xx/xxxxx.png"
    }
  ]
}
```

### Using `--param=value` Syntax

Embed parameters directly in the prompt:

```bash
curl -X POST "http://localhost:8787/v1/images/generations" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/black-forest-labs/flux-1-schnell",
    "prompt": "A cyberpunk city at night --steps=4 --seed=12345"
  }'
```

### Supported Parameters by Model

| Model | steps | seed | guidance | negative_prompt | width | height |
|-------|-------|------|----------|-----------------|-------|--------|
| FLUX.1 [schnell] | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| FLUX.2 [klein] | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| FLUX.2 [dev] | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| SDXL Base | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SDXL Lightning | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| @cf/lykon/dreamshaper-8-lcm 8 LCM | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

### List Available Models

```bash
curl "http://localhost:8787/api/internal/models"
```

---

## HTTP MCP (Streamable)

Connect MCP clients using HTTP transport with SSE for streaming.

### Setup in Claude Desktop

Edit your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cloudflare-image-http": {
      "url": "https://cloudflare-image-workers.<your-subdomain>.workers.dev/mcp/message?transport=sse",
      "transport": "http"
    }
  }
}
```

### Available Tools

#### generate_image

Generate images using Cloudflare Workers AI.

```json
{
  "name": "generate_image",
  "arguments": {
    "prompt": "A futuristic city with flying cars",
    "model": "@cf/black-forest-labs/flux-1-schnell",
    "n": 1,
    "size": "1024x1024",
    "steps": 4,
    "seed": 12345,
    "guidance": 7.5,
    "negative_prompt": "blurry, low quality"
  }
}
```

#### list_models

List all available models with their capabilities.

```json
{
  "name": "list_models",
  "arguments": {}
}
```

#### describe_model

Get detailed documentation for a specific model.

```json
{
  "name": "describe_model",
  "arguments": {
    "model": "@cf/black-forest-labs/flux-1-schnell"
  }
}
```

### Direct HTTP Calls

```bash
# Initialize connection (GET with SSE)
curl "https://your-worker.workers.dev/mcp/message?transport=sse"

# Send JSON-RPC message (POST)
curl -X POST "https://your-worker.workers.dev/mcp/message" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "generate_image",
      "arguments": {
        "prompt": "A beautiful sunset"
      }
    }
  }'
```

---

## Stdio MCP (NPM Package)

Use the standalone npm package for stdio-based MCP transport.

### Installation

```bash
npm install cloudflare-image-mcp
```

### Setup in Claude Desktop

```json
{
  "mcpServers": {
    "cloudflare-image": {
      "command": "npx",
      "args": ["cloudflare-image-mcp"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your_api_token",
        "CLOUDFLARE_ACCOUNT_ID": "your_account_id",
        "S3_BUCKET": "your-r2-bucket",
        "S3_REGION": "auto",
        "S3_ENDPOINT": "https://your-account-id.r2.cloudflarestorage.com",
        "S3_ACCESS_KEY": "your-access-key",
        "S3_SECRET_KEY": "your-secret-key",
        "S3_CDN_URL": "https://pub-your-id.r2.dev"
      }
    }
  }
}
```

### Run Directly

```bash
# With environment variables
CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=xxx \
S3_BUCKET=xxx S3_ENDPOINT=xxx \
npx cloudflare-image-mcp

# Or create a .env file
cp mcp/.env.example mcp/.env
# Edit .env with your values
npx cloudflare-image-mcp
```

### Available Tools (Stdio MCP)

Same tools as HTTP MCP:
- `generate_image`
- `list_models`
- `describe_model`

---

## Image Storage

Generated images are stored in Cloudflare R2 with automatic expiration.

### Storage Details

- **Bucket**: Configured in wrangler.toml
- **Expiry**: 24 hours (configurable via `IMAGE_EXPIRY_HOURS`)
- **Access**: Via CDN URL configured in `CDN_URL`

### Image URLs

Images are accessible at:
```
https://<CDN_URL>/images/<year>/<month>/<id>.png
```

Example:
```
https://pub-images.example.com/images/2024/12/abc123-def456.png
```

---

## Rate Limits

- **Concurrent requests**: 2 per account (Cloudflare Workers AI limit)
- **Images per request**: 1-8
- **Image size**: Up to 2048x2048 pixels

---

## Examples

### Python API Client

```python
import requests

url = "http://localhost:8787/v1/images/generations"
payload = {
    "model": "@cf/black-forest-labs/flux-1-schnell",
    "prompt": "A cat wearing a hat --steps=4",
    "n": 2
}

response = requests.post(url, json=payload)
data = response.json()

for image in data["data"]:
    print(f"Image URL: {image['url']}")
```

### JavaScript/Node.js

```javascript
const response = await fetch('http://localhost:8787/v1/images/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    prompt: 'Mountain landscape at sunset',
    n: 1,
    size: '1024x1024'
  })
});

const data = await response.json();
console.log('Generated image:', data.data[0].url);
```

### MCP Tool Call (Python)

```python
import json
import requests

# Call MCP tool via HTTP
url = "https://your-worker.workers.dev/mcp/message"
payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
        "name": "generate_image",
        "arguments": {
            "prompt": "A robot reading a book",
            "model": "@cf/black-forest-labs/flux-1-schnell"
        }
    }
}

response = requests.post(url, json=payload)
result = response.json()
print(result['result']['content'][0]['text'])
```

---

## Troubleshooting

### 404 Not Found

- Ensure you're using the correct URL path
- Check that the worker is deployed and running

### 500 Internal Error

- Check worker logs: `npx wrangler deploy --log-level debug`
- Verify R2 bucket is configured correctly
- Ensure CDN_URL points to a valid public endpoint

### MCP Connection Failed

- Verify transport type (stdio vs HTTP)
- Check environment variables for stdio MCP
- Ensure `/mcp/message` endpoint is accessible for HTTP MCP

### Images Not Loading

- Check if image has expired (24 hour TTL)
- Verify R2 bucket public access is enabled
- Confirm CDN_URL is correctly configured
