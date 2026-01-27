# TODO - Refactoring Progress

## Phase 1: Create packages/core/ (Shared Library) ✅ COMPLETE

### Step 1.1: Create package structure
- [x] Create `packages/core/src/` directory structure
- [x] Create `packages/core/package.json`
- [x] Create `packages/core/tsconfig.json`

### Step 1.2: Define types (packages/core/src/types.ts)
- [x] Define `ModelConfig` interface
- [x] Define `ParameterConfig` interface
- [x] Define `ModelLimits` interface
- [x] Define `StorageConfig` interface
- [x] Define `ImageGenerationParams` interface
- [x] Define `StorageResult` interface
- [x] Export all types

### Step 1.3: Create model configs (packages/core/src/models/configs.ts)
- [x] Migrate FLUX.1 [schnell] config
- [x] Migrate FLUX.2 [klein] config
- [x] Migrate FLUX.2 [dev] config
- [x] Migrate SDXL Base 1.0 config
- [x] Migrate SDXL Lightning config
- [x] Migrate DreamShaper 8 LCM config
- [x] Create MODEL_CONFIGS constant
- [x] Create MODEL_ALIASES constant
- [x] Create helper functions (resolveModelId, getModelConfig, listModels)

### Step 1.4: Create AI client (packages/core/src/ai/client.ts)
- [x] Define `AIClient` interface
- [x] Implement `createAIClient` function
- [x] Handle Cloudflare API authentication
- [x] Handle request/response parsing
- [x] Handle timeouts and errors

### Step 1.5: Create storage abstraction (packages/core/src/storage/s3.ts)
- [x] Define `StorageProvider` interface
- [x] Implement `uploadImage` method
- [x] Implement `deleteImage` method
- [x] Implement `cleanupExpired` method
- [x] Implement `listImages` method
- [x] Handle S3/R2 operations

### Step 1.6: Create package exports (packages/core/src/index.ts)
- [x] Export types
- [x] Export models
- [x] Export AI client factory
- [x] Export storage factory

---

## Phase 2: Create packages/local/ (Local Deployment) ✅ COMPLETE

### Step 2.1: Create package structure
- [x] Create `packages/local/src/` directory structure
- [x] Create `packages/local/package.json`
- [x] Create `packages/local/tsconfig.json`

### Step 2.2: Create main entry point (packages/local/src/main.ts)
- [x] Set up Express server
- [x] Configure middleware
- [x] Mount REST API
- [x] Mount web UI static files
- [x] Mount HTTP MCP endpoint
- [x] Read environment variables

### Step 2.3: Create stdio MCP (packages/local/src/mcp/stdio.ts)
- [x] Import MCP SDK
- [x] Create stdio transport
- [x] Register tools (generate_image, list_models, describe_model)
- [x] Connect to AI client

### Step 2.4: Create REST API (packages/local/src/api/server.ts)
- [x] Implement `POST /v1/images/generations`
- [x] Implement `GET /v1/models`
- [x] Implement `GET /health`
- [x] Parse OpenAI-style request body
- [x] Return OpenAI-style response

### Step 2.5: Create Web UI (packages/local/src/ui/index.html)
- [x] Copy from workers/src/endpoints/frontend.ts
- [x] Update API endpoints to use relative paths
- [x] Test responsiveness

### Step 2.6: Create Dockerfile (packages/local/Dockerfile)
- [x] Use node:18-alpine base
- [x] Copy built files
- [x] Install production deps
- [x] Expose port 3000
- [x] Set CMD

### Step 2.7: Create .env.example (packages/local/.env.example)
- [x] Document all environment variables
- [x] Provide example values

---

## Phase 3: Refactor workers/ (Cloudflare Workers) - NEEDS WORK

### Step 3.1: Update dependencies
- [ ] Add @cloudflare-image-mcp/core to package.json
- [ ] Update imports to use core

### Step 3.2: Refactor image-generator.ts
- [ ] Remove duplicate model configs
- [ ] Import from @cloudflare-image-mcp/core/models
- [ ] Remove duplicate parameter parsing logic
- [ ] Keep R2-specific storage calls

### Step 3.3: Refactor param-parser.ts
- [ ] Move reusable parsing to core
- [ ] Keep workers-specific helpers

### Step 3.4: Clean up workers/src/config/
- [ ] Remove duplicate model configs
- [ ] Export re-exports from core

---

## Phase 4: Update root configuration ✅ DONE

### Step 4.1: Update root package.json
- [x] Not needed - separate packages

### Step 4.2: Create root tsconfig.json
- [x] Not needed - each package has its own tsconfig

---

## Phase 5: Cleanup old mcp/ folder ✅ COMPLETE

### Step 5.1: Migrate to packages/local/
- [x] Copy mcp/src/server.ts → packages/local/src/mcp/stdio.ts
- [x] Copy mcp/src/cloudflare-client.ts → core/ai/client.ts
- [x] Copy mcp/src/storage/ → core/storage/

### Step 5.2: Update npm package
- [x] Update @cloudflare-image-mcp/local package.json
- [ ] Publish to npm registry (pending)
- [ ] Deprecate old mcp package (pending)

### Step 5.3: Remove old folder
- [x] Remove mcp/ folder

---

## Verification

### Build Verification
- [x] packages/core builds successfully (`npm run build` in packages/core)
- [x] packages/local builds successfully (`npm run build` in packages/local)

### Local Testing
- [ ] Local server starts on port 3000 (needs CLOUDFLARE credentials)
- [ ] Web UI loads at http://localhost:3000
- [ ] REST API returns models at http://localhost:3000/v1/models
- [ ] Image generation works via API (needs Cloudflare AI access)
- [ ] Stdio MCP works with Claude Desktop
- [ ] Docker image builds successfully
- [ ] Docker container runs and serves API

### Workers Testing (needs Cloudflare credentials)
- [ ] Workers dev server starts (`npx wrangler dev --remote`)
- [ ] Web UI loads
- [ ] REST API works
- [ ] MCP HTTP endpoint works

---

## Required Credentials for Testing

To run full tests, the following credentials are needed in `.env`:

1. **CLOUDFLARE_API_TOKEN** - API token with Workers AI permissions
2. **CLOUDFLARE_ACCOUNT_ID** - Cloudflare account ID
3. **S3_BUCKET** - R2 bucket name (usually `cloudflare-image-mcp-images`)
4. **S3_REGION** - Region (use `auto` for R2)
5. **S3_ENDPOINT** - R2 endpoint URL
6. **S3_ACCESS_KEY** - R2 API token access key
7. **S3_SECRET_KEY** - R2 API token secret key
8. **S3_CDN_URL** - Public CDN URL for images

---

## Notes

- The `mcp/` folder has been removed
- `workers/` is a separate deployment target (not in packages/)
- Each package (core, local, workers) has its own package.json and tsconfig.json
- The local package uses Express.js for HTTP server
- The workers package uses Cloudflare Workers runtime
- Both share the same core library for models, AI, and storage

---

## Bug Fixes (2026-01-27)

### Issue 1: /mcp endpoint returns 404 ❌ FIXED
**File**: `workers/src/index.ts`, `workers/src/endpoints/mcp-endpoint.ts`

**Problem**: GET request to `/mcp` returned `{"error":"Not found"}` because the route only handled `/mcp/message` and `/mcp/` with transport=sse.

**Fix**:
- Updated route in `workers/src/index.ts` to include `/mcp`:
  ```typescript
  if (path === '/mcp' || path === '/mcp/message' || path.startsWith('/mcp/')) {
  ```
- Added `handleInfo()` method in `workers/src/endpoints/mcp-endpoint.ts` to return MCP endpoint info:
  ```typescript
  if (request.method === 'GET' && pathname === '/mcp') {
    return this.handleInfo();
  }
  ```

### Issue 2: Web UI needs authentication ❌ PENDING
**Problem**: Web UI lacks authentication (Bearer API key + OAuth 2.1 with better-auth)

**Status**: Not yet implemented

### Issue 3: FLUX.2 models return internal server error ❌ FIXED
**File**: `workers/src/services/image-generator.ts`

**Problem**: FLUX.2 models (`flux-2-klein-4b`, `flux-2-dev`) returned `3043: Internal server error` when using multipart format.

**Root Cause**: The image data was being converted to string using `String(value)` which corrupted the binary data.

**Fix**:
- Added `base64ToUint8Array()` helper method to properly convert base64 image data to Uint8Array
- Updated multipart handling in `generateImage()` and `generateImageToImage()`:
  ```typescript
  if (key === 'image' && typeof value === 'string') {
    const intArray = this.base64ToUint8Array(value);
    form.append(key, intArray as any);
  }
  ```

### Issue 4: Missing Leonardo models ❌ FIXED
**File**: `workers/src/config/models.ts`

**Added models**:
- `@cf/leonardo/lucid-origin` - Lucid Origin model (base64 response)
- `@cf/leonardo/phoenix-1.0` - Phoenix 1.0 model (binary response)

**Aliases added**:
- `lucid-origin` → `@cf/leonardo/lucid-origin`
- `phoenix` → `@cf/leonardo/phoenix-1.0`
- `phoenix-1.0` → `@cf/leonardo/phoenix-1.0`

### Issue 5: Missing Stable Diffusion 1.5 models ❌ FIXED
**File**: `workers/src/config/models.ts`

**Added models**:
- `@cf/runwayml/stable-diffusion-v1-5-img2img` - SD 1.5 for image-to-image
- `@cf/runwayml/stable-diffusion-v1-5-inpainting` - SD 1.5 for inpainting

**Aliases added**:
- `sd-1.5-img2img` → `@cf/runwayml/stable-diffusion-v1-5-img2img`
- `sd-1.5-inpainting` → `@cf/runwayml/stable-diffusion-v1-5-inpainting`

### Issue 6: Time duration display shows "-" ❌ FIXED
**File**: `workers/src/endpoints/frontend.ts`

**Problem**: Generation time displayed as "-" because the code checked `data.created` as boolean and defaulted to "10s".

**Fix**:
- Capture start time before API call: `const startTime = Date.now();`
- Calculate elapsed time after response: `const elapsed = Date.now() - startTime;`
- Display actual elapsed time: `document.getElementById('generationTime').textContent = elapsedSeconds + 's';`

**Frontend update**: Added new models to dropdown:
- Lucid Origin - Leonardo.AI
- Phoenix 1.0 - Leonardo.AI

**MCP update**: Updated tool definitions in `workers/src/endpoints/mcp-endpoint.ts` to include new model options in enum.
