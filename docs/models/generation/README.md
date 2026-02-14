# Image Generation Models

This document describes all available image generation models in the Cloudflare Image MCP service.

**Source of truth:** [`workers/src/config/models.json`](../../../workers/src/config/models.json)

---

## Model Overview

| Model ID | Name | Provider | Description | Text-to-Image | Image-to-Image | Mask Support |
|----------|------|----------|-------------|:-------------:|:--------------:|:------------:|
| `@cf/black-forest-labs/flux-1-schnell` | FLUX.1 [schnell] | Black Forest Labs | Fast 12B parameter rectified flow transformer for rapid image generation | ✅ | ❌ | ❌ |
| `@cf/black-forest-labs/flux-2-klein-4b` | FLUX.2 [klein] | Black Forest Labs | Ultra-fast distilled model unifying image generation and editing | ✅ | ✅ | ❌ |
| `@cf/black-forest-labs/flux-2-dev` | FLUX.2 [dev] | Black Forest Labs | High-quality image model with multi-reference support | ✅ | ✅ | ❌ |
| `@cf/black-forest-labs/flux-2-klein-9b` | FLUX.2 [klein] 9B | Black Forest Labs | Ultra-fast, distilled 9B image model with enhanced quality | ✅ | ✅ | ❌ |
| `@cf/stabilityai/stable-diffusion-xl-base-1.0` | Stable Diffusion XL Base 1.0 | Stability AI | High-quality diffusion model | ✅ | ✅ | ✅ |
| `@cf/bytedance/stable-diffusion-xl-lightning` | SDXL Lightning | Bytedance | Lightning-fast SDXL model for high-quality 1024px images | ✅ | ❌ | ❌ |
| `@cf/lykon/dreamshaper-8-lcm` | Dreamshaper 8 LCM | Lykon | Enhanced photorealistic SD model with LCM acceleration | ✅ | ✅ | ❌ |

---

## Detailed Specifications

### FLUX Models (Black Forest Labs)

#### FLUX.1 [schnell]

Fast text-to-image generation model optimized for speed.

| Attribute | Value |
|-----------|-------|
| **Input Format** | JSON |
| **Response Format** | Base64 |
| **API Version** | 2 |
| **Max Prompt Length** | 2048 characters |
| **Supported Sizes** | 512x512, 768x768, 1024x1024 |

**Parameters:**

| Parameter | Type | Required | Default | Range | Description |
|-----------|------|----------|---------|-------|-------------|
| `prompt` | string | ✅ | — | — | Text description of the image |
| `steps` | integer | ❌ | 4 | 1-8 | Diffusion steps (higher = better quality, slower) |
| `seed` | integer | ❌ | null | — | Random seed for reproducibility |

---

#### FLUX.2 [klein]

Ultra-fast distilled 4B model supporting both generation and editing.

| Attribute | Value |
|-----------|-------|
| **Input Format** | Multipart (supports up to 4 input images) |
| **Response Format** | Base64 |
| **API Version** | 2 |
| **Max Prompt Length** | 2048 characters |
| **Supported Sizes** | 256x256, 512x512, 768x768, 1024x1024, 1280x1280 |
| **Min Dimensions** | 256x256 |
| **Max Dimensions** | 2048x2048 |

**Parameters:**

| Parameter | Type | Required | Default | Range | Description |
|-----------|------|----------|---------|-------|-------------|
| `prompt` | string | ✅ | — | — | Text description of the image |
| `steps` | integer | ❌ | 4 | 1-50 | Diffusion steps |
| `seed` | integer | ❌ | null | — | Random seed for reproducibility |
| `width` | integer | ❌ | 1024 | 256-2048 | Image width in pixels (step: 64) |
| `height` | integer | ❌ | 1024 | 256-2048 | Image height in pixels (step: 64) |
| `image` | string | ❌ | — | — | Input image for img2img (base64, up to 4 images) |

---

#### FLUX.2 [dev]

High-quality model with multi-reference image support.

| Attribute | Value |
|-----------|-------|
| **Input Format** | Multipart (supports up to 4 input images) |
| **Response Format** | Base64 |
| **API Version** | 2 |
| **Max Prompt Length** | 2048 characters |
| **Supported Sizes** | 256x256, 512x512, 768x768, 1024x1024, 1280x1280 |
| **Min Dimensions** | 256x256 |
| **Max Dimensions** | 2048x2048 |

**Parameters:**

| Parameter | Type | Required | Default | Range | Description |
|-----------|------|----------|---------|-------|-------------|
| `prompt` | string | ✅ | — | — | Text description of the image |
| `steps` | integer | ❌ | 20 | 1-50 | Diffusion steps |
| `seed` | integer | ❌ | null | — | Random seed for reproducibility |
| `width` | integer | ❌ | 1024 | 256-2048 | Image width in pixels (step: 64) |
| `height` | integer | ❌ | 1024 | 256-2048 | Image height in pixels (step: 64) |
| `image` | string | ❌ | — | — | Input image for img2img (base64, up to 4 images) |

---

#### FLUX.2 [klein] 9B

Enhanced 9B distilled model with improved quality.

| Attribute | Value |
|-----------|-------|
| **Input Format** | Multipart (supports up to 4 input images) |
| **Response Format** | Base64 |
| **API Version** | 2 |
| **Max Prompt Length** | 2048 characters |
| **Supported Sizes** | 256x256, 512x512, 768x768, 1024x1024, 1280x1280 |
| **Min Dimensions** | 256x256 |
| **Max Dimensions** | 2048x2048 |

**Parameters:**

| Parameter | Type | Required | Default | Range | Description |
|-----------|------|----------|---------|-------|-------------|
| `prompt` | string | ✅ | — | — | Text description of the image |
| `steps` | integer | ❌ | 25 | 1-50 | Diffusion steps |
| `seed` | integer | ❌ | null | — | Random seed for reproducibility |
| `width` | integer | ❌ | 1024 | 256-2048 | Image width in pixels (step: 64) |
| `height` | integer | ❌ | 1024 | 256-2048 | Image height in pixels (step: 64) |
| `image` | string | ❌ | — | — | Input image for img2img (base64, up to 4 images) |

---

### Stable Diffusion XL Models

#### Stable Diffusion XL Base 1.0

Full-featured diffusion model with comprehensive editing capabilities including mask support.

| Attribute | Value |
|-----------|-------|
| **Input Format** | JSON |
| **Response Format** | Binary |
| **API Version** | 2 |
| **Max Prompt Length** | 2048 characters |
| **Supported Sizes** | 256x256, 512x512, 768x768, 1024x1024, 1280x1280, 1024x1792, 1792x1024 |
| **Min Dimensions** | 256x256 |
| **Max Dimensions** | 2048x2048 |
| **Mask Support** | ✅ Supported |

**Parameters:**

| Parameter | Type | Required | Default | Range | Description |
|-----------|------|----------|---------|-------|-------------|
| `prompt` | string | ✅ | — | — | Text description of the image |
| `negative_prompt` | string | ❌ | "" | — | Elements to avoid in the image |
| `num_steps` | integer | ❌ | 20 | 1-20 | Diffusion steps |
| `guidance` | number | ❌ | 7.5 | 1-30 | Prompt adherence strength |
| `seed` | integer | ❌ | null | — | Random seed for reproducibility |
| `width` | integer | ❌ | 1024 | 256-2048 | Image width in pixels (step: 64) |
| `height` | integer | ❌ | 1024 | 256-2048 | Image height in pixels (step: 64) |
| `image_b64` | string | ❌ | null | — | Input image for img2img (base64) |
| `mask_b64` | string | ❌ | null | — | Mask for masked edits (base64) |
| `strength` | number | ❌ | 1 | 0-1 | Img2img transformation strength |

---

#### SDXL Lightning

Fast SDXL variant optimized for speed.

| Attribute | Value |
|-----------|-------|
| **Input Format** | JSON |
| **Response Format** | Binary |
| **API Version** | 2 |
| **Max Prompt Length** | 2048 characters |
| **Supported Sizes** | 512x512, 1024x1024 |
| **Min Dimensions** | 256x256 |
| **Max Dimensions** | 2048x2048 |

**Parameters:**

| Parameter | Type | Required | Default | Range | Description |
|-----------|------|----------|---------|-------|-------------|
| `prompt` | string | ✅ | — | — | Text description of the image |
| `negative_prompt` | string | ❌ | "" | — | Elements to avoid in the image |
| `num_steps` | integer | ❌ | 4 | 1-20 | Diffusion steps |
| `guidance` | number | ❌ | 7.5 | 1-30 | Prompt adherence strength |
| `seed` | integer | ❌ | null | — | Random seed for reproducibility |
| `width` | integer | ❌ | 1024 | 256-2048 | Image width in pixels (step: 64) |
| `height` | integer | ❌ | 1024 | 256-2048 | Image height in pixels (step: 64) |

---

### Dreamshaper

#### Dreamshaper 8 LCM

Photorealistic model with LCM (Latent Consistency Model) acceleration.

| Attribute | Value |
|-----------|-------|
| **Input Format** | JSON |
| **Response Format** | Binary |
| **API Version** | 2 |
| **Max Prompt Length** | 2048 characters |
| **Supported Sizes** | 512x512, 768x768, 1024x1024 |
| **Min Dimensions** | 256x256 |
| **Max Dimensions** | 2048x2048 |

**Parameters:**

| Parameter | Type | Required | Default | Range | Description |
|-----------|------|----------|---------|-------|-------------|
| `prompt` | string | ✅ | — | — | Text description of the image |
| `negative_prompt` | string | ❌ | "" | — | Elements to avoid in the image |
| `num_steps` | integer | ❌ | 8 | 1-20 | Diffusion steps |
| `guidance` | number | ❌ | 7.5 | 1-30 | Prompt adherence strength |
| `seed` | integer | ❌ | null | — | Random seed for reproducibility |
| `width` | integer | ❌ | 1024 | 256-2048 | Image width in pixels (step: 64) |
| `height` | integer | ❌ | 1024 | 256-2048 | Image height in pixels (step: 64) |
| `image_b64` | string | ❌ | null | — | Input image for img2img (base64) |
| `strength` | number | ❌ | 1 | 0-1 | Img2img transformation strength |

---

## Feature Comparison Matrix

| Feature | FLUX.1<br>schnell | FLUX.2<br>klein 4B | FLUX.2<br>dev | FLUX.2<br>klein 9B | SDXL<br>Base | SDXL<br>Lightning | Dreamshaper<br>8 LCM |
|---------|:-----------------:|:------------------:|:-------------:|:------------------:|:------------:|:-----------------:|:--------------------:|
| Text-to-Image | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Image-to-Image | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Mask/Inpainting | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Multi-Reference | ❌ | ✅ (4) | ✅ (4) | ✅ (4) | ❌ | ❌ | ❌ |
| Negative Prompt | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Guidance Scale | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Strength Control | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Configurable Size | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Response Format Details

### Base64 Response

Models returning Base64-encoded images:
- All FLUX models (`@cf/black-forest-labs/*`)

The response includes the image data as a base64 string in the JSON response body.

### Binary Response

Models returning raw binary image data:
- Stable Diffusion XL Base 1.0
- SDXL Lightning
- Dreamshaper 8 LCM

These models return the image directly as binary content with appropriate `Content-Type` headers.

---

## Input Format Details

### JSON Input

Models accepting JSON payloads:
- FLUX.1 [schnell]
- Stable Diffusion XL Base 1.0
- SDXL Lightning
- Dreamshaper 8 LCM

Send parameters as a JSON object in the request body.

### Multipart Input

Models accepting multipart/form-data:
- FLUX.2 [klein] 4B
- FLUX.2 [dev]
- FLUX.2 [klein] 9B

These models support uploading multiple reference images (up to 4) along with text parameters.

---

## Notes

- All models support seeds for reproducible generation
- Width and height must be multiples of 64 (where configurable)
- The `strength` parameter controls how much the original image is preserved in img2img transformations (0 = no change, 1 = complete replacement)
- Mask support is currently only available on Stable Diffusion XL Base 1.0
- Multi-reference support (up to 4 images) is exclusive to FLUX.2 models
