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
  defaultModel: process.env.DEFAULT_MODEL || 'flux-schnell',
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

// Web UI (serve static HTML - must be last)
app.use(express.static(uiPath));

// Catch-all for SPA routing
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(resolve(uiPath, 'index.html'));
});

// MCP HTTP endpoint
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

    if (message.method === 'tools/list') {
      const tools = [
        {
          name: 'generate_image',
          description: 'Generate images using Cloudflare Workers AI models.',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'Text description of the image' },
              model: { type: 'string', description: 'Model ID or alias' },
              n: { type: 'number', description: 'Number of images (1-8)' },
              size: { type: 'string', description: 'Image size (e.g., 1024x1024)' },
              steps: { type: 'number', description: 'Number of diffusion steps' },
              seed: { type: 'number', description: 'Random seed' },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'list_models',
          description: 'List all available models',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'describe_model',
          description: 'Get documentation for a specific model',
          inputSchema: {
            type: 'object',
            properties: { model: { type: 'string' } },
            required: ['model'],
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
        let text = 'Available Models:\n\n';
        for (const model of models) {
          text += `- **${model.name}** (${model.id})\n`;
        }
        res.json({ jsonrpc: '2.0', id: requestId, result: { content: [{ type: 'text', text }] } });
        return;
      }

      if (name === 'describe_model') {
        const model = params.model as string | undefined;
        const modelConfig = model ? getModelConfig(model) : null;
        if (!modelConfig) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: 'Unknown model' } });
          return;
        }
        let text = `# ${modelConfig.name}\n\n${modelConfig.description}\n\n`;
        text += `**Provider:** ${modelConfig.provider}\n\n`;
        res.json({ jsonrpc: '2.0', id: requestId, result: { content: [{ type: 'text', text }] } });
        return;
      }

      if (name === 'generate_image') {
        const prompt = params.prompt as string | undefined;
        if (!prompt) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32600, message: 'prompt is required' } });
          return;
        }

        const model = (params.model as string) || config.defaultModel;
        const n = params.n as number | undefined;
        const size = params.size as string | undefined;
        const steps = params.steps as number | undefined;
        const seed = params.seed as number | undefined;

        const result = await aiClient.generateImage(model, {
          prompt,
          n: Math.min(Math.max(n || 1, 1), 8),
          steps,
          seed,
          width: size ? parseInt(size.split('x')[0]) : undefined,
          height: size ? parseInt(size.split('x')[1]) : undefined,
        });

        if (!result.success) {
          res.json({ jsonrpc: '2.0', id: requestId, error: { code: -32603, message: result.error } });
          return;
        }

        const uploadResult = await storage.uploadImage(result.data!, { model, prompt, size: size || '' });
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

// Start HTTP server
const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`\nCloudflare Image MCP - Local Server v0.1.0`);
  console.log(`Server:  http://localhost:${PORT}`);
  console.log(`API:     http://localhost:${PORT}/v1/images/generations`);
  console.log(`MCP:     http://localhost:${PORT}/mcp`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
