// ============================================================================
// HTTP MCP Server Endpoint
// Implements streamable MCP protocol over HTTP
// ============================================================================

import type { Env } from '../types.js';
import { ImageGeneratorService } from '../services/image-generator.js';

export class MCPEndpoint {
  private generator: ImageGeneratorService;
  private corsHeaders: Record<string, string>;
  private cdnUrl: string;

  constructor(env: Env) {
    this.generator = new ImageGeneratorService(env);
    this.cdnUrl = env.CDN_URL || '';
    this.corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Transport',
    };
  }

  /**
   * Handle MCP request
   */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: this.corsHeaders });
    }

    // GET /mcp - Return endpoint info (for human-readable API discovery)
    if (request.method === 'GET' && pathname === '/mcp') {
      return this.handleInfo();
    }

    // GET for SSE transport connection (?transport=sse)
    if (request.method === 'GET' && url.searchParams.get('transport') === 'sse') {
      return this.handleSSE(request);
    }

    // POST for MCP messages (handles both /mcp and /mcp/message for Streamable HTTP)
    if (request.method === 'POST' && (pathname === '/mcp' || pathname === '/mcp/message')) {
      return this.handleMessage(request);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * Handle info request for /mcp endpoint
   */
  private handleInfo(): Response {
    const info = {
      name: 'cloudflare-image-mcp',
      version: '0.1.0',
      protocol: 'MCP',
      transport: 'streamable-http',
      endpoints: {
        message: '/mcp/message',
        sse: '/mcp?transport=sse',
      },
      tools: ['run_models', 'list_models', 'describe_model'],
      description: 'Image generation using Cloudflare Workers AI',
    };

    return new Response(JSON.stringify(info, null, 2), {
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * Handle SSE transport connection
   */
  private async handleSSE(request: Request): Promise<Response> {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection message
        const data = JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      },
    });

    return new Response(stream, {
      headers: {
        ...this.corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  /**
   * Handle MCP JSON-RPC message
   */
  private async handleMessage(request: Request): Promise<Response> {
    try {
      const message: { id?: string | number; method?: string } = await request.json();

      // Handle different message types
      if (message.method === 'initialize') {
        return this.handleInitialize(message);
      }

      if (message.method === 'notifications/listChanged') {
        return this.handleListChanged(message);
      }

      if (message.method === 'tools/list') {
        return this.handleListTools(message);
      }

      if (message.method === 'tools/call') {
        return this.handleCallTool(message);
      }

      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: { code: -32600, message: 'Unknown method' },
      }), {
        status: 200,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid JSON' },
      }), {
        status: 200,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(message: any): Response {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'cloudflare-image-mcp',
          version: '0.1.0',
        },
      },
    }), {
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * Handle notifications/listChanged
   */
  private handleListChanged(message: any): Response {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: null,
    }), {
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * Handle tools/list request
   */
  private handleListTools(message: any): Response {
    const tools = this.getToolDefinitions();

    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: { tools },
    }), {
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * Handle tools/call request
   */
  private async handleCallTool(message: any): Promise<Response> {
    const { name, arguments: args } = message.params || {};

    try {
      let result;

      if (name === 'run_models') {
        result = await this.handleRunModels(args);
      } else if (name === 'list_models') {
        result = await this.handleListModels(args);
      } else if (name === 'describe_model') {
        result = await this.handleDescribeModel(args);
      } else {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `Unknown tool: ${name}` },
        }), {
          status: 200,
          headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        result: { content: result },
      }), {
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32603, message: errorMessage },
      }), {
        status: 200,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Handle run_models tool call
   */
  private async handleRunModels(args: any): Promise<any[]> {
    const {
      prompt,
      model_id,
      n,
      size,
      steps,
      seed,
      guidance,
      negative_prompt,
    } = args || {};

    if (!prompt) {
      return [{
        type: 'text',
        text: 'Error: prompt is required',
        isError: true,
      }];
    }

    if (!model_id) {
      return [{
        type: 'text',
        text: 'Error: model_id is required. Use list_models to get available model_ids.',
        isError: true,
      }];
    }

    // Validate model_id exists
    const modelConfig = this.generator.getModelConfig(model_id);
    if (!modelConfig) {
      return [{
        type: 'text',
        text: `Error: Unknown model_id: ${model_id}. Use list_models to get valid model_ids.`,
        isError: true,
      }];
    }

    const numImages = n || 1;

    const result = await this.generator.generateImages(
      model_id,
      prompt,
      Math.min(numImages, 8),
      {
        size,
        steps,
        seed,
        guidance,
        negative_prompt,
      }
    );

    if (!result.success) {
      return [{
        type: 'text',
        text: `Error: ${result.error}`,
        isError: true,
      }];
    }

    // Format response with full CDN URL
    const textParts: string[] = [];
    const fullUrl = (path: string) => path.startsWith('http') ? path : `${this.cdnUrl}${path}`;

    if (result.images.length === 1) {
      textParts.push(`Image generated successfully!\n`);
      textParts.push(`![Generated Image](${fullUrl(result.images[0].url)})`);
    } else {
      textParts.push(`Generated ${result.images.length} images:\n\n`);
      result.images.forEach((img, i) => {
        textParts.push(`Image ${i + 1}: ![Generated Image ${i + 1}](${fullUrl(img.url)})\n`);
      });
    }

    return [{
      type: 'text',
      text: textParts.join('\n'),
    }];
  }

  /**
   * Handle list_models tool call
   */
  private async handleListModels(_args: any): Promise<any[]> {
    const models = this.generator.listModels();

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

    return [{
      type: 'text',
      text: JSON.stringify(output, null, 2),
    }];
  }

  /**
   * Handle describe_model tool call
   */
  private async handleDescribeModel(args: any): Promise<any[]> {
    const { model_id } = args || {};

    if (!model_id) {
      return [{
        type: 'text',
        text: 'Error: model_id parameter is required',
        isError: true,
      }];
    }

    const modelConfig = this.generator.getModelConfig(model_id);
    if (!modelConfig) {
      return [{
        type: 'text',
        text: `Error: Unknown model_id: ${model_id}`,
        isError: true,
      }];
    }

    // Build OpenAPI schema format
    const schema: any = {
      model_id: modelConfig.id,
      name: modelConfig.name,
      description: modelConfig.description,
      provider: modelConfig.provider,
      input_format: modelConfig.inputFormat,
      response_format: modelConfig.responseFormat,
      supported_tasks: modelConfig.supportedTasks,
      parameters: {},
    };

    for (const [key, param] of Object.entries(modelConfig.parameters)) {
      const cfParam = (param as any).cfParam;
      schema.parameters[key] = {
        type: (param as any).type,
        cf_param: cfParam,
        description: (param as any).description || `Parameter: ${key}`,
      };

      if ((param as any).required) {
        schema.parameters[key].required = true;
      }
      if ((param as any).default !== undefined) {
        schema.parameters[key].default = (param as any).default;
      }
      if ((param as any).min !== undefined) {
        schema.parameters[key].minimum = (param as any).min;
      }
      if ((param as any).max !== undefined) {
        schema.parameters[key].maximum = (param as any).max;
      }
      if ((param as any).step !== undefined) {
        schema.parameters[key].step = (param as any).step;
      }
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

    // Add next_step guidance
    const nextStep = `call run_models(model_id="${modelConfig.id}"${paramsStr ? ' ' + paramsStr : ''} prompt="your prompt here")`;

    // Add next_step to schema
    schema.next_step = nextStep;

    return [{
      type: 'text',
      text: JSON.stringify(schema, null, 2),
    }];
  }

  /**
   * Get tool definitions for MCP
   */
  private getToolDefinitions(): any[] {
    return [
      {
        name: 'run_models',
        description: 'You must call "list_models" first to obtain the exact model_id required to use this tool, UNLESS the user explicitly provides a model_id in the format "@cf/black-forest-labs/flux-1-schnell". You must call "describe_model" first to obtain the params required to use this tool, UNLESS the user explicitly provides params. Available model_ids: @cf/black-forest-labs/flux-1-schnell (text-to-image), @cf/black-forest-labs/flux-2-klein-4b (text-to-image, image-to-image), @cf/black-forest-labs/flux-2-dev (text-to-image, image-to-image), @cf/stabilityai/stable-diffusion-xl-base-1.0 (text-to-image, image-to-image, inpainting), @cf/bytedance/stable-diffusion-xl-lightning (text-to-image), @cf/lykon/dreamshaper-8-lcm-8-lcm (text-to-image, image-to-image), @cf/leonardo/lucid-origin (text-to-image), @cf/leonardo/phoenix-1.0 (text-to-image), @cf/runwayml/stable-diffusion-v1-5-img2img (image-to-image), @cf/runwayml/stable-diffusion-v1-5-inpainting (inpainting).',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Text description of the image to generate',
            },
            model_id: {
              type: 'string',
              description: 'Exact model_id from list_models output (e.g., @cf/black-forest-labs/flux-1-schnell)',
            },
            n: {
              type: 'number',
              description: 'Number of images to generate (1-8)',
              minimum: 1,
              maximum: 8,
            },
            size: {
              type: 'string',
              description: 'Image size (e.g., 1024x1024)',
            },
            steps: {
              type: 'number',
              description: 'Number of diffusion steps (model-dependent)',
            },
            seed: {
              type: 'number',
              description: 'Random seed for reproducibility',
            },
            guidance: {
              type: 'number',
              description: 'Guidance scale (1-30, model-dependent)',
            },
            negative_prompt: {
              type: 'string',
              description: 'Elements to avoid in the image',
            },
          },
          required: ['prompt', 'model_id'],
        },
      },
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
    ];
  }
}
