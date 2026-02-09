# Cloudflare Image MCP - Model Context Protocol Documentation

## Overview

Cloudflare Image MCP implements the Model Context Protocol (MCP), allowing AI assistants and agents to generate images through standardized tool interfaces.

## Transport

### Streamable HTTP

The MCP server supports streamable HTTP transport:

- **Endpoint**: `POST /mcp` or `POST /mcp/message`
- **Protocol**: JSON-RPC 2.0
- **Content-Type**: `application/json`

### Server-Sent Events (SSE)

For real-time updates:

- **Endpoint**: `GET /mcp?transport=sse`
- **Content-Type**: `text/event-stream`

## MCP Endpoints

### Discovery Endpoint

```http
GET /mcp
```

Returns MCP server information:

```json
{
  "name": "cloudflare-image-mcp",
  "version": "0.1.0",
  "protocol": "MCP",
  "transport": "streamable-http",
  "endpoints": {
    "message": "/mcp/message",
    "sse": "/mcp?transport=sse"
  },
  "tools": ["run_models", "list_models", "describe_model"],
  "description": "Image generation using Cloudflare Workers AI"
}
```

## JSON-RPC Methods

### Initialize

Initializes the MCP connection.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "clientInfo": {
      "name": "my-client",
      "version": "1.0.0"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {
        "listChanged": true
      }
    },
    "serverInfo": {
      "name": "cloudflare-image-mcp",
      "version": "0.1.0"
    }
  }
}
```

### Tools List

Lists available tools.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "run_models",
        "description": "Generate images using Cloudflare AI models",
        "inputSchema": {
          "type": "object",
          "properties": {
            "prompt": {
              "type": "string",
              "description": "Text description of the image"
            },
            "model_id": {
              "type": "string",
              "description": "Model ID from list_models"
            },
            "n": {
              "type": "number",
              "description": "Number of images (1-8)",
              "minimum": 1,
              "maximum": 8
            }
          },
          "required": ["prompt", "model_id"]
        }
      },
      {
        "name": "list_models",
        "description": "List available image generation models",
        "inputSchema": {
          "type": "object",
          "properties": {}
        }
      },
      {
        "name": "describe_model",
        "description": "Get detailed information about a model",
        "inputSchema": {
          "type": "object",
          "properties": {
            "model_id": {
              "type": "string",
              "description": "Model ID"
            }
          },
          "required": ["model_id"]
        }
      }
    ]
  }
}
```

### Tools Call

Invokes a tool.

**Request (run_models):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "run_models",
    "arguments": {
      "prompt": "A beautiful sunset over mountains",
      "model_id": "@cf/black-forest-labs/flux-1-schnell",
      "n": 1,
      "steps": 4,
      "seed": 42
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Image generated successfully!\n\n![Generated Image](https://pub-xxx.r2.dev/images/abc123.png)"
      }
    ]
  }
}
```

## Tools Reference

### run_models

Generates images using Cloudflare Workers AI models.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Image description |
| `model_id` | string | Yes | Model ID (e.g., `@cf/black-forest-labs/flux-1-schnell`) |
| `n` | number | No | Number of images (1-8) |
| `size` | string | No | Image size (e.g., "1024x1024") |
| `steps` | number | No | Diffusion steps |
| `seed` | number | No | Random seed |
| `guidance` | number | No | Guidance scale (1-30) |
| `negative_prompt` | string | No | Elements to avoid |

**Returns:**
- Markdown-formatted text with image URL(s)
- Error content if generation fails

### list_models

Lists all available models with their supported task types.

**Parameters:** None

**Returns:**
```json
{
  "@cf/black-forest-labs/flux-1-schnell": ["text-to-image"],
  "@cf/stabilityai/stable-diffusion-xl-base-1.0": ["text-to-image", "image-to-image", "inpainting"],
  "next_step": "call describe_model(model_id=\"@cf/black-forest-labs/flux-1-schnell\")"
}
```

### describe_model

Returns detailed OpenAPI schema for a model.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model_id` | string | Yes | Model ID |

**Returns:**
```json
{
  "model_id": "@cf/black-forest-labs/flux-1-schnell",
  "name": "FLUX.1 [schnell]",
  "description": "Fast 12B parameter rectified flow transformer",
  "provider": "black-forest-labs",
  "input_format": "json",
  "response_format": "base64",
  "supported_tasks": ["text-to-image"],
  "parameters": {
    "prompt": {
      "type": "string",
      "cf_param": "prompt",
      "description": "Parameter: prompt",
      "required": true
    },
    "steps": {
      "type": "integer",
      "cf_param": "steps",
      "description": "Parameter: steps",
      "default": 4,
      "minimum": 1,
      "maximum": 8
    }
  },
  "limits": {
    "max_prompt_length": 2048,
    "default_steps": 4,
    "max_steps": 8,
    "supported_sizes": ["512x512", "768x768", "1024x1024"]
  },
  "next_step": "call run_models(model_id=\"@cf/black-forest-labs/flux-1-schnell\" prompt=\"your prompt here\")"
}
```

## Usage Flow

### Recommended Interaction Pattern

1. **List Models** (if user doesn't specify):
   ```json
   { "method": "tools/call", "params": { "name": "list_models" } }
   ```

2. **Describe Model** (to get parameters):
   ```json
   { "method": "tools/call", "params": { "name": "describe_model", "arguments": { "model_id": "@cf/black-forest-labs/flux-1-schnell" } } }
   ```

3. **Run Model** (generate image):
   ```json
   { "method": "tools/call", "params": { "name": "run_models", "arguments": { "prompt": "A cat", "model_id": "@cf/black-forest-labs/flux-1-schnell" } } }
   ```

## Example Client Usage

### TypeScript/JavaScript

```typescript
async function callMCPTool(method: string, params: any) {
  const response = await fetch('https://cloudflare-image-workers.tanyongsheng-net.workers.dev/mcp/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  });

  return response.json();
}

// Initialize
await callMCPTool('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: { tools: {} },
  clientInfo: { name: 'my-app', version: '1.0.0' }
});

// Generate image
const result = await callMCPTool('tools/call', {
  name: 'run_models',
  arguments: {
    prompt: 'A beautiful landscape',
    model_id: '@cf/black-forest-labs/flux-1-schnell'
  }
});

console.log(result.result.content[0].text);
```

### Python

```python
import requests

def call_mcp(method, params=None):
    response = requests.post(
        'https://cloudflare-image-workers.tanyongsheng-net.workers.dev/mcp/message',
        json={
            'jsonrpc': '2.0',
            'id': 1,
            'method': method,
            'params': params or {}
        }
    )
    return response.json()

# Generate image
result = call_mcp('tools/call', {
    'name': 'run_models',
    'arguments': {
        'prompt': 'A beautiful landscape',
        'model_id': '@cf/black-forest-labs/flux-1-schnell'
    }
})

print(result['result']['content'][0]['text'])
```

### cURL

```bash
# Initialize
curl -X POST https://cloudflare-image-workers.tanyongsheng-net.workers.dev/mcp/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "curl", "version": "1.0" }
    }
  }'

# Generate image
curl -X POST https://cloudflare-image-workers.tanyongsheng-net.workers.dev/mcp/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "run_models",
      "arguments": {
        "prompt": "A futuristic city",
        "model_id": "@cf/black-forest-labs/flux-1-schnell"
      }
    }
  }'
```

## Error Handling

MCP errors follow JSON-RPC 2.0 specification:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Unknown tool: invalid_tool"
  }
}
```

### Common Error Codes

| Code | Meaning |
|------|---------|
| -32600 | Invalid Request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |

Tool-specific errors are returned in the content with `isError: true`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: prompt is required",
        "isError": true
      }
    ]
  }
}
```

## CORS

All MCP endpoints support CORS:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, MCP-Transport
```

## Stdio Transport - Two-Mode Workflow

The stdio MCP server (for Claude Desktop and other local MCP clients) supports two operational modes based on the `DEFAULT_MODEL` environment variable.

### Mode 1: Default Model (Simplified Workflow)

When `DEFAULT_MODEL` is set, the server skips model selection and uses the default directly.

**Available Tools:**
- `describe_model` - Get parameters for the default model
- `run_models` - Generate images

**Workflow:**
```
Step 1: describe_model()
  → Returns parameter schema for DEFAULT_MODEL

Step 2: run_models(prompt="...", params={...})
  → Generates image using DEFAULT_MODEL
```

**Configuration:**
```bash
DEFAULT_MODEL=@cf/black-forest-labs/flux-1-schnell
```

### Mode 2: Model Selection (Full Workflow)

When `DEFAULT_MODEL` is not set, the server provides enhanced model selection.

**Available Tools:**
- `list_models` - List all models with pricing, performance, and selection guide
- `describe_model` - Get detailed parameters for a specific model
- `run_models` - Generate images

**Workflow:**
```
Step 1: list_models()
  → Returns models[] with metadata and selection_guide

Step 2: describe_model(model_id="...")
  → Returns detailed parameters for chosen model

Step 3: run_models(model_id="...", prompt="...", params={...})
  → Generates image using selected model
```

**Enhanced list_models Output:**
```json
{
  "models": [
    {
      "id": "@cf/black-forest-labs/flux-1-schnell",
      "name": "FLUX.1 [schnell]",
      "pricing": { "is_free": false, "estimated_cost_1024": "~$0.0007" },
      "performance": { "speed": "ultra-fast", "estimated_time_seconds": 2 },
      "quality": { "photorealism": 8, "text_rendering": 9 },
      "best_for": ["Rapid prototyping", "Text-heavy images"]
    }
  ],
  "selection_guide": {
    "forSpeed": [...],
    "forFreeModels": [...],
    "forPhotorealism": [...],
    "forTextRendering": [...]
  },
  "quick_start": {
    "fastest_free": [...],
    "best_for_photorealism_free": [...]
  }
}
```

### Selection Guide Categories

| Category | Description |
|----------|-------------|
| `forSpeed` | Models with "ultra-fast" or "fast" speed ratings |
| `forFreeModels` | Models with `is_free: true` pricing |
| `forPhotorealism` | Models with photorealism score >= 8 |
| `forArtisticStyle` | Models with artistic style score >= 8 |
| `forTextRendering` | Models with text rendering score >= 8 |
| `forImageToImage` | Models supporting "image-to-image" task |
| `forInpainting` | Models supporting "inpainting" task |
| `forHighestQuality` | Models with highest combined quality scores |

### Claude Desktop Configuration

**Mode 1 (with default model):**
```json
{
  "mcpServers": {
    "cloudflare-image": {
      "command": "npx",
      "args": ["-y", "@cloudflare-image-mcp/local"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your_token",
        "CLOUDFLARE_ACCOUNT_ID": "your_account",
        "S3_BUCKET": "your_bucket",
        "S3_ENDPOINT": "https://...",
        "S3_ACCESS_KEY": "your_key",
        "S3_SECRET_KEY": "your_secret",
        "DEFAULT_MODEL": "@cf/black-forest-labs/flux-1-schnell"
      }
    }
  }
}
```

**Mode 2 (with model selection):**
```json
{
  "mcpServers": {
    "cloudflare-image": {
      "command": "npx",
      "args": ["-y", "@cloudflare-image-mcp/local"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your_token",
        "CLOUDFLARE_ACCOUNT_ID": "your_account",
        "S3_BUCKET": "your_bucket",
        "S3_ENDPOINT": "https://...",
        "S3_ACCESS_KEY": "your_key",
        "S3_SECRET_KEY": "your_secret"
      }
    }
  }
}
```
