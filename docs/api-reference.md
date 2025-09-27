# API Reference

## Tools

### generate_image

Generate an image using Cloudflare Workers AI text-to-image models.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | ✅ | - | Text description of the image to generate |
| `size` | string | ❌ | "1024x1024" | Image size in format "widthxheight" |
| `negativePrompt` | string | ❌ | "" | Text describing what to avoid in the image |
| `steps` | number | ❌ | 4 | Number of diffusion steps |
| `guidance` | number | ❌ | 7.5 | How closely to follow the prompt (1.0-20.0) |
| `seed` | number | ❌ | - | Random seed for reproducible results |
| `imageB64` | string | ❌ | - | Base64-encoded input image for img2img |
| `strength` | number | ❌ | 1.0 | Strength of transformation for img2img (0.1-1.0) |
| `model` | string | ❌ | "@cf/black-forest-labs/flux-1-schnell" | Model to use |

**Example:**

```json
{
  "name": "generate_image",
  "arguments": {
    "prompt": "A beautiful sunset over mountains",
    "size": "1024x1024",
    "steps": 4,
    "guidance": 7.5
  }
}
```

### list_models

List available Cloudflare Workers AI image generation models with their capabilities.

**Parameters:** None

**Example:**

```json
{
  "name": "list_models",
  "arguments": {}
}
```

## Model-Specific Features

### FLUX Schnell
- **Output Format:** Base64 JSON
- **Max Steps:** 8
- **Supported Parameters:** prompt, steps, seed
- **Best For:** Fast generation with good quality

### SDXL Base
- **Output Format:** Binary
- **Max Steps:** 20
- **Supported Parameters:** All parameters including img2img and inpainting
- **Best For:** High quality, detailed images
- **Optimal Guidance:** 10-15

### SDXL Lightning
- **Output Format:** Binary
- **Max Steps:** 8
- **Supported Parameters:** All parameters including img2img and inpainting
- **Best For:** Fast generation with good quality

### DreamShaper LCM
- **Output Format:** Binary
- **Max Steps:** 8
- **Supported Parameters:** All parameters including img2img and inpainting
- **Best For:** Photorealistic images
- **Optimal Guidance:** 1.0-2.0

### Leonardo Phoenix
- **Output Format:** Binary
- **Max Steps:** 50
- **Supported Parameters:** prompt, size, guidance, negative, seed
- **Best For:** Exceptional prompt adherence and text generation
- **Guidance Values:** [1.0, 1.3, 1.8, 2.5, 3.0, 3.5, 4.0, 4.5]

### Leonardo Lucid Origin
- **Output Format:** Base64 JSON
- **Max Steps:** 40
- **Supported Parameters:** prompt, size, guidance, seed
- **Best For:** Graphic design and creative work
- **Guidance Values:** [1.0, 1.3, 1.8, 2.5, 3.0, 3.5, 4.0, 4.5]

## Error Handling

The server returns specific error messages for common issues:

### Configuration Errors
- `Cloudflare API Token and Account ID must be configured in environment variables`
- `Please provide a prompt for image generation`

### Model Support Errors
- `Image-to-image functionality is not supported in this tool`
- `Parameter not supported by selected model`

### API Errors
- `API Error {status}: {message}`
- `Request timed out`
- `No image data found in response`

## Environment Configuration

### Required Environment Variables

```bash
CLOUDFLARE_API_TOKEN=your_api_token_here
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
```

### Optional Environment Variables

```bash
DEFAULT_MODEL=@cf/black-forest-labs/flux-1-schnell
```

## Response Format

### Success Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "Image generated successfully for prompt: 'A beautiful sunset'\n\n![Generated Image](./outputs/image/generations/uuid.jpg)"
    }
  ]
}
```

### Error Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Specific error message"
    }
  ],
  "isError": true
}
```