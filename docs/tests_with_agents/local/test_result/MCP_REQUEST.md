# MCP Tools Test Results - Local Server

## Test Environment
- **Server:** http://localhost:3000
- **Date:** 2026-01-27
- **MCP Transport:** streamable-http + stdio
- **Status:** Running

---

## Streamable HTTP MCP Tests

| Test | Method | Input | Response | Status |
|------|--------|-------|----------|--------|
| Initialize | initialize | `{}` | `{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"cloudflare-image-mcp"}}` | [/] PASS |
| tools/list | tools/list | `{}` | Returns run_models, list_models, describe_model | [/] PASS |
| list_models | tools/call | `{"name":"list_models","arguments":{}}` | JSON model_id → taskTypes mapping with next_step | [/] PASS |
| describe_model (flux) | tools/cell | `{"model_id":"@cf/black-forest-labs/flux-1-schnell"}` | OpenAPI schema with parameters, limits, next_step | [/] PASS |
| describe_model (SDXL) | tools/call | `{"model_id":"@cf/stabilityai/stable-diffusion-xl-base-1.0"}` | Full schema with img2img/inpainting params | [/] PASS |
| run_models (txt2img) | tools/call | `{"model_id":"@cf/black-forest-labs/flux-1-schnell","prompt":"a cute robot reading a book","n":1,"size":"512x512"}` | `![Generated Image](https://...png)` | [/] PASS |
| run_models (invalid) | tools/call | `{"model_id":"invalid-model","prompt":"test"}` | Error: "No route for that URI" | [/] PASS (expected error) |

---

## StdIO MCP Tests

| Test | Status | Notes |
|------|--------|-------|
| npx @modelcontextprotocol/inspector --transport stdio | [x] BLOCKED | MCP inspector port 6274 in use |
| List tools via inspector (GUI) | [ ] PENDING | Use http://localhost:6274 |
| Execute list_models via inspector | [ ] PENDING | |
| Execute describe_model via inspector | [ ] PENDING | |
| Execute run_models via inspector | [ ] PENDING | |

**Note:** MCP Inspector is running at http://localhost:6274 - use the GUI to test stdio transport

---

## Test Script Output (Streamable HTTP)

### Initialize Response
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"cloudflare-image-mcp","version":"0.1.0"}}}
```

### tools/list Response (truncated)
```json
{
  "tools": [
    {
      "name": "run_models",
      "description": "You must call 'list_models' first...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "prompt": {"type": "string", "description": "..."},
          "model_id": {"type": "string", "description": "Exact model_id from list_models output"},
          "n": {"type": "number", "minimum": 1, "maximum": 8},
          "size": {"type": "string"},
          "steps": {"type": "number"},
          "seed": {"type": "number"},
          "guidance": {"type": "number"},
          "negative_prompt": {"type": "string"}
        },
        "required": ["prompt", "model_id"]
      }
    },
    {"name": "list_models", "description": "...", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "describe_model", "description": "...", "inputSchema": {...}}
  ]
}
```

### list_models Response
```json
{
  "@cf/black-forest-labs/flux-1-schnell": ["text-to-image"],
  "@cf/black-forest-labs/flux-2-klein-4b": ["text-to-image", "image-to-image"],
  "@cf/black-forest-labs/flux-2-dev": ["text-to-image", "image-to-image"],
  "@cf/stabilityai/stable-diffusion-xl-base-1.0": ["text-to-image", "image-to-image", "inpainting"],
  "@cf/bytedance/stable-diffusion-xl-lightning": ["text-to-image"],
  "@cf/lykon/dreamshaper-8-lcm-8-lcm": ["text-to-image", "image-to-image"],
  "@cf/leonardo/lucid-origin": ["text-to-image"],
  "@cf/leonardo/phoenix-1.0": ["text-to-image"],
  "@cf/runwayml/stable-diffusion-v1-5-img2img": ["image-to-image"],
  "@cf/runwayml/stable-diffusion-v1-5-inpainting": ["inpainting"],
  "next_step": "call describe_model(model_id=\"${user_mentioned_model_id}\")"
}
```

### describe_model Response (FLUX.1 schnell)
```json
{
  "model_id": "@cf/black-forest-labs/flux-1-schnell",
  "name": "FLUX.1 [schnell]",
  "description": "Fast 12B parameter rectified flow transformer for rapid image generation",
  "provider": "black-forest-labs",
  "parameters": {
    "prompt": {"type": "string", "cf_param": "prompt", "required": true},
    "steps": {"type": "integer", "cf_param": "steps", "default": 4, "min": 1, "max": 8},
    "seed": {"type": "integer", "cf_param": "seed"}
  },
  "limits": {
    "max_prompt_length": 2048,
    "default_steps": 4,
    "max_steps": 8,
    "min_width": 512,
    "max_width": 2048,
    "min_height": 512,
    "max_height": 2048,
    "supported_sizes": ["512x512", "768x768", "1024x1024"]
  },
  "next_step": "call run_models(model_id=\"@cf/black-forest-labs/flux-1-schnell\" prompt=\"your prompt here\")"
}
```

### run_models Response (Image Generation - 2026-01-27)
```json
{
  "content": [
    {
      "type": "text",
      "text": "![Generated Image](https://pub-09d0c3eb38c7430485f7be1abc1feaec.r2.dev/images/2026/01/1769524477523-8b7h141pxl5.png)"
    }
  ]
}
```

**Verified:** Image URL loads successfully (HTTP 200 OK)

---

## Updated Summary (After S3 Endpoint Fix)

| Category | Total | Passed | Failed | Pending |
|----------|-------|--------|--------|---------|
| Streamable HTTP MCP | 7 | 7 | 0 | 0 |
| Image Generation | 1 | 1 | 0 | 0 |
| **Total** | **8** | **8** | **0** | **0** |

---

## Notes

1. All streamable HTTP MCP tests passed successfully
2. Invalid model_id returns proper error message
3. S3 endpoint was fixed from CDN URL to R2 API URL
4. Image URL format: `https://pub-...r2.dev/images/2026/01/{timestamp}-{random}.png`
3. next_step guidance is included in list_models and describe_model responses
4. StdIO tests pending - need to configure inspector with stdio transport

## Next Steps

- [ ] Run stdio MCP tests with inspector
- [ ] Test all 10 models via MCP
- [ ] Test image-to-image via MCP
- [ ] Test inpainting via MCP
