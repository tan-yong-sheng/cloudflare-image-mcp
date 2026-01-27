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
          description: 'List all available image generation models. Returns JSON object mapping model_id to supported task types.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'describe_model',
          description: 'You must call "list_models" first to obtain the exact model_id required to use this tool, UNLESS the user explicitly provides a model_id in the format "@cf/black-forest-labs/flux-1-schnell". Returns detailed OpenAPI schema documentation for a specific model including all parameters with type, min, max, default values.',
          inputSchema: {
            type: 'object',
            properties: {
              model_id: {
                type: 'string',
                description: 'Exact model_id from list_models output',
              },
            },
            required: ['model_id'],
          },
        },
        {
          name: 'run_models',
          description: 'You must call "list_models" first to obtain the exact model_id required to use this tool, UNLESS the user explicitly provides a model_id in the format "@cf/black-forest-labs/flux-1-schnell". You must call "describe_model" first to obtain the params required to use this tool, UNLESS the user explicitly provides params.',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'Image description',
              },
              model_id: {
                type: 'string',
                description: 'Exact model_id from list_models output (e.g., @cf/black-forest-labs/flux-1-schnell)',
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
              guidance: {
                type: 'number',
                description: 'Guidance scale (1-30)',
              },
              negative_prompt: {
                type: 'string',
                description: 'Elements to avoid in the image',
              },
            },
            required: ['prompt', 'model_id'],
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
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
    }

    if (name === 'describe_model') {
      const model_id = params.model_id as string | undefined;
      const modelConfig = model_id ? getModelConfig(model_id) : null;
      if (!modelConfig) {
        throw new Error(`Unknown model: ${model_id}`);
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
        if (p.required && key !== 'prompt') {
          const cfParam = p.cfParam || key;
          paramStrings.push(`${cfParam}=value`);
        }
      }
      const paramsStr = paramStrings.join(' ');
      const paramsPart = paramsStr ? ' ' + paramsStr : '';
      const nextStep = `call run_models(model_id="${modelConfig.id}"${paramsPart} prompt="your prompt here")`;
      schema.next_step = nextStep;
      return { content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }] };
    }

    if (name === 'run_models') {
      const prompt = params.prompt as string | undefined;
      if (!prompt) {
        throw new Error('prompt is required');
      }

      const model_id = params.model_id as string | undefined;
      if (!model_id) {
        throw new Error('model_id is required');
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
        throw new Error(result.error || 'Generation failed');
      }

      const uploadResult = await storage.uploadImage(result.data!, {
        model: model_id,
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
