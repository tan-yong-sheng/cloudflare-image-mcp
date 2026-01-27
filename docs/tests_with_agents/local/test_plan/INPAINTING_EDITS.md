# Backend API Test Requests - Inpainting

## OpenAI-Compatible `/v1/images/edits` Endpoint

**Source:** [OpenAI Images API](https://platform.openai.com/docs/api-reference/images)

### Request Format (Multipart Form Data)

OpenAI's image edits endpoint expects **multipart/form-data** format:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | file | ✅ | Input image (PNG, WebP, JPG <50MB) |
| `mask` | file | ❌* | Mask image (PNG <4MB). Transparent areas mark editable regions. Required for inpainting. |
| `prompt` | string | ✅ | Description of desired output |
| `model` | string | No | Model ID or alias |
| `n` | integer | No | Number of images (1-8) |
| `size` | string | No | Image size (e.g., "1024x1024") |
| `response_format` | string | No | `"url"` (default) or `"b64_json"` |

*Note: `mask` is only required for inpainting tasks. Image-to-image does NOT use mask.

---

## Inpainting Test Cases (OpenAI-Compatible)

### Model: SDXL Base 1.0 (@cf/stabilityai/stable-diffusion-xl-base-1.0)

```bash
# SDXL Inpainting - OpenAI-compatible multipart format
curl -X POST "http://localhost:3000/v1/images/edits" \
  -F "model=@cf/stabilityai/stable-diffusion-xl-base-1.0" \
  -F "prompt=Replace the background with a tropical beach" \
  -F "image=@test_images/input_image.jpg;type=image/jpeg" \
  -F "mask=@test_images/mask.png;type=image/png" \
  -F "n=1" \
  -F "size=1024x1024" \
  -F "strength=0.9"
```

**Expected Response:**
```json
{
  "created": 1769513064388,
  "data": [
    {
      "url": "https://pub-....r2.dev/images/2026/01/....png",
      "revised_prompt": "Replace the background with a tropical beach"
    }
  ]
}
```

---

### Model: SD 1.5 Inpainting (@cf/runwayml/stable-diffusion-v1-5-inpainting)

```bash
# SD 1.5 Inpainting - OpenAI-compatible multipart format
curl -X POST "http://localhost:3000/v1/images/edits" \
  -F "model=@cf/runwayml/stable-diffusion-v1-5-inpainting" \
  -F "prompt=Replace with a dragon" \
  -F "image=@test_images/input_image.jpg;type=image/jpeg" \
  -F "mask=@test_images/mask.png;type=image/png" \
  -F "n=1" \
  -F "size=512x512" \
  -F "strength=0.9"
```

---

## Image-to-Image Test Cases (OpenAI-Compatible)

### Model: SDXL Base 1.0 (@cf/stabilityai/stable-diffusion-xl-base-1.0) - No Mask

```bash
# SDXL Image-to-Image - OpenAI-compatible multipart format (NO mask)
curl -X POST "http://localhost:3000/v1/images/edits" \
  -F "model=@cf/stabilityai/stable-diffusion-xl-base-1.0" \
  -F "prompt=Transform into a winter wonderland scene" \
  -F "image=@test_images/input_image.jpg;type=image/jpeg" \
  -F "n=1" \
  -F "size=1024x1024" \
  -F "strength=0.7"
```

---

### Model: @cf/lykon/dreamshaper-8-lcm 8 LCM (@cf/lykon/dreamshaper-8-lcm) - No Mask

```bash
# @cf/lykon/dreamshaper-8-lcm Image-to-Image - OpenAI-compatible multipart format (NO mask)
curl -X POST "http://localhost:3000/v1/images/edits" \
  -F "model=@cf/lykon/dreamshaper-8-lcm" \
  -F "prompt=Make this look like an oil painting" \
  -F "image=@test_images/input_image.jpg;type=image/jpeg" \
  -F "n=1" \
  -F "size=1024x1024" \
  -F "strength=0.5"
```

---

### Model: SD 1.5 Img2Img (@cf/runwayml/stable-diffusion-v1-5-img2img) - No Mask

```bash
# SD 1.5 Image-to-Image - OpenAI-compatible multipart format (NO mask)
curl -X POST "http://localhost:3000/v1/images/edits" \
  -F "model=@cf/runwayml/stable-diffusion-v1-5-img2img" \
  -F "prompt=Transform into a cyberpunk character" \
  -F "image=@test_images/input_image.jpg;type=image/jpeg" \
  -F "n=1" \
  -F "size=512x512" \
  -F "strength=0.6"
```

---

### Model: FLUX Klein (@cf/black-forest-labs/flux-2-klein-4b) - No Mask

```bash
# FLUX Klein Image-to-Image - OpenAI-compatible multipart format (NO mask)
curl -X POST "http://localhost:3000/v1/images/edits" \
  -F "model=@cf/black-forest-labs/flux-2-klein-4b" \
  -F "prompt=Transform into a cyberpunk style with neon lights" \
  -F "image=@test_images/input_image.jpg;type=image/jpeg" \
  -F "n=1" \
  -F "size=1024x1024"
```

---

### Model: FLUX Dev (@cf/black-forest-labs/flux-2-dev) - No Mask

```bash
# FLUX Dev Image-to-Image - OpenAI-compatible multipart format (NO mask)
curl -X POST "http://localhost:3000/v1/images/edits" \
  -F "model=@cf/black-forest-labs/flux-2-dev" \
  -F "prompt=Turn this into a watercolor painting" \
  -F "image=@test_images/input_image.jpg;type=image/jpeg" \
  -F "n=1" \
  -F "size=1024x1024"
```

---

## Key Differences: Inpainting vs Image-to-Image

| Feature | Inpainting | Image-to-Image |
|---------|------------|----------------|
| Uses `mask` parameter | ✅ Yes | ❌ No |
| Edits only masked regions | Yes | No (transforms entire image) |
| Supported Models | SDXL Base, SD 1.5 Inpainting | FLUX Klein/Dev, SDXL Base, @cf/lykon/dreamshaper-8-lcm, SD 1.5 Img2Img |

---

## Notes

1. **OpenAI Standard:** Always use multipart form data with `-F` flags
2. **Image Parameter:** Use `-F "image=@file.jpg"` not JSON `image_b64`
3. **Mask Parameter:** Only for inpainting - use `-F "mask=@mask.png"`
4. **No Mask for Img2Img:** Image-to-image does NOT use the mask parameter
5. **FLUX Models:** Do NOT support inpainting (no mask parameter available)
