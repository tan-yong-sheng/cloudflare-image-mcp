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
  parseEmbeddedParams,
  mergeParams,
  detectTask,
  type AIClient,
  type StorageProvider,
  type ServerConfig,
} from '@cloudflare-image-mcp/core';
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
          description: 'List all available image generation models. Returns JSON object mapping model_id to supported task types. WORKFLOW: This is step 1 - call this first to get available models, then call describe_model for parameter details, then run_models to generate.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'describe_model',
          description: 'Get detailed OpenAPI schema for a specific model. Call "list_models" first to get model_id. Returns parameters, types, defaults, limits, and next_step with example run_models call. WORKFLOW: Step 2 - after list_models, call this with model_id to understand parameters.',
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
          description: 'Generate images using Cloudflare AI. WORKFLOW: Step 3 - after describe_model, call this with model_id, prompt, and optional parameters. Supports params object for task-specific settings and embedded params via "---" delimiter (e.g., prompt="city ---steps=8 --seed=1234").',
          inputSchema: {
            type: 'object',
            properties: {
              model_id: {
                type: 'string',
                description: 'Exact model_id from list_models output (e.g., @cf/black-forest-labs/flux-1-schnell)',
              },
              prompt: {
                type: 'string',
                description: 'Text description of the image to generate. Supports embedded params: "prompt ---steps=8 --seed=1234"',
              },
              task: {
                type: 'string',
                enum: ['text-to-image', 'image-to-image', 'inpainting'],
                description: 'Task type. Auto-detected if not specified based on image/mask parameters.',
              },
              n: {
                type: 'number',
                description: 'Number of images (1-8)',
                minimum: 1,
                maximum: 8,
              },
              size: {
                type: 'string',
                description: 'Image size (e.g., 1024x1024)',
              },
              image: {
                type: 'string',
                description: 'Input image for img2img/inpainting: URL (https://...), base64 data URI (data:image/...), or local file path.',
              },
              mask: {
                type: 'string',
                description: 'Mask for inpainting: URL, base64 data URI, or file path.',
              },
              params: {
                type: 'object',
                description: 'Task-specific parameters (steps, seed, guidance, negative_prompt, strength)',
                properties: {
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
                  strength: {
                    type: 'number',
                    description: 'Transformation strength for img2img (0-1). Higher = more transformation.',
                    minimum: 0,
                    maximum: 1,
                  },
                },
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
      const modelMap: Record<string, any> = {};
      for (const model of models) {
        modelMap[model.id] = {
          tasks: model.taskTypes,
          name: model.name,
          description: model.description,
        };
      }
      const output = {
        ...modelMap,
        _workflow: {
          step1: 'list_models() - you are here',
          step2: 'describe_model(model_id="<model_id>") - get parameters',
          step3: 'run_models(model_id="<model_id>", prompt="...", ...) - generate',
        },
        _next_step: 'Call describe_model(model_id="<model_id_from_above>") to get parameter details, then run_models to generate',
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
      // Build required params string for next_step (exclude prompt since it's added separately)
      const requiredParams: string[] = [];
      const optionalParams: string[] = [];
      for (const [key, param] of Object.entries(modelConfig.parameters)) {
        const p = param as any;
        const cfParam = p.cfParam || key;
        const paramStr = `${cfParam}=value`;
        if (key !== 'prompt') {
          if (p.required) {
            requiredParams.push(paramStr);
          } else {
            optionalParams.push(paramStr);
          }
        }
      }
      // Build examples for optional params
      const examples: Record<string, string> = {};
      for (const [key, param] of Object.entries(modelConfig.parameters)) {
        const p = param as any;
        if (key !== 'prompt' && !p.required) {
          const cfParam = p.cfParam || key;
          examples[cfParam] = p.description || cfParam;
        }
      }
      const requiredPart = requiredParams.join(' ');
      const optionalPart = optionalParams.join(' ');
      const allOptionalParams = optionalParams.map(p => p.split('=')[0]);
      const paramsPart = [requiredPart, optionalPart].filter(Boolean).join(' ');
      schema.next_step = {
        tool: 'run_models',
        examples: examples,
        all_optional_params: allOptionalParams,
        _note: 'Parameters marked as (required) must be provided, (optional) can be omitted',
      };
      schema._workflow = {
        step1: 'list_models() - get available models',
        step2: 'describe_model(model_id="...") - you are here',
        step3: 'run_models(model_id="...", prompt="...") - generate',
      };
      return { content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }] };
    }

    if (name === 'run_models') {
      const rawPrompt = params.prompt as string | undefined;
      if (!rawPrompt) {
        throw new Error('prompt is required');
      }

      const model_id = params.model_id as string | undefined;
      if (!model_id) {
        throw new Error('model_id is required');
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

      // Check if model supports the task
      const modelConfig = getModelConfig(model_id);
      if (!modelConfig) {
        throw new Error(`Unknown model: ${model_id}`);
      }

      if (!modelConfig.supportedTasks.includes(task as any)) {
        throw new Error(`Model ${model_id} does not support "${task}". Supported: ${modelConfig.supportedTasks.join(', ')}`);
      }

      // Validate task-specific requirements
      const imageInput = params.image as string | undefined;
      const maskInput = params.mask as string | undefined;

      if (task === 'inpainting' && !maskInput) {
        throw new Error('Task "inpainting" requires mask parameter');
      }

      if ((task === 'image-to-image' || task === 'inpainting') && !imageInput) {
        throw new Error(`Task "${task}" requires image parameter`);
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
        throw new Error(`Failed to fetch image: ${error instanceof Error ? error.message : String(error)}`);
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
        throw new Error(result.error || 'Generation failed');
      }

      const uploadResult = await storage.uploadImage(result.data!, {
        model: model_id,
        prompt: cleanPrompt,
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
