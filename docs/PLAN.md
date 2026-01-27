# Implementation Plan

This document details the step-by-step refactoring plan to create a modular, maintainable project structure.

## Phase 1: Create packages/core/ (Shared Library)

### Step 1.1: Create package structure

```
packages/core/
├── src/
│   ├── types.ts              # Unified TypeScript interfaces
│   ├── models/
│   │   ├── index.ts          # Model registry, aliases, helpers
│   │   └── configs.ts        # All model configurations
│   ├── ai/
│   │   └── client.ts         # AI client abstraction
│   └── storage/
│       ├── index.ts          # Storage interface
│       └── s3.ts             # S3/R2 provider
├── test/
│   └── *.test.ts
├── package.json
├── tsconfig.json
└── tsconfig.test.json
```

### Step 1.2: Define types (packages/core/src/types.ts)

```typescript
export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  provider: string;
  apiVersion: number;
  inputFormat: 'json' | 'multipart';
  responseFormat: 'base64' | 'binary';
  supportedTasks: string[];
  parameters: Record<string, ParameterConfig>;
  limits: ModelLimits;
}

export interface ParameterConfig {
  cfParam: string;
  type: 'string' | 'integer' | 'number' | 'boolean';
  default?: any;
  min?: number;
  max?: number;
  step?: number;
}

export interface ModelLimits {
  maxPromptLength: number;
  defaultSteps: number;
  maxSteps: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  supportedSizes: string[];
}

export interface StorageConfig {
  bucket: string;
  region: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  cdnUrl: string;
}

export interface ImageGenerationParams {
  prompt: string;
  n?: number;
  size?: string;
  steps?: number;
  seed?: number;
  guidance?: number;
  negative_prompt?: string;
  image?: string;
  mask?: string;
  strength?: number;
}

export interface StorageResult {
  success: boolean;
  url?: string;
  id?: string;
  error?: string;
}
```

### Step 1.3: Create model configs (packages/core/src/models/configs.ts)

Move all models from:
- `workers/src/config/models.ts`
- `mcp/src/models/generation/*.ts`

Unified into single source of truth.

### Step 1.4: Create AI client (packages/core/src/ai/client.ts)

```typescript
export interface AIClient {
  generateImage(
    modelId: string,
    params: ImageGenerationParams
  ): Promise<{ success: boolean; data?: string; error?: string }>;
}

export function createAIClient(config: {
  accountId: string;
  apiToken: string;
}): AIClient;
```

### Step 1.5: Create storage abstraction (packages/core/src/storage/s3.ts)

```typescript
export interface StorageProvider {
  uploadImage(
    base64Data: string,
    metadata: Record<string, string>
  ): Promise<StorageResult>;

  deleteImage(id: string): Promise<boolean>;
  cleanupExpired(): Promise<number>;
  listImages(prefix?: string): Promise<string[]>;
}

export function createStorage(config: StorageConfig): StorageProvider;
```

### Step 1.6: Create package.json

```json
{
  "name": "@cloudflare-image-mcp/core",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./models": "./dist/models/index.js",
    "./storage": "./dist/storage/index.js"
  }
}
```

---

## Phase 2: Create packages/local/ (Local Deployment)

### Step 2.1: Create package structure

```
packages/local/
├── src/
│   ├── main.ts                # Entry point
│   ├── mcp/
│   │   ├── stdio.ts           # Stdio MCP transport
│   │   └── http.ts            # HTTP MCP endpoint
│   ├── api/
│   │   └── server.ts          # OpenAI-compatible REST API
│   └── ui/                    # Web frontend
│       └── index.html
├── Dockerfile
├── package.json
└── tsconfig.json
```

### Step 2.2: Create main entry point (src/main.ts)

```typescript
import express from 'express';
import { createStdioMCPServer } from './mcp/stdio.js';
import { createHTTPServer } from '@modelcontextprotocol/sdk/server/http.js';
import { createOpenAIAPI } from './api/server.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// OpenAI-compatible REST API
app.use('/v1', createOpenAIAPI());

// Web UI
app.use('/', express.static('dist/ui'));

// HTTP MCP
const mcpServer = createHTTPServer(/* ... */);
app.use('/mcp', mcpServer);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`OpenAI API: http://localhost:${PORT}/v1/images/generations`);
  console.log(`Web UI: http://localhost:${PORT}/`);
});
```

### Step 2.3: Create stdio MCP (src/mcp/stdio.ts)

Uses `@modelcontextprotocol/sdk` for stdio transport.

### Step 2.4: Create REST API (src/api/server.ts)

OpenAI-compatible endpoints:
- `POST /v1/images/generations`
- `GET /v1/models`

### Step 2.5: Create Web UI (src/ui/index.html)

Copy from `workers/src/endpoints/frontend.ts`

### Step 2.6: Create Dockerfile

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY dist ./dist
COPY package*.json ./
RUN npm ci --only=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### Step 2.7: Create package.json

```json
{
  "name": "@cloudflare-image-mcp/local",
  "version": "0.1.0",
  "main": "dist/main.js",
  "bin": {
    "cloudflare-image-local": "dist/main.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/main.ts",
    "start": "node dist/main.js"
  }
}
```

---

## Phase 3: Refactor packages/workers/ (Cloudflare Workers)

### Step 3.1: Update workers to use core

```typescript
import { MODEL_CONFIGS } from '@cloudflare-image-mcp/core/models';
import { createAIClient } from '@cloudflare-image-mcp/core/ai';
```

### Step 3.2: Keep workers-specific code

- `src/index.ts` - Worker entry point
- `src/mcp/http.ts` - HTTP MCP transport for Workers
- `wrangler.toml` - Cloudflare configuration

### Step 3.3: Update package.json

```json
{
  "name": "@cloudflare-image-mcp/workers",
  "version": "0.1.0",
  "scripts": {
    "build": "esbuild src/index.ts --bundle --outfile=dist/index.js --format=esm --loader:.html=text",
    "dev": "wrangler dev --remote",
    "deploy": "wrangler deploy"
  }
}
```

---

## Phase 4: Update root package.json

```json
{
  "name": "cloudflare-image-mcp",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "clean": "rm -rf packages/*/dist"
  }
}
```

---

## Migration Steps (In Order)

1. **Create packages/core/**
   - [ ] Define TypeScript types
   - [ ] Create model configurations
   - [ ] Implement AI client abstraction
   - [ ] Implement storage abstraction
   - [ ] Write unit tests

2. **Create packages/local/**
   - [ ] Set up package structure
   - [ ] Implement main entry point
   - [ ] Create stdio MCP transport
   - [ ] Create REST API server
   - [ ] Copy web UI
   - [ ] Create Dockerfile
   - [ ] Test locally

3. **Refactor packages/workers/**
   - [ ] Update to use @cloudflare-image-mcp/core
   - [ ] Remove duplicated code
   - [ ] Test with wrangler dev

4. **Cleanup old mcp/ folder**
   - [ ] Migrate npm package to packages/local
   - [ ] Update npm registry
   - [ ] Remove old mcp/ folder

---

## Verification Checklist

- [ ] `packages/core/` builds successfully
- [ ] `packages/local/` builds successfully
- [ ] `packages/workers/` builds successfully
- [ ] All tests pass
- [ ] Local server runs on port 3000
- [ ] Local MCP server works with Claude Desktop
- [ ] Workers dev server runs
- [ ] Frontend loads correctly
- [ ] API generates images
- [ ] Docker image builds and runs
