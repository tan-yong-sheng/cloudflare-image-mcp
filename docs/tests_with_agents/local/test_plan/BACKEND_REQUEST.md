# Backend API Test Requests

## Overview

This document contains OpenAI-compatible curl requests for testing image generation APIs at `http://localhost:3000`.

**Endpoints:**
- `/v1/images/generations` - For text-to-image tasks
- `/v1/images/edits` - For image-to-image and inpainting tasks

**Base URL:** `http://localhost:3000`

**Authentication:** No auth required for local development

---

## OpenAI-Compatible API Reference

### Create Image (Text-to-Image)

**POST** `/v1/images/generations`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | No | Model ID or alias (defaults to flux-schnell) |
| `prompt` | string | Yes | Text description of the image |
| `n` | integer | No | Number of images (1-8, default: 1) |
| `size` | string | No | Image size (e.g., "1024x1024", "512x512") |
| `response_format` | string | No | `"url"` (default) or `"b64_json"` |

### Create Image Edit (Image-to-Image & Inpainting)

**POST** `/v1/images/edits`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | file/array | Yes | Input image(s) - PNG, WebP, JPG <50MB |
| `mask` | file | No* | Transparent areas mark editable regions (PNG <4MB). **Only for inpainting** |
| `prompt` | string | Yes | Description of desired output |
| `model` | string | No | Model ID or alias |
| `n` | integer | No | Number of images (1-8) |
| `size` | string | No | Image size |
| `strength` | number | No | Transformation strength (0-1, for img2img) |
| `response_format` | string | No | `"url"` (default) or `"b64_json"` |

**Note:** `mask` parameter is **only for inpainting tasks**. Models that support inpainting: SDXL Base, SD 1.5 Inpainting. FLUX models do NOT support inpainting.

---

## Image-to-Image vs Inpainting

### Image-to-Image (`/v1/images/edits` without mask)
Transforms an entire image based on the prompt.
- **Models:** FLUX.2 [klein/dev], SDXL Base, DreamShaper, SD 1.5 Img2Img
- **Format:** Multipart form data with `image` parameter

### Inpainting (`/v1/images/edits` with mask)
Edits only the masked regions of an image.
- **Models:** SDXL Base, SD 1.5 Inpainting
- **Format:** Multipart form data with both `image` and `mask` parameters
- **Note:** FLUX models do NOT support inpainting

---

## Model Summary

| Model ID | Alias | Task Types | Input Format |
|----------|-------|------------|--------------|
| @cf/black-forest-labs/flux-1-schnell | flux-schnell | text-to-image | JSON |
| @cf/black-forest-labs/flux-2-klein-4b | flux-klein | txt2img, img2img | JSON / multipart |
| @cf/black-forest-labs/flux-2-dev | flux-dev | txt2img, img2img | JSON / multipart |
| @cf/stabilityai/stable-diffusion-xl-base-1.0 | sdxl-base | txt2img, img2img, inpainting | JSON / multipart |
| @cf/bytedance/stable-diffusion-xl-lightning | sdxl-lightning | text-to-image | JSON |
| @cf/lykon/dreamshaper-8-lcm | dreamshaper | txt2img, img2img | JSON / multipart |
| @cf/leonardo/lucid-origin | lucid-origin | text-to-image | JSON |
| @cf/leonardo/phoenix-1.0 | phoenix | text-to-image | JSON |
| @cf/runwayml/stable-diffusion-v1-5-img2img | sd-1.5-img2img | image-to-image | JSON / multipart |
| @cf/runwayml/stable-diffusion-v1-5-inpainting | sd-1.5-inpainting | inpainting | JSON / multipart |

---

## Test Examples

### Text-to-Image (JSON)

```bash
# FLUX.1 [schnell]
curl -X POST http://localhost:3000/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "flux-schnell",
    "prompt": "a cyberpunk city skyline at night",
    "n": 1,
    "size": "1024x1024"
  }'
```

### Image-to-Image (Multipart - OpenAI Compatible)

```bash
# SDXL img2img - Use multipart form data
curl -X POST http://localhost:3000/v1/images/edits \
  -F "model=sdxl-base" \
  -F "prompt=Transform into a winter wonderland scene" \
  -F "image=@test_images/white-cloud-blue-sky-sea.jpg;type=image/jpeg" \
  -F "n=1" \
  -F "size=512x512" \
  -F "strength=0.7"
```

### Image-to-Image with Multiple Images (OpenAI image[] Array)

```bash
# FLUX Klein with multiple input images
curl -X POST http://localhost:3000/v1/images/edits \
  -F "model=@cf/black-forest-labs/flux-2-klein-4b" \
  -F "prompt=Create a composition combining these elements" \
  -F "image[]=@test_images/image1.jpg;type=image/jpeg" \
  -F "image[]=@test_images/image2.jpg;type=image/jpeg" \
  -F "image[]=@test_images/image3.jpg;type=image/jpeg" \
  -F "n=1"
```

### Inpainting (Multipart - OpenAI Compatible)

```bash
# SDXL inpainting - OpenAI-compatible multipart format
# IMPORTANT: Use file upload (multipart), NOT JSON with image_b64
# OpenAI standard: https://platform.openai.com/docs/api-reference/images
curl -X POST http://localhost:3000/v1/images/edits \
  -F "model=sdxl-base" \
  -F "prompt=Replace the background with a tropical beach" \
  -F "image=@test_images/input_image.jpg;type=image/jpeg" \
  -F "mask=@test_images/mask.png;type=image/png" \
  -F "n=1" \
  -F "size=1024x1024" \
  -F "strength=0.9"
```

**OpenAI Standard Example:**
```bash
curl -X POST "https://api.openai.com/v1/images/edits" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "image=@body-lotion.png" \
  -F "mask=@mask.png" \
  -F 'prompt=A sunlit indoor lounge with a cozy sofa' \
  -F "n=1" \
  -F "size=1024x1024"
```

### With response_format=b64_json

```bash
# Request base64 response instead of URL
curl -X POST http://localhost:3000/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "flux-schnell",
    "prompt": "a cyberpunk city",
    "response_format": "b64_json"
  }'
```

---

## Test Progress Tracker

### Text-to-Image Tests (`/v1/images/generations`)

| Model | Status | Notes |
|-------|--------|-------|
| FLUX.1 [schnell] | [x] Tested | JSON format |
| FLUX.2 [klein] | [x] Tested | JSON format |
| FLUX.2 [dev] | [x] Tested | JSON format |
| SDXL Base 1.0 | [x] Tested | JSON format |
| SDXL Lightning | [x] Tested | JSON format |
| DreamShaper 8 LCM | [x] Tested | JSON format |
| Leonardo Lucid Origin | [!] NSFW | Content filter |
| Leonardo Phoenix 1.0 | [x] Tested | JSON format |

### Image-to-Image Tests (`/v1/images/edits` without mask)

| Model | Format | Status | Notes |
|-------|--------|--------|-------|
| FLUX.2 [klein] | multipart | [x] Tested | `-F "image=@file.jpg"` |
| FLUX.2 [dev] | multipart | [x] Tested | `-F "image=@file.jpg"` |
| SDXL Base 1.0 | multipart | [x] Tested | `-F "image=@file.jpg"` |
| DreamShaper 8 LCM | multipart | [x] Tested | `-F "image=@file.jpg"` |
| SD 1.5 Img2Img | multipart | [x] Tested | `-F "image=@file.jpg"` |

### Inpainting Tests (`/v1/images/edits` with mask)

| Model | Format | Status | Notes |
|-------|--------|--------|-------|
| SDXL Base 1.0 | multipart | [x] Tested | `-F "image=@file.jpg" -F "mask=@mask.png"` |
| SD 1.5 Inpainting | multipart | [x] Tested | `-F "image=@file.jpg" -F "mask=@mask.png"` |

### OpenAI-Compatible Format Tests

| Test Case | Status | Notes |
|-----------|--------|-------|
| Single image upload | [x] Tested | `-F "image=@file.jpg"` |
| Multiple images (image[] array) | [x] Tested | `-F "image[]=@file1.jpg"` |
| Inpainting with mask | [x] Tested | `-F "image=@img.jpg" -F "mask=@mask.png"` |
| response_format=b64_json | [x] Tested | Returns base64 |
| model parameter (ID/alias) | [x] Tested | Both formats work |

---

## Notes

1. **Local Server URL:** `http://localhost:3000`
2. **OpenAI Compatible Endpoints:**
   - `POST /v1/images/generations` - Text-to-image (JSON format)
   - `POST /v1/images/edits` - Image-to-image and inpainting (Multipart format)
3. **Inpainting vs Image-to-Image:** Inpainting requires `mask` parameter, image-to-image does not
4. **FLUX models** do NOT support inpainting (no mask parameter)
5. **Use multipart format** for img2img/inpainting - NOT JSON with `image_b64`
6. **OpenAI Standard:** `/v1/images/edits` expects `image` and `mask` as file uploads, not base64 strings

### Why Not `image_b64` for Edits?

OpenAI's `/v1/images/edits` endpoint **only supports multipart form data**:
- `image` - File upload (`-F "image=@file.jpg"`)
- `mask` - File upload (`-F "mask=@mask.png"`)

The `image_b64` field is a **custom extension** for this implementation, not part of OpenAI standard. For true OpenAI compatibility, always use:
```bash
curl -X POST http://localhost:3000/v1/images/edits \
  -F "image=@input.jpg" \
  -F "mask=@mask.png" \
  -F "prompt=..."
```
