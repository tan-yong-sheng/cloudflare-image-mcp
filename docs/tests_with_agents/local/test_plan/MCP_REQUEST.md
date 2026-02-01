# MCP Tools Test Plan - Enhanced Image Generation

## Overview
Redesign MCP tools with clear hierarchical workflow and standardized endpoints, aligned with REST API patterns (`/v1/images/generations` and `/v1/images/edits`).

## Hierarchical Tool Workflow

```
list_models (get available models with task types)
    ↓
describe_model (get model parameters and config)
    ↓
run_models (generate images with task specification)
```

## Key Changes

### 1. New Tool Schema for `run_models`

Uses `params` object for task-specific parameters and supports embedded params in prompt.

```json
{
  "name": "run_models",
  "description": "Generate images using Cloudflare AI. WORKFLOW: Step 3 - after describe_model, call this with model_id, prompt, and optional parameters. Supports params object for task-specific settings and embedded params via '---' delimiter (e.g., prompt='city ---steps=8 --seed=1234').",
  "inputSchema": {
    "type": "object",
    "properties": {
      "model_id": {
        "type": "string",
        "description": "Exact model_id from list_models output (e.g., @cf/black-forest-labs/flux-1-schnell)"
      },
      "prompt": {
        "type": "string",
        "description": "Text description of the image to generate. Supports embedded params: 'prompt ---steps=8 --seed=1234'"
      },
      "task": {
        "type": "string",
        "enum": ["text-to-image", "image-to-image", "inpainting"],
        "description": "Task type. Auto-detected if not specified based on image/mask parameters."
      },
      "n": {
        "type": "number",
        "description": "Number of images (1-8)",
        "minimum": 1,
        "maximum": 8
      },
      "size": {
        "type": "string",
        "description": "Image size (e.g., 1024x1024)"
      },
      "image": {
        "type": "string",
        "description": "Input image for img2img/inpainting: URL (https://...), base64 data URI (data:image/...), or local file path."
      },
      "mask": {
        "type": "string",
        "description": "Mask for inpainting: URL, base64 data URI, or file path."
      },
      "params": {
        "type": "object",
        "description": "Task-specific parameters (steps, seed, guidance, negative_prompt, strength)",
        "properties": {
          "steps": {
            "type": "number",
            "description": "Diffusion steps"
          },
          "seed": {
            "type": "number",
            "description": "Random seed"
          },
          "guidance": {
            "type": "number",
            "description": "Guidance scale (1-30)"
          },
          "negative_prompt": {
            "type": "string",
            "description": "Elements to avoid in the image"
          },
          "strength": {
            "type": "number",
            "description": "Transformation strength for img2img (0-1). Higher = more transformation.",
            "minimum": 0,
            "maximum": 1
          }
        }
      }
    },
    "required": ["prompt", "model_id"]
  }
}
```

### 2. Embedded Parameters in Prompt

Cloudflare-specific parameters can be embedded in the prompt using `---` delimiter:

```
"A beautiful sunset ---steps=8 --seed=1234 --guidance=7.5"
```

This gets parsed into:
- `prompt`: "A beautiful sunset"
- `embeddedParams`: `{ steps: 8, seed: 1234, guidance: 7.5 }`

### 3. Usage Examples

**Text-to-Image:**
```json
{
  "model_id": "@cf/black-forest-labs/flux-1-schnell",
  "prompt": "A cyberpunk city at night"
}
```

**With params object:**
```json
{
  "model_id": "@cf/black-forest-labs/flux-1-schnell",
  "prompt": "A cyberpunk city",
  "params": {
    "steps": 8,
    "seed": 42
  }
}
```

**With embedded params:**
```json
{
  "model_id": "@cf/black-forest-labs/flux-1-schnell",
  "prompt": "A cyberpunk city ---steps=8 --seed=42"
}
```

**Image-to-Image:**
```json
{
  "model_id": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "prompt": "Transform into a painting",
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "params": {
    "strength": 0.7
  }
}
```

**Inpainting:**
```json
{
  "model_id": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "prompt": "Add a dragon",
  "image": "https://example.com/image.jpg",
  "mask": "https://example.com/mask.png"
}
```

### 4. Updated `describe_model` with Full next_step

```json
{
  "model_id": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "name": "Stable Diffusion XL Base 1.0",
  "parameters": { ... },
  "limits": { ... },
  "supported_tasks": ["text-to-image", "image-to-image", "inpainting"],
  "next_step": {
    "tool": "run_models",
    "examples": [
      "run_models(model_id=\"@cf/stabilityai/stable-diffusion-xl-base-1.0\", prompt=\"a beautiful landscape\")",
      "run_models(model_id=\"@cf/stabilityai/stable-diffusion-xl-base-1.0\", prompt=\"oil painting style\", image=\"URL\", params={\"strength\":0.7})",
      "run_models(model_id=\"@cf/stabilityai/stable-diffusion-xl-base-1.0\", prompt=\"add a dragon\", image=\"URL\", mask=\"URL\")"
    ],
    "all_optional_params": {
      "task": "string (text-to-image|image-to-image|inpainting) - auto-detected if not specified",
      "n": "number (1-8) - default: 1",
      "size": "string (e.g., 512x512, 1024x1024) - see supported_sizes",
      "params": {
        "steps": "number - default: ${defaultSteps}, range: ${minSteps}-${maxSteps}",
        "seed": "number - for reproducibility",
        "guidance": "number (${minGuidance}-${maxGuidance}) - default: ${defaultGuidance}",
        "negative_prompt": "string - elements to avoid",
        "strength": "number (0-1) - for image-to-image, default: 0.7"
      },
      "image": "string (URL|base64|path) - for image-to-image/inpainting tasks",
      "mask": "string (URL|base64|path) - for inpainting only"
    }
  }
}
```

### 3. Updated `list_models` with Workflow Guidance

```json
{
  "@cf/black-forest-labs/flux-1-schnell": ["text-to-image"],
  "@cf/stabilityai/stable-diffusion-xl-base-1.0": ["text-to-image", "image-to-image", "inpainting"],
  "next_step": "call describe_model(model_id=\"@cf/stabilityai/stable-diffusion-xl-base-1.0\") to get parameter details, then call run_models(...) to generate images",
  "workflow": "1. list_models() → 2. describe_model(model_id) → 3. run_models(model_id, prompt, ...)"
}
```

## Standardized REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/image/generations` | POST | Text-to-image generation |
| `/v1/image/edits` | POST | Image-to-image and inpainting |

## Test Cases

### Text-to-Image
```json
{
  "task": "text-to-image",
  "model_id": "@cf/black-forest-labs/flux-1-schnell",
  "prompt": "a cyberpunk city"
}
```

### Image-to-Image
```json
{
  "task": "image-to-image",
  "model_id": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "prompt": "oil painting style",
  "image": "https://example.com/photo.jpg",
  "strength": 0.7
}
```

### Inpainting
```json
{
  "task": "inpainting",
  "model_id": "@cf/runwayml/stable-diffusion-v1-5-inpainting",
  "prompt": "add a dragon",
  "image": "https://example.com/photo.jpg",
  "mask": "https://example.com/mask.png"
}
```

### Auto-detect Task (without task param)
```json
{
  "model_id": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "prompt": "a landscape",
  "image": "https://example.com/photo.jpg"
  // task auto-detected as "image-to-image"
}
```

## Error Messages

| Scenario | Error |
|----------|-------|
| Model doesn't support specified task | "Model {model_id} does not support {task}. Supported: {supported_tasks}" |
| Task requires image | "Task {task} requires image parameter" |
| Inpainting requires mask | "Task inpainting requires mask parameter" |
| Model doesn't support img2img | "Model {model_id} does not support image input. Use text-to-image task." |

## Implementation Checklist

- [ ] Add `task` parameter to run_models inputSchema
- [ ] Update run_models description with workflow info
- [ ] Update describe_model to include all_optional_params in next_step
- [ ] Update list_models next_step with workflow guidance
- [ ] Implement task auto-detection based on image/mask params
- [ ] Add task validation for model capabilities
- [ ] Update REST API endpoints to /v1/image/generations and /v1/image/edits
- [ ] Write unit tests
- [ ] Test all task types with various image inputs
- [ ] Verify error handling

## Files to Modify

| File | Changes |
|------|---------|
| `packages/local/src/main.ts` | Update MCP tools schema and handlers |
| `packages/local/src/mcp/stdio.ts` | Same changes for stdio transport |
| `packages/local/src/api/server.ts` | Update REST API endpoints |
| `packages/core/src/types.ts` | Add task type definitions |
