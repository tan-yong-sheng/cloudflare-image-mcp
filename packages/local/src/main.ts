// ============================================================================
// Local Server Entry Point
// Serves REST API, MCP server, and web UI
// ============================================================================

import 'dotenv/config';
import express, { Express, Request, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

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
  parseEmbeddedParams,
  mergeParams,
  detectTask,
  getEnhancedModelList,
  getModelMetadata,
} from '@cloudflare-image-mcp/core';
import type { ServerConfig } from '@cloudflare-image-mcp/core';
import { existsSync, readFileSync } from 'fs';

// ============================================================================
// Image Fetching Utility - Supports URL, base64, and file path
// ============================================================================

type InputType = 'url' | 'base64' | 'path';

function detectInputType(input: string): InputType {
  if (input.startsWith('data:')) return 'base64';
  if (input.startsWith('http://') || input.startsWith('https://')) return 'url';
  return 'path';
}

async function fetchImage(input: string): Promise<{ buffer: Buffer; base64: string }> {
  const type = detectInputType(input);

  switch (type) {
    case 'url': {
      const response = await fetch(input);
      if (!response.ok) {
        throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return { buffer, base64: buffer.toString('base64') };
    }
    case 'base64': {
      const base64Data = input.includes(',') ? input.split(',')[1] : input;
      const buffer = Buffer.from(base64Data, 'base64');
      return { buffer, base64: base64Data };
    }
    case 'path': {
      if (!existsSync(input)) {
        throw new Error(`File not found: ${input}`);
      }
      const buffer = readFileSync(input);
      return { buffer, base64: buffer.toString('base64') };
    }
  }
}

// ============================================================================
// Two-Mode Configuration
// Mode 1: DEFAULT_MODEL set -> Skip list_models, use default directly
// Mode 2: DEFAULT_MODEL not set -> Enable enhanced list_models with selection guide
// ============================================================================

const defaultModelRaw = process.env.DEFAULT_MODEL || '';

// Validate DEFAULT_MODEL if provided
if (defaultModelRaw) {
  const validModelIds = listModels().map(m => m.id);
  if (!validModelIds.includes(defaultModelRaw)) {
    console.error(`Error: DEFAULT_MODEL must be a valid full model_id.`);
    console.error(`Provided: ${defaultModelRaw}`);
    console.error(`Valid model_ids: ${validModelIds.join(', ')}`);
    process.exit(1);
  }
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
  // Only set defaultModel if DEFAULT_MODEL env var is provided
  // This enables two-mode workflow in stdio MCP server
  defaultModel: defaultModelRaw,
  // Timezone for logging and folder creation (default: UTC)
  timezone: process.env.TZ || 'UTC',
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

// API Key Authentication Middleware
const API_KEYS = process.env.API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || [];
const AUTH_ENABLED = API_KEYS.length > 0;

if (AUTH_ENABLED) {
  console.log(`🔐 API Key authentication enabled (${API_KEYS.length} keys)`);
}

function requiresAuth(path: string): boolean {
  // Public endpoints that don't require authentication
  const publicPaths = ['/health', '/api', '/api/internal/models'];
  if (publicPaths.includes(path)) return false;
  if (path.startsWith('/images/')) return false; // Images are public
  if (path === '/' || path === '/index.html') return false; // Frontend is public
  return true;
}

app.use((req: Request, res: Response, next) => {
  if (!AUTH_ENABLED) return next();
  if (!requiresAuth(req.path)) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization header' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid Authorization format. Expected: Bearer <api-key>' });
  }

  if (!API_KEYS.includes(token)) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
  }

  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    authEnabled: AUTH_ENABLED,
  });
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
      // Determine mode for HTTP MCP as well
      const hasDefaultModel = !!config.defaultModel;

      // Mode 1: Only run_models (model_id is optional, defaults to DEFAULT_MODEL)
      // Mode 2: list_models, describe_model, run_models (model_id is required)
      const mode1Tools = [
        {
          name: 'run_models',
          description: `Generate images using the default model (${config.defaultModel}). Uses optimal parameters automatically. Required: prompt. Optional: task, image, mask, params object with steps/seed/guidance/etc.`,
          inputSchema: {
            type: 'object' as const,
            properties: {
              model_id: {
                type: 'string',
                description: `Optional - defaults to "${config.defaultModel}"`,
              },
              prompt: {
                type: 'string',
                description: 'Text description of the image to generate. Supports embedded params: "prompt ---steps=8 --seed=1234"',
              },
              task: {
                type: 'string',
                enum: ['text-to-image', 'image-to-image', 'inpainting'],
                description: 'Task type. Auto-detected if not specified.',
              },
              n: { type: 'number', description: 'Number of images (1-8)', minimum: 1, maximum: 8 },
              size: { type: 'string', description: 'Image size (e.g., 1024x1024)' },
              image: {
                type: 'string',
                description: 'Input image for img2img/inpainting: URL, base64 data URI, or local file path.',
              },
              mask: {
                type: 'string',
                description: 'Mask for inpainting: URL, base64 data URI, or file path.',
              },
              params: {
                type: 'object',
                description: 'Task-specific parameters (steps, seed, guidance, negative_prompt, strength)',
                properties: {
                  steps: { type: 'number', description: 'Number of diffusion steps' },
                  seed: { type: 'number', description: 'Random seed' },
                  guidance: { type: 'number', description: 'Guidance scale (1-30)' },
                  negative_prompt: { type: 'string', description: 'Elements to avoid' },
                  strength: { type: 'number', description: 'Transformation strength (0-1)', minimum: 0, maximum: 1 },
                },
              },
            },
            required: ['prompt'],
          },
        },
      ];

      const mode2Tools = [
        {
          name: 'run_models',
          description: 'Execute image generation based on model capabilities. WORKFLOW: 1. Call list_models to get available models → 2. Call describe_model to understand parameters → 3. Call run_models to generate. Required: model_id (from list_models) and prompt. Optional: task (text-to-image/image-to-image/inpainting - auto-detected if not specified), image (URL/base64/path for img2img/inpainting), mask (URL/base64/path for inpainting), and other model-specific parameters.',
          inputSchema: {
            type: 'object',
            properties: {
              task: {
                type: 'string',
                enum: ['text-to-image', 'image-to-image', 'inpainting'],
                description: 'Task type. Auto-detected from model if not specified. Use this to explicitly choose task for models supporting multiple tasks.'
              },
              prompt: { type: 'string', description: 'Text description of the image to generate. Supports embedded params: "prompt ---steps=8 --seed=1234"' },
              model_id: { type: 'string', description: 'Exact model_id from list_models output (required)' },
              n: { type: 'number', description: 'Number of images to generate (1-8)', minimum: 1, maximum: 8 },
              size: { type: 'string', description: 'Image size (e.g., 1024x1024)' },
              image: {
                type: 'string',
                description: 'Input image for img2img/inpainting: URL (https://...), base64 data URI (data:image/...), or local file path.'
              },
              mask: {
                type: 'string',
                description: 'Mask for inpainting: URL, base64 data URI, or file path.'
              },
              params: {
                type: 'object',
                description: 'Task-specific parameters (steps, seed, guidance, negative_prompt, strength)',
                properties: {
                  steps: { type: 'number', description: 'Number of diffusion steps (model-dependent)' },
                  seed: { type: 'number', description: 'Random seed for reproducibility' },
                  guidance: { type: 'number', description: 'Guidance scale (1-30, model-dependent)' },
                  negative_prompt: { type: 'string', description: 'Elements to avoid in the image' },
                  strength: { type: 'number', description: 'Transformation strength for img2img (0-1)', minimum: 0, maximum: 1 },
                },
              },
            },
            required: ['model_id', 'prompt'],
          },
        },
        {
          name: 'list_models',
          description: 'List all available image generation models with their supported task types. WORKFLOW STEP 1: Call this first to discover available models, then call describe_model to understand parameters, then call run_models to generate images.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'describe_model',
          description: 'Get detailed parameter documentation for a specific model including all supported parameters, limits, and examples. WORKFLOW STEP 2: Call after list_models to understand how to use a specific model.',
          inputSchema: {
            type: 'object',
            properties: { model_id: { type: 'string', description: 'Exact model_id from list_models output' } },
            required: ['model_id'],
          },
        },
      ];

      const tools = hasDefaultModel ? mode1Tools : mode2Tools;
      res.json({ jsonrpc: '2.0', id: requestId, result: { tools } });
      return;
    }

    if (message.method === 'tools/call') {
      const { name, arguments: args } = message.params as { name: string; arguments?: Record<string, unknown> };
      const params = args || {};

      if (name === 'list_models') {
        // Mode 1: Reject list_models when DEFAULT_MODEL is set
        if (config.defaultModel) {
          res.json({
            jsonrpc: '2.0',
            id: requestId,
            error: {
              code: -32601,
              message: `list_models is not available when DEFAULT_MODEL is set (${config.defaultModel}). Use run_models(prompt="...") directly.`
            }
          });
          return;
        }
        // Use enhanced model list with rich metadata for better LLM selection
        const enhancedList = getEnhancedModelList();

        // Build summary for each model
        const modelSummaries = enhancedList.models.map((model) => ({
          id: model.id,
          name: model.name,
          description: model.description,
          tasks: model.supportedTasks,
          pricing: {
            is_free: model.pricing.isFree,
            estimated_cost_1024: model.pricing.estimatedCost1024,
          },
          performance: {
            speed: model.performance.speed,
            default_steps: model.performance.defaultSteps,
            estimated_time_seconds: model.performance.estimatedTimeSeconds,
          },
          quality: {
            photorealism: model.quality.photorealism,
            prompt_adherence: model.quality.promptAdherence,
            text_rendering: model.quality.textRendering,
          },
          best_for: model.comparison.bestFor,
        }));

        const output = {
          models: modelSummaries,
          selection_guide: enhancedList.selectionGuide,
          workflow: enhancedList.workflow,
          next_step: enhancedList.nextStep,
          quick_start: {
            fastest_free: enhancedList.selectionGuide.forSpeed.filter(
              (id) => enhancedList.models.find((m) => m.id === id)?.pricing.isFree
            ),
            best_for_photorealism_free: enhancedList.selectionGuide.forPhotorealism.filter(
              (id) => enhancedList.models.find((m) => m.id === id)?.pricing.isFree
            ),
            best_for_text: enhancedList.selectionGuide.forTextRendering,
          },
        };

        res.json({ jsonrpc: '2.0', id: requestId, result: { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] } });
        return;
      }

      if (name === 'describe_model') {
        // Mode 1: Reject describe_model when DEFAULT_MODEL is set
        if (config.defaultModel) {
          res.json({
            jsonrpc: '2.0',
            id: requestId,
            error: {
              code: -32601,
              message: `describe_model is not available when DEFAULT_MODEL is set (${config.defaultModel}). Use run_models(prompt="...") directly.`
            }
          });
          return;
        }
        // Use provided model_id or default from config
        const model_id = (params.model_id as string | undefined) || config.defaultModel;
        if (!model_id) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: 'model_id is required when DEFAULT_MODEL is not set' } });
          return;
        }
        const modelConfig = getModelConfig(model_id);
        const modelMetadata = getModelMetadata(model_id);
        if (!modelConfig) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: `Unknown model: ${model_id}` } });
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

        // Add enhanced metadata if available
        if (modelMetadata) {
          schema.pricing = modelMetadata.pricing;
          schema.performance = modelMetadata.performance;
          schema.quality = modelMetadata.quality;
          schema.best_for = modelMetadata.comparison.bestFor;
          schema.not_recommended_for = modelMetadata.comparison.notRecommendedFor;
          if (modelMetadata.comparison.higherQualityAlternative) {
            schema.higher_quality_alternative = modelMetadata.comparison.higherQualityAlternative;
          }
          if (modelMetadata.comparison.fasterAlternative) {
            schema.faster_alternative = modelMetadata.comparison.fasterAlternative;
          }
        }

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

        // Add supported tasks
        schema.supported_tasks = modelConfig.supportedTasks;

        // Build all_optional_params for next_step
        const allOptionalParams: Record<string, string> = {};

        // Add task parameter
        if (modelConfig.supportedTasks.length > 1) {
          allOptionalParams.task = `string (${modelConfig.supportedTasks.join('|')}) - task type, auto-detected if not specified`;
        }

        // Add all model parameters as optional
        for (const [key, param] of Object.entries(modelConfig.parameters)) {
          const p = param as any;
          const cfParam = p.cfParam || key;
          let paramDesc = `${p.type}`;
          if (p.default !== undefined) paramDesc += ` - default: ${p.default}`;
          if (p.min !== undefined || p.max !== undefined) {
            const min = p.min ?? 'N/A';
            const max = p.max ?? 'N/A';
            paramDesc += `, range: ${min}-${max}`;
          }
          if (key !== 'prompt') {
            allOptionalParams[cfParam] = `${paramDesc}${p.required ? ' (required)' : ' (optional)'}`;
          }
        }

        // Add common optional params
        allOptionalParams.n = 'number (1-8) - number of images, default: 1';
        allOptionalParams.size = `string - image size, see supported_sizes for valid options`;

        // Build examples for different tasks
        const examples: string[] = [];
        const baseExample = `run_models(model_id="${modelConfig.id}"`;

        if (modelConfig.supportedTasks.includes('text-to-image')) {
          examples.push(`${baseExample}, task="text-to-image", prompt="your prompt here")`);
        }
        if (modelConfig.supportedTasks.includes('image-to-image')) {
          examples.push(`${baseExample}, task="image-to-image", prompt="style description", image="URL_or_base64_or_path", strength=0.7)`);
        }
        if (modelConfig.supportedTasks.includes('inpainting')) {
          examples.push(`${baseExample}, task="inpainting", prompt="what to add", image="URL", mask="URL")`);
        }

        // Build next_step with all information
        schema.next_step = {
          tool: 'run_models',
          examples,
          all_optional_params: allOptionalParams,
          _note: 'Parameters marked as (required) must be provided, (optional) can be omitted',
        };

        res.json({ jsonrpc: '2.0', id: requestId, result: { content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }] } });
        return;
      }

      if (name === 'run_models') {
        const rawPrompt = params.prompt as string | undefined;
        if (!rawPrompt) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: 'prompt is required' } });
          return;
        }

        // Use provided model_id or default from config
        const model_id = (params.model_id as string | undefined) || config.defaultModel;
        if (!model_id) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: 'model_id is required when DEFAULT_MODEL is not set' } });
          return;
        }

        // Parse embedded params from prompt (e.g., "city ---steps=8 --seed=1234")
        const { cleanPrompt, embeddedParams } = parseEmbeddedParams(rawPrompt);

        // Get params object (task-specific parameters)
        const paramsObj = (params.params as Record<string, unknown>) || {};

        // Merge explicit params with embedded params (embedded takes precedence)
        const mergedParams = mergeParams(paramsObj, embeddedParams);

        // Detect task type
        const task = detectTask({
          task: params.task as string | undefined,
          image: params.image,
          mask: params.mask,
        });

        // Get model config and check if model supports the task
        const modelConfig = getModelConfig(model_id);
        if (!modelConfig) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: `Unknown model: ${model_id}` } });
          return;
        }

        if (!modelConfig.supportedTasks.includes(task as any)) {
          res.json({
            jsonrpc: '2.0',
            id: requestId,
            error: {
              code: -32600,
              message: `Model ${model_id} does not support "${task}". Supported tasks: ${modelConfig.supportedTasks.join(', ')}`
            }
          });
          return;
        }

        // Validate task-specific requirements
        const imageInput = params.image as string | undefined;
        const maskInput = params.mask as string | undefined;

        if (task === 'inpainting' && !maskInput) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: 'Task "inpainting" requires mask parameter' } });
          return;
        }

        if ((task === 'image-to-image' || task === 'inpainting') && !imageInput) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: `Task "${task}" requires image parameter` } });
          return;
        }

        // Fetch image(s) if provided
        let imageBase64: string | undefined;
        let maskBase64: string | undefined;

        try {
          if (imageInput) {
            const { base64 } = await fetchImage(imageInput);
            imageBase64 = base64;
          }
          if (maskInput) {
            const { base64 } = await fetchImage(maskInput);
            maskBase64 = base64;
          }
        } catch (error) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32603, message: `Failed to fetch image: ${error instanceof Error ? error.message : String(error)}` } });
          return;
        }

        const n = params.n as number | undefined;
        const size = params.size as string | undefined;
        const steps = mergedParams.steps as number | undefined;
        const seed = mergedParams.seed as number | undefined;
        const guidance = mergedParams.guidance as number | undefined;
        const negative_prompt = mergedParams.negative_prompt as string | undefined;
        const strength = mergedParams.strength as number | undefined;

        const result = await aiClient.generateImage(model_id, {
          prompt: cleanPrompt,
          n: Math.min(Math.max(n || 1, 1), 8),
          steps,
          seed,
          guidance,
          negative_prompt,
          width: size ? parseInt(size.split('x')[0]) : undefined,
          height: size ? parseInt(size.split('x')[1]) : undefined,
          image: imageBase64,
          mask: maskBase64,
          strength,
        });

        if (!result.success) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32603, message: result.error } });
          return;
        }

        const uploadResult = await storage.uploadImage(result.data!, { model: model_id, prompt: cleanPrompt, size: size || '' });
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

// Check for stdio mode
if (process.argv.includes('--stdio')) {
  // Run as stdio MCP server
  const { createStdioMCPServer } = await import('./mcp/stdio.js');
  await createStdioMCPServer(config, aiClient, storage);
} else {
  app.listen(PORT, () => {
    console.log(`\nCloudflare Image MCP - Local Server v0.1.0`);
    console.log(`Server:  http://localhost:${PORT}`);
    console.log(`API:     http://localhost:${PORT}/v1/images/generations`);
    console.log(`MCP:     http://localhost:${PORT}/mcp`);
    console.log(`\nPress Ctrl+C to stop\n`);
  });
}
