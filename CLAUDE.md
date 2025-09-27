# Cloudflare Image MCP Server - Architecture Guide

## Development Commands

```bash
# Essential development workflow
npm run check        # Type checking (tsc --noEmit)
npm run lint         # Code linting
npm run lint:fix     # Fix linting issues
npm run build        # Build to dist/
npm run dev          # Development with tsx watch
npm run clean        # Clean dist directory
```

## Architecture Overview

This codebase implements a modular MCP (Model Context Protocol) server for Cloudflare Workers AI image generation with a clean abstraction architecture:

### Core Components

1. **MCP Server Layer** (`src/server.ts`)
   - Handles MCP protocol communication
   - Exposes `generate_image` and `list_models` tools
   - Manages environment configuration and error handling

2. **Service Layer** (`src/image-service.ts`)
   - Orchestrates image generation workflow
   - Handles parameter validation and model selection
   - Manages caching and file storage

3. **Model Abstraction Layer** (`src/models/`)
   - Pluggable model implementations using BaseModel pattern
   - Each model handles its own parameter mapping and prompt enhancement
   - Centralized model registry with fallback handling

4. **Storage Layer** (`src/storage/`)
   - Factory pattern for storage providers
   - Configurable cleanup automation
   - Extensible provider system (local, future S3)

5. **Client Layer** (`src/cloudflare-client.ts`)
   - Handles Cloudflare API communication
   - Supports both JSON and binary response formats
   - Timeout and error handling

## Key Abstractions & Patterns

### BaseModel Pattern (`src/models/generation/base-model.ts`)

All AI models extend `BaseModel` which provides:
- **Parameter validation**: `isParameterSupported()` method
- **Prompt preprocessing**: Truncation and model-specific enhancement
- **Request building**: Unified payload construction with model-specific handling
- **Abstract methods**: `enhancePrompt()` and `addStepsToPayload()` for customization

**Example model implementation:**
```typescript
export class FluxSchnellModel extends BaseModel {
  readonly name = '@cf/black-forest-labs/flux-1-schnell';
  readonly config: ModelConfig = {
    maxPromptLength: 2048,
    defaultSteps: 4,
    supportsNegativePrompt: false,
    // ... other config
  };

  protected override enhancePrompt(prompt: string): string {
    return `detailed, high quality, ${prompt}`;
  }

  protected override addStepsToPayload(payload: Record<string, any>, steps: number): void {
    payload.steps = steps; // FLUX uses "steps" parameter
  }
}
```

### Storage Provider Pattern (`src/storage/`)

**StorageFactory** manages provider instances with caching:
- Singleton pattern for efficient reuse
- Configurable cleanup policies via environment variables
- Extensible for future storage backends

**LocalStorageProvider** features:
- Organized storage by date (`outputs/images/generations/YYYY-MM-DD/`)
- Automated cleanup with configurable policies
- Metadata extraction from filenames
- Statistics and listing with filtering

**Environment configuration:**
```bash
IMAGE_CLEANUP_ENABLED=true
IMAGE_CLEANUP_OLDER_THAN_DAYS=30
```

### Configuration Architecture

**Server Configuration:**
- Required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Optional: `DEFAULT_MODEL` (defaults to FLUX Schnell)

**Model Configuration:**
- Each model defines capabilities in `ModelConfig`
- Automatic parameter filtering based on model capabilities
- Graceful fallbacks and informative error messages

## Model Support Matrix

The codebase supports 6 models with varying capabilities:

| Model | Size | Guidance | Negative | img2img | Inpaint |
|-------|------|----------|----------|---------|--------|
| FLUX Schnell | ❌ | ❌ | ❌ | ❌ | ❌ |
| SDXL Base | ✅ | ✅ | ✅ | ✅ | ✅ |
| SDXL Lightning | ✅ | ✅ | ✅ | ✅ | ✅ |
| DreamShaper LCM | ✅ | ✅ | ✅ | ✅ | ✅ |
| Leonardo Phoenix | ✅ | ✅ | ✅ | ❌ | ❌ |
| Leonardo Lucid Origin | ✅ | ✅ | ❌ | ❌ | ❌ |

## Important Conventions

### File Organization
- Models in `src/models/generation/` with individual files
- Storage providers in `src/storage/providers/`
- Central type definitions in `src/types.ts`
- ES module imports with `.js` extensions

### Error Handling
- Comprehensive parameter validation
- Unsupported parameter detection and user feedback
- API timeout handling (60 seconds)
- Graceful degradation for model limitations

### Naming Patterns
- Model classes: `[Name]Model` (e.g., `FluxSchnellModel`)
- Storage methods: PascalCase for internal, camelCase for public
- Configuration: snake_case for environment variables
- File naming: `[random_id].jpg` (simplified random filename)

### Response Handling
- Supports both JSON (FLUX, Lucid Origin) and binary (SDXL) responses
- Automatic content-type detection and processing
- Base64 decoding for JSON responses
- File caching with UUID generation

## Extension Points

### Adding New Models
1. Create `src/models/generation/new-model.ts` extending `BaseModel`
2. Implement `enhancePrompt()` and `addStepsToPayload()`
3. Add to `SUPPORTED_GENERATION_MODELS` in `src/models/generation/index.ts`

### Adding Storage Providers
1. Implement `StorageProvider` interface extending `BaseStorageProvider`
2. Add to factory in `src/storage/factory.ts`
3. Update type definitions in `src/storage/types.ts`

## Build Configuration

**TypeScript:** ES2022 target with strict mode, declaration maps, and ES modules
**Output:** UMD-compatible builds in `dist/` with source maps
**Linting:** ESLint with TypeScript rules, auto-fix available

## Environment Variables

**Required:**
- `CLOUDFLARE_API_TOKEN` - API authentication
- `CLOUDFLARE_ACCOUNT_ID` - Account identifier

**Optional:**
- `DEFAULT_MODEL` - Default model selection
- `IMAGE_OUTPUT_PATH` - Custom output folder path (default: 'outputs')
- `IMAGE_CLEANUP_*` - Storage cleanup policies

The architecture emphasizes type safety, modularity, and extensibility while maintaining simplicity for common use cases.