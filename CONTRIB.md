# Contributing to Cloudflare Image MCP

Thank you for your interest in contributing! This document provides guidelines for contributing new features, models, and improvements.

## Table of Contents

- [Development Setup](#development-setup)
- [Adding New Cloudflare Workers AI Models](#adding-new-cloudflare-workers-ai-models)
- [Code Style](#code-style)
- [Testing](#testing)
- [E2E Testing](#e2e-testing)
- [Pull Request Process](#pull-request-process)

## Development Setup

### Prerequisites

- Node.js 20+
- npm or yarn
- Cloudflare account (for Workers deployment)
- R2 bucket or S3-compatible storage (for image storage)

### Local Development

```bash
# Clone the repository
git clone https://github.com/tan-yong-sheng/cloudflare-image-mcp.git
cd cloudflare-image-mcp

# Install dependencies
npm install

# Build all packages
npm run build

# Run local server
cd packages/local
npm run dev
```

### Testing Local Changes

```bash
# Run unit tests
npm test

# Run E2E tests locally
npm run test:e2e

# Run E2E tests against Cloudflare Workers
TEST_TARGET=workers npm run test:e2e
```

## Adding New Cloudflare Workers AI Models

To add support for a new Cloudflare Workers AI model, you need to update the model configuration in both deployment targets.

### 1. Update Workers Configuration

Edit `workers/src/config/models.ts`:

```typescript
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // ... existing models

  '@cf/provider/new-model': {
    id: '@cf/provider/new-model',
    name: 'New Model Name',
    description: 'Description of the model',
    provider: 'provider-name',
    apiVersion: 2,
    inputFormat: 'json', // or 'multipart'
    responseFormat: 'base64', // or 'binary'
    supportedTasks: ['text-to-image'], // or 'image-to-image', 'inpainting'
    parameters: {
      prompt: {
        cfParam: 'prompt',
        type: 'string',
        required: true,
        description: 'Text description of the image'
      },
      steps: {
        cfParam: 'steps',
        type: 'integer',
        default: 20,
        min: 1,
        max: 50,
        description: 'Number of diffusion steps'
      },
      // Add other parameters as needed
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 20,
      maxSteps: 50,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      supportedSizes: ['256x256', '512x512', '768x768', '1024x1024'],
    },
  },
};
```

### 2. Update Core Package Configuration

Edit `packages/core/src/models/configs.ts`:

```typescript
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // ... existing models

  '@cf/provider/new-model': {
    id: '@cf/provider/new-model',
    name: 'New Model Name',
    description: 'Description of the model',
    provider: 'provider-name',
    supportedTasks: ['text-to-image'],
    parameters: {
      prompt: { type: 'string', required: true },
      steps: { type: 'integer', default: 20, min: 1, max: 50 },
      // ... other parameters
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 20,
      maxSteps: 50,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      supportedSizes: ['256x256', '512x512', '768x768', '1024x1024'],
    },
  },
};
```

### 3. Parameter Mapping Reference

Cloudflare Workers AI uses specific parameter names. Map them correctly:

| OpenAI Parameter | Cloudflare Parameter | Description |
|------------------|---------------------|-------------|
| `prompt` | `prompt` | Text description |
| `steps` | `steps` / `num_steps` | Diffusion steps |
| `guidance` | `guidance` | Guidance scale |
| `negative_prompt` | `negative_prompt` | Elements to exclude |
| `seed` | `seed` | Random seed |
| `width` | `width` | Image width |
| `height` | `height` | Image height |
| `image` | `image` / `image_b64` | Input image (base64) |
| `mask` | `mask` / `mask_b64` | Mask for inpainting |
| `strength` | `strength` | Transformation strength |

### 4. Model Configuration Fields

#### `inputFormat`

- `'json'` - Send parameters as JSON
- `'multipart'` - Send as multipart/form-data

#### `responseFormat`

- `'base64'` - Response contains base64-encoded image
- `'binary'` - Response is binary image data

#### `supportedTasks`

- `'text-to-image'` - Generate from text
- `'image-to-image'` - Transform existing image
- `'inpainting'` - Fill masked areas

### 5. Testing the New Model

Add E2E tests for the new model in `e2e/tests/openai/generations.spec.ts`:

```typescript
test('POST /v1/images/generations with new model', async ({ request }) => {
  const response = await request.post('/v1/images/generations', {
    data: {
      prompt: 'A test image',
      model: '@cf/provider/new-model',
      steps: 20,
    },
  });

  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.data).toHaveLengthGreaterThan(0);
  expect(body.data[0]).toHaveProperty('url');
});
```

### 6. Update Documentation

Add the new model to:

- `docs/API.md` - Add to supported models table
- `docs/MCP.md` - Update tools description if needed
- `README.md` - Update feature list

## Code Style

### TypeScript

- Use strict TypeScript configuration
- Prefer `interface` over `type` for object shapes
- Use explicit return types for public functions
- Document all public APIs with JSDoc

```typescript
/**
 * Generates images using the specified model
 * @param modelId - The model ID (e.g., '@cf/black-forest-labs/flux-1-schnell')
 * @param prompt - Text description of the image
 * @param n - Number of images to generate (1-8)
 * @param options - Additional generation parameters
 * @returns Promise resolving to generation result
 */
export async function generateImages(
  modelId: string,
  prompt: string,
  n: number = 1,
  options?: GenerationOptions
): Promise<GenerationResult> {
  // Implementation
}
```

### Naming Conventions

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`

## Testing

### Unit Tests

```bash
npm test
```

### E2E Tests

E2E tests use Playwright and cover:

- OpenAI API endpoints (`/v1/images/*`)
- MCP endpoints (`/mcp/*`)
- Model listing and description
- Image generation, editing, and variations

```bash
# Run all E2E tests
cd e2e && npm test

# Run specific test file
npx playwright test tests/openai/generations.spec.ts

# Run with UI mode for debugging
npx playwright test --ui

# Run against Workers deployment
TEST_TARGET=workers npx playwright test
```

### Writing E2E Tests

Place tests in appropriate directories:

```
e2e/tests/
├── openai/          # OpenAI API tests
│   ├── models.spec.ts
│   ├── generations.spec.ts
│   ├── edits.spec.ts
│   └── variations.spec.ts
├── mcp/             # MCP tests
│   ├── initialize.spec.ts
│   ├── tools.spec.ts
│   └── sse.spec.ts
└── health.spec.ts   # Health checks
```

Use the `@api` tag for API-focused tests:

```typescript
test.describe('Feature', () => {
  test('should do something @api', async ({ request }) => {
    // Test implementation
  });
});
```

## E2E Testing

### Local Testing

```bash
# Start local server
cd packages/local && npm run dev

# In another terminal, run E2E tests
cd e2e
npm run test:local
```

### Workers Testing

```bash
# Deploy to Workers first
cd workers && npm run deploy

# Run E2E tests against Workers
cd e2e
TEST_TARGET=workers npm run test:workers
```

### GitHub Actions E2E

E2E tests run automatically on:

1. **Pull Requests** - Tests run against local Docker build
2. **Manual Dispatch** - Can target local or Workers
3. **Pre-GHCR Publish** - Blocks image publish if tests fail

Trigger manual E2E run:

```bash
gh workflow run e2e-tests.yml -f target=workers
```

## Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/add-new-model
   ```

2. **Make your changes** following the guidelines above

3. **Add tests** for new functionality

4. **Run tests locally**:
   ```bash
   npm run build
   npm test
   cd e2e && npm test
   ```

5. **Update documentation** (API.md, MCP.md, README.md)

6. **Submit PR** with:
   - Clear description of changes
   - Link to related issues
   - Test results
   - Documentation updates

### PR Checklist

- [ ] Code builds without errors
- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] New models tested with E2E
- [ ] Documentation updated
- [ ] No breaking changes (or documented)

## Deployment Verification

After merging to `main`:

1. **Workers Deployment**:
   - Check GitHub Actions workflow
   - Verify deployment summary
   - Test endpoints manually

2. **GHCR Image**:
   - Verify image is pushed
   - Test with Docker:
     ```bash
     docker pull ghcr.io/tan-yong-sheng/cloudflare-image-mcp:latest
     docker run -p 3000:3000 ghcr.io/tan-yong-sheng/cloudflare-image-mcp:latest
     ```

## Questions?

- Open an issue for questions
- Join discussions for feature proposals
- Check existing issues/PRs before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
