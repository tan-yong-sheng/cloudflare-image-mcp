# MCP Tools Test Results

**Date:** 2026-01-27
**Production URL:** https://cloudflare-image-workers.tys203831.workers.dev
**Version ID:** 2a313e74-eb4c-4376-b53c-4d55d708b80a

---

## Test 1: tools/list - List Available Tools

**Status:** [x] SUCCESS

**Request:**
```bash
curl -s "https://cloudflare-image-workers.tys203831.workers.dev/mcp" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "run_models",
        "description": "You must call \"list_models\" first to obtain the exact model_id required to use this tool, UNLESS the user explicitly provides a model_id in the format \"@cf/black-forest-labs/flux-1-schnell\". You must call \"describe_model\" first to obtain the params required to use this tool, UNLESS the user explicitly provides params. Available model_ids: @cf/black-forest-labs/flux-1-schnell (text-to-image), @cf/black-forest-labs/flux-2-klein-4b (text-to-image, image-to-image), @cf/black-forest-labs/flux-2-dev (text-to-image, image-to-image), @cf/stabilityai/stable-diffusion-xl-base-1.0 (text-to-image, image-to-image, inpainting), @cf/bytedance/stable-diffusion-xl-lightning (text-to-image), @cf/lykon/dreamshaper-8-lcm (text-to-image, image-to-image), @cf/leonardo/lucid-origin (text-to-image), @cf/leonardo/phoenix-1.0 (text-to-image), @cf/runwayml/stable-diffusion-v1-5-img2img (image-to-image), @cf/runwayml/stable-diffusion-v1-5-inpainting (inpainting).",
        "inputSchema": {
          "type": "object",
          "properties": {
            "prompt": { "type": "string", "description": "Text description of the image to generate" },
            "model_id": { "type": "string", "description": "Exact model_id from list_models output" },
            "n": { "type": "number", "minimum": 1, "maximum": 8, "description": "Number of images" },
            "size": { "type": "string", "description": "Image size (e.g., 1024x1024)" },
            "steps": { "type": "number", "description": "Number of diffusion steps" },
            "seed": { "type": "number", "description": "Random seed" },
            "guidance": { "type": "number", "description": "Guidance scale" },
            "negative_prompt": { "type": "string", "description": "Elements to avoid" }
          },
          "required": ["prompt", "model_id"]
        }
      },
      {
        "name": "list_models",
        "description": "List all available image generation models. Returns JSON object mapping model_id to supported task types.",
        "inputSchema": { "type": "object", "properties": {} }
      },
      {
        "name": "describe_model",
        "description": "You must call \"list_models\" first to obtain the exact model_id required to use this tool, UNLESS the user explicitly provides a model_id in the format \"@cf/black-forest-labs/flux-1-schnell\". Returns detailed OpenAPI schema documentation for a specific model including all parameters with type, min, max, default values.",
        "inputSchema": {
          "type": "object",
          "properties": { "model_id": { "type": "string" } },
          "required": ["model_id"]
        }
      }
    ]
  }
}
```

---

## Test 2: list_models - Get Model List as JSON

**Status:** [x] SUCCESS

**Request:**
```bash
curl -s "https://cloudflare-image-workers.tys203831.workers.dev/mcp" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_models","arguments":{}}}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"@cf/black-forest-labs/flux-1-schnell\": [\n    \"text-to-image\"\n  ],\n  \"@cf/black-forest-labs/flux-2-klein-4b\": [\n    \"text-to-image\",\n    \"image-to-image\"\n  ],\n  \"@cf/black-forest-labs/flux-2-dev\": [\n    \"text-to-image\",\n    \"image-to-image\"\n  ],\n  \"@cf/stabilityai/stable-diffusion-xl-base-1.0\": [\n    \"text-to-image\",\n    \"image-to-image\",\n    \"inpainting\"\n  ],\n  \"@cf/bytedance/stable-diffusion-xl-lightning\": [\n    \"text-to-image\"\n  ],\n  \"@cf/lykon/dreamshaper-8-lcm\": [\n    \"text-to-image\",\n    \"image-to-image\"\n  ],\n  \"@cf/leonardo/lucid-origin\": [\n    \"text-to-image\"\n  ],\n  \"@cf/leonardo/phoenix-1.0\": [\n    \"text-to-image\"\n  ],\n  \"@cf/runwayml/stable-diffusion-v1-5-img2img\": [\n    \"image-to-image\"\n  ],\n  \"@cf/runwayml/stable-diffusion-v1-5-inpainting\": [\n    \"inpainting\"\n  ]\n}"
      }
    ]
  }
}
```

**Parsed Output:**
```json
{
  "@cf/black-forest-labs/flux-1-schnell": ["text-to-image"],
  "@cf/black-forest-labs/flux-2-klein-4b": ["text-to-image", "image-to-image"],
  "@cf/black-forest-labs/flux-2-dev": ["text-to-image", "image-to-image"],
  "@cf/stabilityai/stable-diffusion-xl-base-1.0": ["text-to-image", "image-to-image", "inpainting"],
  "@cf/bytedance/stable-diffusion-xl-lightning": ["text-to-image"],
  "@cf/lykon/dreamshaper-8-lcm": ["text-to-image", "image-to-image"],
  "@cf/leonardo/lucid-origin": ["text-to-image"],
  "@cf/leonardo/phoenix-1.0": ["text-to-image"],
  "@cf/runwayml/stable-diffusion-v1-5-img2img": ["image-to-image"],
  "@cf/runwayml/stable-diffusion-v1-5-inpainting": ["inpainting"]
}
```

---

## Test 3: describe_model - Get Model Schema (FLUX.1 schnell)

**Status:** [x] SUCCESS

**Request:**
```bash
curl -s "https://cloudflare-image-workers.tys203831.workers.dev/mcp" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"describe_model","arguments":{"model_id":"@cf/black-forest-labs/flux-1-schnell"}}}'
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
        "text": "{\n  \"model_id\": \"@cf/black-forest-labs/flux-1-schnell\",\n  \"name\": \"FLUX.1 [schnell]\",\n  \"description\": \"Fast 12B parameter rectified flow transformer for rapid image generation\",\n  \"provider\": \"black-forest-labs\",\n  \"input_format\": \"json\",\n  \"response_format\": \"base64\",\n  \"supported_tasks\": [\n    \"text-to-image\"\n  ],\n  \"parameters\": {\n    \"prompt\": {\n      \"type\": \"string\",\n      \"cf_param\": \"prompt\",\n      \"description\": \"Parameter: prompt\",\n      \"required\": true\n    },\n    \"steps\": {\n      \"type\": \"integer\",\n      \"cf_param\": \"steps\",\n      \"description\": \"Parameter: steps\",\n      \"default\": 4,\n      \"minimum\": 1,\n      \"maximum\": 8\n    },\n    \"seed\": {\n      \"type\": \"integer\",\n      \"cf_param\": \"seed\",\n      \"description\": \"Parameter: seed\"\n    }\n  },\n  \"limits\": {\n    \"max_prompt_length\": 2048,\n    \"default_steps\": 4,\n    \"max_steps\": 8,\n    \"min_width\": 512,\n    \"max_width\": 2048,\n    \"min_height\": 512,\n    \"max_height\": 2048,\n    \"supported_sizes\": [\n      \"512x512\",\n      \"768x768\",\n      \"1024x1024\"\n    ]\n  }\n}"
      }
    ]
  }
}
```

---

## Test 4: run_models - Generate Image with FLUX.1 schnell

**Status:** [x] SUCCESS

**Request:**
```bash
curl -s "https://cloudflare-image-workers.tys203831.workers.dev/mcp" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"run_models","arguments":{"prompt":"a futuristic robot reading a book in a library","model_id":"@cf/black-forest-labs/flux-1-schnell","n":1}}}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Image generated successfully!\n\n![Generated Image](/images/2026-01-27/mkw6fuwj-zz760m17.png)"
      }
    ]
  }
}
```

---

## Test 5: run_models - Generate Image with FLUX.2 klein

**Status:** [x] SUCCESS

**Request:**
```bash
curl -s "https://cloudflare-image-workers.tys203831.workers.dev/mcp" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"run_models","arguments":{"prompt":"a cyberpunk city at night with neon lights","model_id":"@cf/black-forest-labs/flux-2-klein-4b","n":1}}}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Image generated successfully!\n\n![Generated Image](/images/2026-01-27/mkw6g0sq-j8v0c0q5.png)"
      }
    ]
  }
}
```

---

## Test 6: run_models - Generate Image with Phoenix 1.0

**Status:** [x] SUCCESS

**Request:**
```bash
curl -s "https://cloudflare-image-workers.tys203831.workers.dev/mcp" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"run_models","arguments":{"prompt":"a beautiful sunset over mountains","model_id":"@cf/leonardo/phoenix-1.0","n":1}}}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Image generated successfully!\n\n![Generated Image](/images/2026-01-27/mkw6g5q8-0t9t9r0t.png)"
      }
    ]
  }
}
```

---

## Test 7: Error Handling - Missing model_id

**Status:** [x] SUCCESS (Error correctly returned)

**Request:**
```bash
curl -s "https://cloudflare-image-workers.tys203831.workers.dev/mcp" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"run_models","arguments":{"prompt":"test"}}}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: model_id is required. Use list_models to get available model_ids.",
        "isError": true
      }
    ]
  }
}
```

---

## Test 8: Error Handling - Invalid model_id

**Status:** [x] SUCCESS (Error correctly returned)

**Request:**
```bash
curl -s "https://cloudflare-image-workers.tys203831.workers.dev/mcp" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"run_models","arguments":{"prompt":"test","model_id":"invalid-model"}}}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: Unknown model_id: invalid-model. Use list_models to get valid model_ids.",
        "isError": true
      }
    ]
  }
}
```

---

## Summary

| Test | Tool | Status |
|------|------|--------|
| 1 | tools/list | [x] SUCCESS |
| 2 | list_models | [x] SUCCESS |
| 3 | describe_model | [x] SUCCESS |
| 4 | run_models (flux-schnell) | [x] SUCCESS |
| 5 | run_models (flux-klein) | [x] SUCCESS |
| 6 | run_models (phoenix) | [x] SUCCESS |
| 7 | Error: missing model_id | [x] SUCCESS |
| 8 | Error: invalid model_id | [x] SUCCESS |

## Models Available (10 total)

| Model ID | Task Types |
|----------|------------|
| @cf/black-forest-labs/flux-1-schnell | text-to-image |
| @cf/black-forest-labs/flux-2-klein-4b | text-to-image, image-to-image |
| @cf/black-forest-labs/flux-2-dev | text-to-image, image-to-image |
| @cf/stabilityai/stable-diffusion-xl-base-1.0 | text-to-image, image-to-image, inpainting |
| @cf/bytedance/stable-diffusion-xl-lightning | text-to-image |
| @cf/lykon/dreamshaper-8-lcm | text-to-image, image-to-image |
| @cf/leonardo/lucid-origin | text-to-image |
| @cf/leonardo/phoenix-1.0 | text-to-image |
| @cf/runwayml/stable-diffusion-v1-5-img2img | image-to-image |
| @cf/runwayml/stable-diffusion-v1-5-inpainting | inpainting |
