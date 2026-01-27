// ============================================================================
// Stdio MCP Server - Using Server API (MCP SDK 0.5.0)
// ============================================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  listModels,
  getModelConfig,
  type AIClient,
  type StorageProvider,
  type ServerConfig,
} from '@cloudflare-image-mcp/core';

// ============================================================================
// Create and run the stdio MCP server
// ============================================================================

export async function createStdioMCPServer(
  config: ServerConfig,
  aiClient: AIClient,
  storage: StorageProvider
): Promise<void> {
  // Create MCP server instance
  const server = new Server(
    { name: 'cloudflare-image-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  // Register tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'list_models',
          description: 'List all available image generation models',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'describe_model',
          description: 'Get documentation for a specific model',
          inputSchema: {
            type: 'object',
            properties: {
              model: {
                type: 'string',
                description: 'Model ID or alias',
              },
            },
            required: ['model'],
          },
        },
        {
          name: 'generate_image',
          description: 'Generate images using Cloudflare Workers AI',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'Image description',
              },
              model: {
                type: 'string',
                description: 'Model ID or alias',
              },
              n: {
                type: 'number',
                description: 'Number of images (1-8)',
              },
              size: {
                type: 'string',
                description: 'Image size (e.g., 1024x1024)',
              },
              steps: {
                type: 'number',
                description: 'Diffusion steps',
              },
              seed: {
                type: 'number',
                description: 'Random seed',
              },
            },
            required: ['prompt'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = args || {};

    if (name === 'list_models') {
      const models = listModels();
      let text = 'Available Models:\n\n';
      for (const model of models) {
        text += `- **${model.name}** (${model.id})\n`;
      }
      return { content: [{ type: 'text', text }] };
    }

    if (name === 'describe_model') {
      const model = params.model as string | undefined;
      const modelConfig = model ? getModelConfig(model) : null;
      if (!modelConfig) {
        throw new Error(`Unknown model: ${model}`);
      }
      let text = `# ${modelConfig.name}\n\n${modelConfig.description}\n\n`;
      text += `**Provider:** ${modelConfig.provider}\n`;
      return { content: [{ type: 'text', text }] };
    }

    if (name === 'generate_image') {
      const prompt = params.prompt as string | undefined;
      if (!prompt) {
        throw new Error('prompt is required');
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
        throw new Error(result.error || 'Generation failed');
      }

      const uploadResult = await storage.uploadImage(result.data!, {
        model,
        prompt,
        size: size || '',
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      return {
        content: [{ type: 'text', text: `![Generated Image](${uploadResult.url})` }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  console.log('MCP stdio server running...');

  // Keep the process alive
  await new Promise<void>((resolve) => {
    process.on('SIGINT', async () => {
      await server.close();
      resolve();
    });
    process.on('SIGTERM', async () => {
      await server.close();
      resolve();
    });
  });
}
