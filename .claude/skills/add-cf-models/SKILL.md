---
name: add-cf-models
description: Guides you through adding a new Cloudflare Workers AI text-to-image model. Covers updating backend model configuration, frontend dropdowns, and creating documentation. Includes instructions for parameter setup, supported tasks, usage examples, and deployment.
license: MIT
version: 2.0.0
models: gpt-5.2
---

# Add Cloudflare Text-to-Image Model Skill

This skill guides you through adding a new Cloudflare Workers AI text-to-image model to the Cloudflare Image MCP project.

## Overview

When adding a new Cloudflare text-to-image model, you need to update:
1. **Model Configuration** (backend) - Define model parameters, limits, and capabilities
2. **Frontend Dropdown** - Add model to the UI selection
3. **Model Documentation** - Create markdown doc in `docs/models/generation/`

**Note:** MCP automatically picks up new models from the model configuration - no separate MCP code changes are needed. The `list_models` and `describe_model` tools dynamically read from `workers/src/config/models.ts`.

## Prerequisites

**Required:** Cloudflare model documentation markdown file

Before adding a model, you need the Cloudflare documentation for the model. This should be a markdown file located at:
```
docs/models/generation/<model-name>.md
```

**If the user has not provided this file, prompt them:**
> "Please provide the path to the Cloudflare model documentation markdown file (e.g., `docs/models/generation/flux-2-klein-9b.md`). This file is required to extract accurate model parameters, limits, and usage examples."

## Files to Edit

```
workers/
├── src/
│   ├── config/
│   │   ├── models.json          # Source of truth - JSON schema
│   │   └── models.ts            # TypeScript runtime config (mirror of JSON)
│   └── endpoints/
│       └── frontend.ts          # HTML dropdown options
docs/
└── models/
    └── generation/
        └── <model-name>.md      # Cloudflare model documentation (REQUIRED)
```

## Step-by-Step Process

### 1. Add Model to `workers/src/config/models.json`

This is the **source of truth** for all model configurations.

Add a new entry under the `"models"` object:

```json
"@cf/provider/model-name": {
  "id": "@cf/provider/model-name",
  "name": "Display Name",
  "description": "Brief description of the model",
  "provider": "provider-name",
  "apiVersion": 2,
  "inputFormat": "json" | "multipart",
  "responseFormat": "base64" | "binary",
  "supportedTasks": ["text-to-image"] | ["text-to-image", "image-to-image"],
  "parameters": {
    "prompt": {
      "cfParam": "prompt",
      "type": "string",
      "required": true,
      "description": "Text description of the image"
    },
    "steps": {
      "cfParam": "steps",
      "type": "integer",
      "default": 4,
      "min": 1,
      "max": 50,
      "description": "Diffusion steps"
    },
    "seed": {
      "cfParam": "seed",
      "type": "integer",
      "default": null,
      "description": "Random seed for reproducibility"
    }
  },
  "limits": {
    "maxPromptLength": 2048,
    "defaultSteps": 4,
    "maxSteps": 50,
    "minWidth": 256,
    "maxWidth": 2048,
    "minHeight": 256,
    "maxHeight": 2048,
    "supportedSizes": ["256x256", "512x512", "768x768", "1024x1024"]
  }
}
```

**Key Fields:**
- `inputFormat`: `"json"` (most models) or `"multipart"` (for image-to-image)
- `responseFormat`: `"base64"` or `"binary"`
- `supportedTasks`: `["text-to-image"]` or `["text-to-image", "image-to-image"]`

### 2. Add Model Alias (Optional)

If the model has a shorter alias, add to `"modelAliases"`:

```json
"modelAliases": {
  "@cf/provider/short-name": "@cf/provider/full-model-name"
}
```

### 3. Mirror Changes to `workers/src/config/models.ts`

Add the same model configuration in TypeScript format:

```typescript
'@cf/provider/model-name': {
  id: '@cf/provider/model-name',
  name: 'Display Name',
  description: 'Brief description',
  provider: 'provider-name',
  apiVersion: 2,
  inputFormat: 'json',
  responseFormat: 'base64',
  supportedTasks: ['text-to-image'],
  parameters: {
    prompt: { cfParam: 'prompt', type: 'string', required: true },
    steps: { cfParam: 'steps', type: 'integer', default: 4, min: 1, max: 50 },
    seed: { cfParam: 'seed', type: 'integer' },
  },
  limits: {
    maxPromptLength: 2048,
    defaultSteps: 4,
    maxSteps: 50,
    minWidth: 256,
    maxWidth: 2048,
    minHeight: 256,
    maxHeight: 2048,
    supportedSizes: ['256x256', '512x512', '768x768', '1024x1024'],
  },
},
```

### 4. Add to Frontend Dropdown

Edit `workers/src/endpoints/frontend.ts` and add an `<option>` in the model dropdown:

```html
<option value="@cf/provider/model-name">@cf/provider/model-name</option>
```

The dropdown displays model_id only (as per project convention).

### 5. Create Model Documentation

Create a markdown file at `docs/models/generation/<model-name>.md` with the Cloudflare documentation for the model.

This file should include:
- Model description and capabilities
- Supported tasks (text-to-image, image-to-image)
- Parameter definitions (prompt, steps, seed, width, height, etc.)
- Usage examples (Workers TypeScript, curl)
- API schemas (input/output)

**Example file structure:**
```markdown
# model-name

**Text-to-Image • Provider**
`@cf/provider/model-name`

Brief description of the model.

### Model Info

**Terms and License:** [link ↗](https://...)
**Partner:** Yes/No
**Unit Pricing:** $0.015 per MP

## Usage

### Workers - TypeScript

\`\`\`ts
// Example code
\`\`\`

### curl Example

\`\`\`bash
curl --request POST ...
\`\`\`

## Parameters

### Input

* `prompt` **required**
  * type: string
  * description: Text description

### Output

* `image`
  * Generated image as Base64 string
```

### 6. Type Check and Deploy

```bash
cd workers
npm run check        # Verify TypeScript compiles
git add .
git commit -m "Add @cf/provider/model-name model"
git push origin main
```

Then deploy via GitHub Actions or:
```bash
gh workflow run deploy-workers.yml -f environment=production
```

## Verify the new model is available (choose a level)

MCP and the OpenAI-compatible APIs surface models from the model registry, so the goal here is to confirm:
- The model appears in **model listings**
- The model can be **described** (parameters/limits show up)
- The model can be **invoked** (optional; requires Workers AI access and may incur cost)

### Level 1 — Quick local verification (fastest)

1) **Type-check**
```bash
cd workers
npm run check
```

2) **Run the Worker locally (remote bindings)**
```bash
cd workers
npx wrangler dev --remote
```

3) **Confirm the model is listed (OpenAI)**
```bash
curl -sS http://localhost:8787/v1/models | head
```

4) **Confirm the model can be described**
```bash
curl -sS "http://localhost:8787/v1/models/%40cf%2Fprovider%2Fmodel-name" | head
```

If `API_KEYS` is enabled, add the header:
```bash
curl -sS http://localhost:8787/v1/models -H "Authorization: Bearer <your-api-key>" | head
```

5) **Confirm the model appears in the Web UI dropdown**
- Open http://localhost:8787/
- Verify the dropdown includes: `@cf/provider/model-name`

### Level 2 — API smoke test (optional generation + edits)

If you want to verify the model can actually generate:

```bash
curl -sS -X POST "http://localhost:8787/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "model": "@cf/provider/model-name",
    "prompt": "A cute robot reading a book",
    "n": 1,
    "size": "1024x1024"
  }'
```

If the model supports `image-to-image` (`supportedTasks` includes `"image-to-image"`), verify `/v1/images/edits` too.

**Important:** In this project, **OpenAI-compatible image-to-image and masked edits both use** `POST /v1/images/edits`:
- **img2img**: provide `image` + `prompt` (no `mask`)
- **masked edits (inpainting-style)**: provide `image` + `mask` + `prompt`

#### `/v1/images/edits` (JSON base64) — img2img (no mask)

```bash
curl -sS -X POST "http://localhost:8787/v1/images/edits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "model": "@cf/provider/model-name",
    "prompt": "Make it a watercolor painting",
    "image_b64": "<base64 PNG>",
    "n": 1,
    "size": "1024x1024"
  }'
```

#### `/v1/images/edits` (JSON base64) — masked edit (requires mask)

```bash
curl -sS -X POST "http://localhost:8787/v1/images/edits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "model": "@cf/provider/model-name",
    "prompt": "Replace the background with a forest",
    "image_b64": "<base64 PNG>",
    "mask_b64": "<base64 PNG mask>",
    "n": 1,
    "size": "1024x1024"
  }'
```

Notes:
- Some models use different parameter names (e.g. `image` instead of `image_b64`, or `mask` instead of `mask_b64`).
- Always confirm via **MCP**: `describe_model(model_id)` (it lists the accepted parameter keys), or check `workers/src/config/models.json`.

### Level 3 — CI-grade verification (GitHub Actions E2E)

Run the same tests used for staging/production validations.

1) **Deploy**
```bash
gh workflow run deploy-workers.yml -f environment=staging
# or
gh workflow run deploy-workers.yml -f environment=production
```

2) **Run E2E tests**
```bash
gh workflow run e2e-tests.yml -f environment=staging
# or target a specific test file
# gh workflow run e2e-tests.yml -f environment=staging -f test_pattern=tests/api/mcp/tools.spec.ts
```

Notes:
- The E2E workflow derives the Workers URL automatically using `CLOUDFLARE_ACCOUNT_ID` and the Workers subdomain API.
- If your endpoints require auth, ensure repository secrets `API_KEY` or `API_KEYS` are set for E2E.

## Common Parameter Types

| Parameter | Type | Common Defaults | Description |
|-----------|------|-----------------|-------------|
| `prompt` | string | required | Text description |
| `steps` | integer | 4-25 | Diffusion steps |
| `seed` | integer | null | Random seed |
| `width` | integer | 1024 | Image width |
| `height` | integer | 1024 | Image height |
| `guidance` | number | 7.5 | CFG scale |
| `negative_prompt` | string | "" | Elements to avoid |
| `image` | string | null | Base64 input (img2img) |
| `strength` | number | 0.8 | Transformation strength |

## Finding Model Info

Reference Cloudflare's official documentation:
- https://developers.cloudflare.com/workers-ai/models/
- Or static docs in `docs/models/generation/`

## Example: Adding FLUX.2 [klein] 9B

See commit `be7efed` for a complete example of adding `@cf/black-forest-labs/flux-2-klein-9b`.

Key characteristics:
- `inputFormat`: "multipart" (accepts image uploads)
- `responseFormat`: "base64"
- `supportedTasks`: ["text-to-image", "image-to-image"]
- Supports up to 4 input images
- Default steps: 25, max: 50
