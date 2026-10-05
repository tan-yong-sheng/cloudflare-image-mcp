# Cloudflare Image MCP - API Documentation

## Overview

Cloudflare Image MCP provides OpenAI-compatible REST API endpoints for image generation using Cloudflare Workers AI models. This allows seamless integration with existing OpenAI SDK clients while leveraging Cloudflare's infrastructure.

## Base URL

- **Local** (`npx wrangler dev` in `workers/`): `http://localhost:8787`
- **Cloudflare Workers**: `https://cloudflare-image-workers.<your-subdomain>.workers.dev`

## Authentication

Open by default. When `API_KEYS` is set (see [Credentials Setup](CREDENTIALS_SETUP.md)),
all `/v1/*` endpoints require `Authorization: Bearer <key>` (returns 401 JSON otherwise).

## Endpoints

### Models

#### List Models

```http
GET /v1/models
```

Returns a list of available image generation models.

**Response:**

```json
{
  "object": "list",
  "data": [
    {
      "id": "@cf/black-forest-labs/flux-1-schnell",
      "object": "model",
      "created": 1704067200,
      "owned_by": "black-forest-labs"
    }
  ]
}
```

#### Get Model

```http
GET /v1/models/{model_id}
```

Returns details about a specific model.

### Image Generations

```http
POST /v1/images/generations
```

Generate images from text prompts.

**Request Body:**

```json
{
  "prompt": "A beautiful sunset over mountains",
  "model": "@cf/black-forest-labs/flux-1-schnell",
  "n": 1,
  "size": "1024x1024",
  "response_format": "url",
  "steps": 4,
  "seed": 42,
  "guidance": 7.5,
  "negative_prompt": "blurry, low quality"
}
```

**Parameters:**

| Parameter         | Type    | Required | Default                                | Description                     |
| ----------------- | ------- | -------- | -------------------------------------- | ------------------------------- |
| `prompt`          | string  | Yes      | -                                      | Text description of the image   |
| `model`           | string  | No       | `@cf/black-forest-labs/flux-1-schnell` | Model ID                        |
| `n`               | integer | No       | 1                                      | Number of images (1-8)          |
| `size`            | string  | No       | "1024x1024"                            | Image size (model-dependent)    |
| `response_format` | string  | No       | "url"                                  | "url" or "b64_json"             |
| `steps`           | integer | No       | Model default                          | Number of diffusion steps       |
| `seed`            | integer | No       | Random                                 | Random seed for reproducibility |
| `guidance`        | number  | No       | Model default                          | Guidance scale (1-30)           |
| `negative_prompt` | string  | No       | -                                      | Elements to avoid               |

**Response:**

```json
{
  "created": 1704067200,
  "data": [
    {
      "url": "https://pub-xxx.r2.dev/images/abc123.png",
      "revised_prompt": "A beautiful sunset over mountains"
    }
  ]
}
```

### Image Edits

```http
POST /v1/images/edits
```

Edit images using **image-to-image** transformation ("img2img"), including masked edits (inpainting) when you provide a `mask`.

**Request Body (JSON):**

```json
{
  "image": "base64_encoded_image",
  "mask": "base64_encoded_mask",
  "prompt": "Add a star to the image",
  "model": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "n": 1,
  "size": "1024x1024",
  "strength": 0.5
}
```

**Request Body (Multipart):**

```http
Content-Type: multipart/form-data

image: <binary file>
mask: <binary file>
prompt: "Add a star to the image"
model: "@cf/stabilityai/stable-diffusion-xl-base-1.0"
```

**Parameters:**

| Parameter  | Type          | Required | Description                                             |
| ---------- | ------------- | -------- | ------------------------------------------------------- |
| `image`    | string/binary | Yes      | Source image (base64 or file). Aliases: `image_b64`     |
| `mask`     | string/binary | No       | Mask for masked edits (inpainting). Aliases: `mask_b64` |
| `prompt`   | string        | Yes      | Edit description                                        |
| `model`    | string        | No       | Model ID                                                |
| `strength` | number        | No       | Transformation strength (0-1)                           |

### Image Variations

```http
POST /v1/images/variations
```

Generate variations of an input image.

**Request Body:**

```json
{
  "image": "base64_encoded_image",
  "model": "@cf/black-forest-labs/flux-2-klein-4b",
  "n": 2,
  "size": "1024x1024"
}
```

## Supported Models

### Text-to-Image Models

| Model                                          | Provider          | Best For                    |
| ---------------------------------------------- | ----------------- | --------------------------- |
| `@cf/black-forest-labs/flux-1-schnell`         | Black Forest Labs | Fast generation (4 steps)   |
| `@cf/black-forest-labs/flux-2-klein-4b`        | Black Forest Labs | Balanced quality/speed      |
| `@cf/black-forest-labs/flux-2-dev`             | Black Forest Labs | High quality                |
| `@cf/stabilityai/stable-diffusion-xl-base-1.0` | Stability AI      | High quality, many features |
| `@cf/bytedance/stable-diffusion-xl-lightning`  | ByteDance         | Very fast                   |
| `@cf/lykon/dreamshaper-8-lcm`                  | Lykon             | Photorealistic              |
| `@cf/leonardo/lucid-origin`                    | Leonardo.AI       | Adaptable                   |
| `@cf/leonardo/phoenix-1.0`                     | Leonardo.AI       | Prompt adherence            |

### Image-to-Image Models (includes masked edits)

Masked edits (inpainting) are a specialized form of image-to-image editing: it uses the same `/v1/images/edits` endpoint, but additionally accepts a `mask`.

| Model                                           | Provider          | Edit capabilities                       |
| ----------------------------------------------- | ----------------- | --------------------------------------- |
| `@cf/stabilityai/stable-diffusion-xl-base-1.0`  | Stability AI      | img2img + masked edits (mask supported) |
| `@cf/black-forest-labs/flux-2-klein-4b`         | Black Forest Labs | img2img                                 |
| `@cf/black-forest-labs/flux-2-dev`              | Black Forest Labs | img2img                                 |
| `@cf/lykon/dreamshaper-8-lcm`                   | Lykon             | img2img                                 |
| `@cf/runwayml/stable-diffusion-v1-5-img2img`    | RunwayML          | img2img                                 |
| `@cf/runwayml/stable-diffusion-v1-5-inpainting` | RunwayML          | masked edits (mask required)            |

> Note: Models specialized for masked edits are still image-to-image models; they simply require a mask.

## Model-Specific Parameters

### FLUX Models

```json
{
  "prompt": "A cat",
  "model": "@cf/black-forest-labs/flux-1-schnell",
  "steps": 4, // 1-8 for schnell, 1-50 for others
  "seed": 42,
  "width": 1024, // 256-2048
  "height": 1024 // 256-2048
}
```

### Stable Diffusion XL

```json
{
  "prompt": "A cat",
  "model": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "num_steps": 20, // 1-20
  "guidance": 7.5, // 1-30
  "seed": 42,
  "negative_prompt": "blurry",
  "width": 1024, // 256-2048
  "height": 1024 // 256-2048
}
```

## Supported Sizes

Model-specific supported sizes:

- **FLUX schnell**: `512x512`, `768x768`, `1024x1024`
- **FLUX 2 models**: `256x256` to `2048x2048`
- **SDXL Base**: `256x256` to `2048x2048`, plus `1024x1792`, `1792x1024`
- **SDXL Lightning**: `512x512`, `1024x1024`
- **Dreamshaper**: `512x512`, `768x768`, `1024x1024`

## Error Handling

The API returns standard HTTP status codes:

| Status | Description                             |
| ------ | --------------------------------------- |
| 200    | Success                                 |
| 400    | Bad Request - invalid parameters        |
| 404    | Not Found - endpoint or model not found |
| 500    | Internal Server Error                   |

**Error Response Format:**

```json
{
  "error": {
    "message": "prompt is required",
    "type": "invalid_request_error",
    "param": "prompt",
    "code": null
  }
}
```

## CORS

All endpoints return `Access-Control-Allow-Origin: *` with
`GET, POST, OPTIONS`. Allowed headers: `Content-Type, Authorization`
(MCP endpoints additionally allow `MCP-Transport`).

## Rate Limits

- **Images per request**: `n` is capped at 8.
- **Concurrent requests**: ~2 per account (Cloudflare Workers AI limit).
- **Image size**: up to 2048x2048 pixels (model-dependent).
- Generated images are stored in R2 and auto-expire after 24h
  (configurable via `IMAGE_EXPIRY_HOURS`), served via the worker at `/images/...`.

## Examples

### JavaScript/TypeScript

```typescript
const response = await fetch(
  "https://cloudflare-image-workers.*.workers.dev/v1/images/generations",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "A futuristic city at night",
      model: "@cf/black-forest-labs/flux-1-schnell",
      n: 1,
      size: "1024x1024",
    }),
  }
);

const data = await response.json();
console.log(data.data[0].url);
```

### Python

```python
import requests

response = requests.post(
    'https://cloudflare-image-workers.*.workers.dev/v1/images/generations',
    json={
        'prompt': 'A futuristic city at night',
        'model': '@cf/black-forest-labs/flux-1-schnell',
        'n': 1,
        'size': '1024x1024'
    }
)

data = response.json()
print(data['data'][0]['url'])
```

### `--param=value` prompt syntax

Model-specific parameters can be embedded directly in the prompt:

```json
{
  "model": "@cf/black-forest-labs/flux-1-schnell",
  "prompt": "A cyberpunk city at night --steps=4 --seed=12345"
}
```

Explicit JSON fields win over embedded flags. Bounds are clamped to the
model's `limits` in `workers/src/config/models.json`.

### cURL

```bash
curl -X POST https://cloudflare-image-workers.*.workers.dev/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A futuristic city at night",
    "model": "@cf/black-forest-labs/flux-1-schnell"
  }'
```

## OpenAI SDK Compatibility

The API is compatible with OpenAI's Node.js SDK:

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://cloudflare-image-workers.*.workers.dev/v1",
  apiKey: "dummy-key", // Not used but required by SDK
});

const image = await openai.images.generate({
  prompt: "A cat",
  model: "@cf/black-forest-labs/flux-1-schnell",
  n: 1,
  size: "1024x1024",
});
```
