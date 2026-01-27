// ============================================================================
// Local Server Entry Point
// Serves REST API, MCP server, and web UI
// ============================================================================

import 'dotenv/config';
import express, { Express, Request, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Static files are in packages/local/src/ui relative to project root
const uiPath = resolve(__dirname, '..', 'src', 'ui');
import { createImageAPI } from './api/server.js';
import {
  createCloudflareAIClient,
  createS3StorageProvider,
  getModelConfig,
  listModels,
} from '@cloudflare-image-mcp/core';
import type { ServerConfig } from '@cloudflare-image-mcp/core';

// Load environment variables
const defaultModelRaw = process.env.DEFAULT_MODEL || '';

// Validate that DEFAULT_MODEL must be a full model_id (not an alias)
// Full model_ids start with '@cf/'
const validModelIds = listModels().map(m => m.id);
const isValidModelId = validModelIds.includes(defaultModelRaw) || defaultModelRaw.startsWith('@cf/');

if (defaultModelRaw && !isValidModelId) {
  console.error(`Error: DEFAULT_MODEL must be a full model_id (e.g., '@cf/black-forest-labs/flux-1-schnell'), not an alias like 'flux-schnell'`);
  console.error(`Valid model_ids: ${validModelIds.join(', ')}`);
  process.exit(1);
}

const config: ServerConfig = {
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN || '',
  storage: {
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || '',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    cdnUrl: process.env.S3_CDN_URL || '',
  },
  imageExpiryHours: parseInt(process.env.IMAGE_EXPIRY_HOURS || '24', 10),
  defaultModel: defaultModelRaw || '@cf/black-forest-labs/flux-1-schnell',
};

// Validate required config
if (!config.cloudflareAccountId || !config.cloudflareApiToken) {
  console.error('Error: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required');
  process.exit(1);
}

if (!config.storage.bucket || !config.storage.endpoint) {
  console.error('Error: S3_BUCKET and S3_ENDPOINT are required');
  process.exit(1);
}

// Create services
const aiClient = createCloudflareAIClient({
  accountId: config.cloudflareAccountId,
  apiToken: config.cloudflareApiToken,
});

const storage = createS3StorageProvider({
  ...config.storage,
  expiresInDays: config.imageExpiryHours,
});

// Create Express app
const app: Express = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS headers
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

// List all models with detailed info
app.get('/api/internal/models', (_req: Request, res: Response) => {
  const models = listModels();
  res.json(models);
});

// Mount REST API
app.use('/v1', createImageAPI(config, aiClient, storage));

// API info endpoint (must be before static files)
app.get('/api', (_req: Request, res: Response) => {
  res.json({
    name: 'Cloudflare Image MCP - Local Server',
    version: '0.1.0',
    endpoints: {
      health: '/health',
      models: '/v1/models',
      generate: '/v1/images/generations',
      mcp: '/mcp',
    },
  });
});

// MCP HTTP endpoint (must be before static files)
app.get('/mcp', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(`data: ${JSON.stringify({ type: 'connection', status: 'ready' })}\n\n`);
  _req.on('close', () => res.end());
});

app.post('/mcp', async (req: Request, res: Response) => {
  const requestId = (req.body as { id?: unknown })?.id ?? null;

  try {
    const message = req.body as { method?: string; params?: Record<string, unknown> };
    console.log('MCP message:', JSON.stringify(message));

    // Handle initialize
    if (message.method === 'initialize') {
      res.json({
        jsonrpc: '2.0',
        id: requestId,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'cloudflare-image-mcp', version: '0.1.0' },
        },
      });
      return;
    }

    // Handle notifications/listChanged
    if (message.method === 'notifications/listChanged') {
      res.json({ jsonrpc: '2.0', id: requestId, result: null });
      return;
    }

    if (message.method === 'tools/list') {
      const tools = [
        {
          name: 'run_models',
          description: 'You must call "list_models" first to obtain the exact model_id required to use this tool, UNLESS the user explicitly provides a model_id in the format "@cf/black-forest-labs/flux-1-schnell". You must call "describe_model" first to obtain the params required to use this tool, UNLESS the user explicitly provides params.',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'Text description of the image to generate' },
              model_id: { type: 'string', description: 'Exact model_id from list_models output (e.g., @cf/black-forest-labs/flux-1-schnell)' },
              n: { type: 'number', description: 'Number of images to generate (1-8)', minimum: 1, maximum: 8 },
              size: { type: 'string', description: 'Image size (e.g., 1024x1024)' },
              steps: { type: 'number', description: 'Number of diffusion steps (model-dependent)' },
              seed: { type: 'number', description: 'Random seed for reproducibility' },
              guidance: { type: 'number', description: 'Guidance scale (1-30, model-dependent)' },
              negative_prompt: { type: 'string', description: 'Elements to avoid in the image' },
            },
            required: ['prompt', 'model_id'],
          },
        },
        {
          name: 'list_models',
          description: 'List all available image generation models. Returns JSON object mapping model_id to supported task types.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'describe_model',
          description: 'You must call "list_models" first to obtain the exact model_id required to use this tool, UNLESS the user explicitly provides a model_id in the format "@cf/black-forest-labs/flux-1-schnell". Returns detailed OpenAPI schema documentation for a specific model including all parameters with type, min, max, default values.',
          inputSchema: {
            type: 'object',
            properties: { model_id: { type: 'string', description: 'Exact model_id from list_models output' } },
            required: ['model_id'],
          },
        },
      ];

      res.json({ jsonrpc: '2.0', id: requestId, result: { tools } });
      return;
    }

    if (message.method === 'tools/call') {
      const { name, arguments: args } = message.params as { name: string; arguments?: Record<string, unknown> };
      const params = args || {};

      if (name === 'list_models') {
        const models = listModels();
        // Return JSON with model_id -> taskTypes mapping
        const modelMap: Record<string, string[]> = {};
        for (const model of models) {
          modelMap[model.id] = model.taskTypes;
        }
        // Add next_step guidance
        const userMentionedModel = '${user_mentioned_model_id}';
        const nextStep = `call describe_model(model_id="${userMentionedModel}")`;
        const output = {
          ...modelMap,
          next_step: nextStep,
        };
        res.json({ jsonrpc: '2.0', id: requestId, result: { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] } });
        return;
      }

      if (name === 'describe_model') {
        const model_id = params.model_id as string | undefined;
        const modelConfig = model_id ? getModelConfig(model_id) : null;
        if (!modelConfig) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: 'Unknown model' } });
          return;
        }
        // Build OpenAPI schema format
        const schema: any = {
          model_id: modelConfig.id,
          name: modelConfig.name,
          description: modelConfig.description,
          provider: modelConfig.provider,
          parameters: {},
        };
        for (const [key, param] of Object.entries(modelConfig.parameters)) {
          const p = param as any;
          schema.parameters[key] = {
            type: p.type,
            cf_param: p.cfParam,
            description: p.description || `Parameter: ${key}`,
          };
          if (p.required) schema.parameters[key].required = true;
          if (p.default !== undefined) schema.parameters[key].default = p.default;
          if (p.min !== undefined) schema.parameters[key].minimum = p.min;
          if (p.max !== undefined) schema.parameters[key].maximum = p.max;
        }
        // Add limits
        if (modelConfig.limits) {
          schema.limits = {
            max_prompt_length: modelConfig.limits.maxPromptLength,
            default_steps: modelConfig.limits.defaultSteps,
            max_steps: modelConfig.limits.maxSteps,
            min_width: modelConfig.limits.minWidth,
            max_width: modelConfig.limits.maxWidth,
            min_height: modelConfig.limits.minHeight,
            max_height: modelConfig.limits.maxHeight,
            supported_sizes: modelConfig.limits.supportedSizes,
          };
        }
        // Build params string for next_step (exclude prompt since it's added separately)
        const paramStrings: string[] = [];
        for (const [key, param] of Object.entries(modelConfig.parameters)) {
          const p = param as any;
          // Skip prompt since it's added separately at the end
          if (p.required && key !== 'prompt') {
            const cfParam = p.cfParam || key;
            paramStrings.push(`${cfParam}=value`);
          }
        }
        const paramsStr = paramStrings.join(' ');
        const paramsPart = paramsStr ? ' ' + paramsStr : '';
        const nextStep = `call run_models(model_id="${modelConfig.id}"${paramsPart} prompt="your prompt here")`;
        schema.next_step = nextStep;
        res.json({ jsonrpc: '2.0', id: requestId, result: { content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }] } });
        return;
      }

      if (name === 'run_models') {
        const prompt = params.prompt as string | undefined;
        if (!prompt) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: 'prompt is required' } });
          return;
        }

        const model_id = params.model_id as string | undefined;
        if (!model_id) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: 'model_id is required' } });
          return;
        }

        const n = params.n as number | undefined;
        const size = params.size as string | undefined;
        const steps = params.steps as number | undefined;
        const seed = params.seed as number | undefined;
        const guidance = params.guidance as number | undefined;
        const negative_prompt = params.negative_prompt as string | undefined;

        const result = await aiClient.generateImage(model_id, {
          prompt,
          n: Math.min(Math.max(n || 1, 1), 8),
          steps,
          seed,
          guidance,
          negative_prompt,
          width: size ? parseInt(size.split('x')[0]) : undefined,
          height: size ? parseInt(size.split('x')[1]) : undefined,
        });

        if (!result.success) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32603, message: result.error } });
          return;
        }

        const uploadResult = await storage.uploadImage(result.data!, { model: model_id, prompt, size: size || '' });
        if (!uploadResult.success) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32603, message: uploadResult.error } });
          return;
        }

        res.json({
          jsonrpc: '2.0',
          id: requestId,
          result: { content: [{ type: 'text', text: `![Generated Image](${uploadResult.url})` }] },
        });
        return;
      }

      res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32601, message: `Unknown tool: ${name}` } });
      return;
    }

    res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: 'Unknown method' } });
  } catch (error) {
    res.json({
      jsonrpc: '2.0',
      id: requestId,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    });
  }
});

// Web UI (serve static HTML)
app.use(express.static(uiPath));

// Serve index.html only for root path
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(resolve(uiPath, 'index.html'));
});

// Start HTTP server
const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`\nCloudflare Image MCP - Local Server v0.1.0`);
  console.log(`Server:  http://localhost:${PORT}`);
  console.log(`API:     http://localhost:${PORT}/v1/images/generations`);
  console.log(`MCP:     http://localhost:${PORT}/mcp`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
