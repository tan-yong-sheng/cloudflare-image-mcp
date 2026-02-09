// ============================================================================
// Stdio MCP Server - Two-Mode Workflow Implementation
// ============================================================================
// Mode 1: DEFAULT_MODEL set - Skip list_models, use default directly
// Mode 2: DEFAULT_MODEL not set - Show enhanced list_models with selection guide
// ============================================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  getModelConfig,
  parseEmbeddedParams,
  mergeParams,
  detectTask,
  getEnhancedModelList,
  getModelMetadata,
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
// Tool Definitions - Dynamic based on mode
// ============================================================================

/**
 * Build tools for Mode 1: DEFAULT_MODEL is set
 * Only expose describe_model and run_models
 */
function buildMode1Tools(defaultModel: string) {
  return [
    {
      name: 'describe_model',
      description: `Get detailed OpenAPI schema for the default model (${defaultModel}). Returns parameters, types, defaults, limits. WORKFLOW: Step 1 - call this first to understand parameters, then call run_models to generate.`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          model_id: {
            type: 'string',
            description: `Optional - defaults to "${defaultModel}"`,
          },
        },
      },
    },
    {
      name: 'run_models',
      description: `Generate images using the default model (${defaultModel}). WORKFLOW: Step 2 - after describe_model, call this with prompt and optional parameters. Supports params object for task-specific settings and embedded params via "---" delimiter (e.g., prompt="city ---steps=8 --seed=1234").`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          model_id: {
            type: 'string',
            description: `Optional - defaults to "${defaultModel}"`,
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
              steps: { type: 'number', description: 'Diffusion steps' },
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
}

/**
 * Build tools for Mode 2: DEFAULT_MODEL is NOT set
 * Expose list_models (enhanced), describe_model, run_models
 */
function buildMode2Tools() {
  return [
    {
      name: 'list_models',
      description: 'List all available image generation models with enhanced metadata including pricing, performance, quality scores, and selection guide. WORKFLOW: This is step 1 - review models and selection_guide, then call describe_model for parameter details, then run_models to generate.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'describe_model',
      description: 'Get detailed OpenAPI schema for a specific model. Call "list_models" first to get model_id. Returns parameters, types, defaults, limits, and workflow guidance. WORKFLOW: Step 2 - after list_models, call this with model_id to understand parameters.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          model_id: {
            type: 'string',
            description: 'Exact model_id from list_models output (e.g., @cf/black-forest-labs/flux-1-schnell)',
          },
        },
        required: ['model_id'],
      },
    },
    {
      name: 'run_models',
      description: 'Generate images using Cloudflare AI. WORKFLOW: Step 3 - after describe_model, call this with model_id, prompt, and optional parameters. Supports params object for task-specific settings and embedded params via "---" delimiter (e.g., prompt="city ---steps=8 --seed=1234").',
      inputSchema: {
        type: 'object' as const,
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
              steps: { type: 'number', description: 'Diffusion steps' },
              seed: { type: 'number', description: 'Random seed' },
              guidance: { type: 'number', description: 'Guidance scale (1-30)' },
              negative_prompt: { type: 'string', description: 'Elements to avoid' },
              strength: { type: 'number', description: 'Transformation strength (0-1)', minimum: 0, maximum: 1 },
            },
          },
        },
        required: ['prompt', 'model_id'],
      },
    },
  ];
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Handle list_models tool call - Mode 2 only
 */
async function handleListModels(): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
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

  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
  };
}

/**
 * Handle describe_model tool call
 */
async function handleDescribeModel(
  params: Record<string, unknown>,
  defaultModel?: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Use provided model_id or default
  const model_id = (params.model_id as string) || defaultModel;

  if (!model_id) {
    throw new Error('model_id is required when DEFAULT_MODEL is not set');
  }

  const modelConfig = getModelConfig(model_id);
  const modelMetadata = getModelMetadata(model_id);

  if (!modelConfig) {
    throw new Error(`Unknown model: ${model_id}`);
  }

  // Build OpenAPI schema format
  const schema: any = {
    model_id: modelConfig.id,
    name: modelConfig.name,
    description: modelConfig.description,
    provider: modelConfig.provider,
  };

  // Add metadata if available
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

  // Add parameters
  schema.parameters = {};
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

  // Build examples for optional params
  const examples: Record<string, string> = {};
  for (const [key, param] of Object.entries(modelConfig.parameters)) {
    const p = param as any;
    if (key !== 'prompt' && !p.required) {
      const cfParam = p.cfParam || key;
      examples[cfParam] = p.description || cfParam;
    }
  }

  schema.next_step = {
    tool: 'run_models',
    examples: examples,
    note: `Call run_models with model_id="${model_id}", prompt="your description here", and any optional parameters from above`,
  };

  schema.workflow = defaultModel
    ? {
        step1: 'describe_model() - you are here: Review parameters above',
        step2: 'run_models(prompt="...") - Generate image with your prompt',
      }
    : {
        step1: 'list_models() - Review available models',
        step2: 'describe_model(model_id="...") - you are here: Review parameters above',
        step3: 'run_models(model_id="...", prompt="...") - Generate image',
      };

  return { content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }] };
}

/**
 * Handle run_models tool call
 */
async function handleRunModels(
  params: Record<string, unknown>,
  aiClient: AIClient,
  storage: StorageProvider,
  defaultModel?: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const rawPrompt = params.prompt as string | undefined;
  if (!rawPrompt) {
    throw new Error('prompt is required');
  }

  // Use provided model_id or default
  const model_id = (params.model_id as string) || defaultModel;
  if (!model_id) {
    throw new Error('model_id is required when DEFAULT_MODEL is not set');
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
    throw new Error(
      `Model ${model_id} does not support "${task}". Supported: ${modelConfig.supportedTasks.join(', ')}`
    );
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
    throw new Error(
      `Failed to fetch image: ${error instanceof Error ? error.message : String(error)}`
    );
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

// ============================================================================
// Create and run the stdio MCP server
// ============================================================================

export async function createStdioMCPServer(
  config: ServerConfig,
  aiClient: AIClient,
  storage: StorageProvider
): Promise<void> {
  // Determine mode based on DEFAULT_MODEL
  const defaultModel = config.defaultModel;
  const isMode1 = !!defaultModel;

  // Create MCP server instance
  const server = new Server(
    {
      name: 'cloudflare-image-mcp',
      version: '0.1.0',
      // Add mode info to server metadata
    },
    { capabilities: { tools: {} } }
  );

  // Register tools handler - dynamic based on mode
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = isMode1
      ? buildMode1Tools(defaultModel!)
      : buildMode2Tools();

    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = args || {};

    switch (name) {
      case 'list_models':
        // Only available in Mode 2
        if (isMode1) {
          throw new Error(
            `list_models is not available when DEFAULT_MODEL is set. ` +
              `Use describe_model() to see parameters for the default model (${defaultModel}), ` +
              `or remove DEFAULT_MODEL to enable model selection.`
          );
        }
        return handleListModels();

      case 'describe_model':
        return handleDescribeModel(params, defaultModel);

      case 'run_models':
        return handleRunModels(params, aiClient, storage, defaultModel);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  // Log mode info to stderr (not stdout, which is used for MCP communication)
  console.error(
    `MCP stdio server running in ${isMode1 ? 'MODE 1 (Default Model)' : 'MODE 2 (Model Selection)'}...`
  );
  if (isMode1) {
    console.error(`Default model: ${defaultModel}`);
    console.error(`Available tools: describe_model, run_models`);
  } else {
    console.error(`Available tools: list_models, describe_model, run_models`);
  }

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
