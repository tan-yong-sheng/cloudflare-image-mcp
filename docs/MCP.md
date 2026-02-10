# Cloudflare Image MCP - Model Context Protocol Documentation

## Overview

Cloudflare Image MCP implements the Model Context Protocol (MCP), allowing AI assistants and agents to generate images through standardized tool interfaces.

## Transport

### Streamable HTTP

The MCP server supports streamable HTTP transport:

- **Endpoints**:
  - Multi-model (default): `POST /mcp` or `POST /mcp/message`
  - Multi-model (explicit): `POST /mcp/smart` or `POST /mcp/smart/message`
  - Single-model (simple): `POST /mcp/simple` or `POST /mcp/simple/message`
- **Protocol**: JSON-RPC 2.0
- **Content-Type**: `application/json`

### Server-Sent Events (SSE)

For real-time updates:

- **Endpoint**: `GET /mcp?transport=sse` (or `/mcp/smart?transport=sse`, `/mcp/simple?transport=sse`)
- **Content-Type**: `text/event-stream`

## MCP Endpoints

### Discovery Endpoints

```http
GET /mcp
GET /mcp/smart
GET /mcp/simple
```

Each returns MCP server information (tools differ by endpoint):

```json
{
  "name": "cloudflare-image-mcp",
  "version": "0.1.0",
  "protocol": "MCP",
  "transport": "streamable-http",
  "endpoints": {
    "message": "/mcp/message",
    "sse": "/mcp?transport=sse",
    "smart": {
      "message": "/mcp/smart/message",
      "sse": "/mcp/smart?transport=sse"
    },
    "simple": {
      "message": "/mcp/simple/message",
      "sse": "/mcp/simple?transport=sse",
      "query": {
        "model": "Required. /mcp/simple uses this as the model_id."
      }
    }
  },
  "tools": ["run_model", "list_models", "describe_model"],
  "mode": "multi-model",
  "defaultModel": null
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
        "name": "run_model",
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

**Request (run_model):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "run_model",
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

### run_model

Generates images using Cloudflare Workers AI models.

**Parameters (multi-model endpoints: `/mcp`, `/mcp/smart`):**

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

**Parameters (simple endpoint: `/mcp/simple`):**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Image description |
| `model_id` | string | No | Not allowed to differ from the default model. Omit it. |
| `n` | number | No | Number of images (1-8) |
| `size` | string | No | Image size |
| `steps` | number | No | Diffusion steps |
| `seed` | number | No | Random seed |
| `guidance` | number | No | Guidance scale |
| `negative_prompt` | string | No | Elements to avoid |

**How the model is chosen for `/mcp/simple`:**
- `?model=@cf/...` query param (required)
- otherwise: error

**Returns:**
- Markdown-formatted text with image URL(s)
- Error content if generation fails

### list_models

Lists all available models with their supported task types.

Masked edits ("inpainting") are treated as **image-to-image** with a mask. Models advertise mask support via `edit_capabilities.mask`:
- `supported` — masks are accepted
- `required` — masks are required (this model_id cannot be used for unmasked img2img)

**Parameters:** None

**Returns:**
```json
{
  "@cf/black-forest-labs/flux-1-schnell": ["text-to-image"],
  "@cf/stabilityai/stable-diffusion-xl-base-1.0": ["text-to-image", "image-to-image"],
  "edit_capabilities": {
    "@cf/stabilityai/stable-diffusion-xl-base-1.0": { "mask": "supported" },
    "@cf/runwayml/stable-diffusion-v1-5-inpainting": { "mask": "required" }
  },
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
  "next_step": "call run_model(model_id=\"@cf/black-forest-labs/flux-1-schnell\" prompt=\"your prompt here\")"
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
   { "method": "tools/call", "params": { "name": "run_model", "arguments": { "prompt": "A cat", "model_id": "@cf/black-forest-labs/flux-1-schnell" } } }
   ```

## Example Client Usage

### TypeScript/JavaScript

```typescript
async function callMCPTool(method: string, params: any) {
  const response = await fetch('https://cloudflare-image-workers.*.workers.dev/mcp/message', {
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
  name: 'run_model',
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
        'https://cloudflare-image-workers.*.workers.dev/mcp/message',
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
    'name': 'run_model',
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
curl -X POST https://cloudflare-image-workers.*.workers.dev/mcp/message \
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
curl -X POST https://cloudflare-image-workers.*.workers.dev/mcp/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "run_model",
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

## Transport notes

This Worker exposes MCP over **HTTP** (streamable HTTP) with optional **SSE** transport. There is no separate stdio server in this repository.

**Available Tools:**
- `list_models` - List all available models (plus `edit_capabilities` for masked edits)
- `describe_model` - Get detailed parameters for a specific model
- `run_model` - Generate images

**Workflow:**
```
Step 1: list_models()
  → Returns model_id → supported_tasks, plus edit_capabilities (if any)

Step 2: describe_model(model_id="...")
  → Returns detailed parameters for chosen model

Step 3: run_model(model_id="...", prompt="...", params={...})
  → Generates image using selected model
```

**Example list_models Output:**
```json
{
  "@cf/black-forest-labs/flux-1-schnell": ["text-to-image"],
  "@cf/stabilityai/stable-diffusion-xl-base-1.0": ["text-to-image", "image-to-image"],
  "edit_capabilities": {
    "@cf/stabilityai/stable-diffusion-xl-base-1.0": { "mask": "supported" },
    "@cf/runwayml/stable-diffusion-v1-5-inpainting": { "mask": "required" }
  },
  "next_step": "call describe_model(model_id=\"@cf/black-forest-labs/flux-1-schnell\")"
}

### Claude Desktop Configuration

Use the **remote MCP URL** (HTTP) and include an API key if you enabled `API_KEYS` on the Worker.

(Exact configuration depends on the client version; the key point is that the server is available at your Worker URL under `/mcp`.)
