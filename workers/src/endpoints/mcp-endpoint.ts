// ============================================================================
// HTTP MCP Server Endpoint
// Implements streamable MCP protocol over HTTP
// ============================================================================

import type { Env } from '../types.js';
import { ImageGeneratorService } from '../services/image-generator.js';

export class MCPEndpoint {
  private generator: ImageGeneratorService;
  private corsHeaders: Record<string, string>;

  // Per-request mode (derived from path)
  // - smart/multi: list_models, describe_model, run_model
  // - simple/single: run_model only (model comes from ?model=...)
  private mode: 'multi-model' | 'single-model';
  private defaultModel: string | null;
  private isMode1: boolean;

  private workerBaseUrl: string; // Store worker's base URL

  constructor(env: Env) {
    this.generator = new ImageGeneratorService(env);
    this.workerBaseUrl = ''; // Will be set from first request


    // Default request mode is multi-model; request path can switch this.
    this.mode = 'multi-model';
    this.defaultModel = null;
    this.isMode1 = false;

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

    // Capture worker's base URL from first request (for constructing full image URLs)
    if (!this.workerBaseUrl) {
      this.workerBaseUrl = `${url.protocol}//${url.host}`;
    }

    // Derive mode from path
    // - /mcp (default) and /mcp/smart => multi-model
    // - /mcp/simple => single-model (run_model only; model is required via ?model=)
    if (pathname === '/mcp/simple' || pathname === '/mcp/simple/message') {
      this.mode = 'single-model';
      const modelFromQuery = url.searchParams.get('model');
      this.defaultModel = modelFromQuery;
      this.isMode1 = true;
    } else {
      this.mode = 'multi-model';
      this.defaultModel = null;
      this.isMode1 = false;
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: this.corsHeaders });
    }

    // GET /mcp* - Return endpoint info (for human-readable API discovery)
    if (request.method === 'GET' && (pathname === '/mcp' || pathname === '/mcp/smart' || pathname === '/mcp/simple')) {
      return this.handleInfo(pathname);
    }

    // GET for SSE transport connection (?transport=sse)
    if (request.method === 'GET' && url.searchParams.get('transport') === 'sse') {
      return this.handleSSE(request);
    }

    // POST for MCP messages (handles both /mcp* and /mcp*/message for Streamable HTTP)
    if (
      request.method === 'POST' &&
      (
        pathname === '/mcp' ||
        pathname === '/mcp/message' ||
        pathname === '/mcp/smart' ||
        pathname === '/mcp/smart/message' ||
        pathname === '/mcp/simple' ||
        pathname === '/mcp/simple/message'
      )
    ) {
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
  private handleInfo(pathname: string): Response {
    const isSimpleEndpoint = pathname === '/mcp/simple';

    const info = {
      name: 'cloudflare-image-mcp',
      version: '0.1.0',
      protocol: 'MCP',
      transport: 'streamable-http',
      endpoints: {
        // Default endpoint (multi-model)
        message: '/mcp/message',
        sse: '/mcp?transport=sse',

        // Explicit endpoints
        smart: {
          message: '/mcp/smart/message',
          sse: '/mcp/smart?transport=sse',
        },
        simple: {
          message: '/mcp/simple/message',
          sse: '/mcp/simple?transport=sse',
          query: {
            model: 'Required. /mcp/simple uses this as the model_id.',
          },
        },
      },
      tools: this.isMode1 ? ['run_model'] : ['run_model', 'list_models', 'describe_model'],
      mode: this.mode,
      defaultModel: this.defaultModel,
      description: isSimpleEndpoint
        ? 'Single-model image generation (run_model only). Requires ?model='
        : 'Multi-model image generation using Cloudflare Workers AI',
    };

    return new Response(JSON.stringify(info, null, 2), {
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * Handle SSE transport connection
   */
  private async handleSSE(_request: Request): Promise<Response> {
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

      if (name === 'run_model') {
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
   * Handle run_model tool call
   */
  private async handleRunModels(args: any): Promise<any[]> {
    const {
      prompt,
      model_id: requestedModelId,
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

    // Single-model endpoint (/mcp/simple): do not allow arbitrary model selection.
    // Multi-model endpoints (/mcp, /mcp/smart): model_id is required.
    let model_id: string | null = null;

    if (this.isMode1) {
      if (!this.defaultModel) {
        return [{
          type: 'text',
          text: 'Error: /mcp/simple requires ?model=. Example: /mcp/simple?model=@cf/black-forest-labs/flux-2-klein-4b',
          isError: true,
        }];
      }

      if (requestedModelId && requestedModelId !== this.defaultModel) {
        return [{
          type: 'text',
          text: `Error: /mcp/simple does not allow selecting model_id. Remove model_id or use model_id="${this.defaultModel}".`,
          isError: true,
        }];
      }

      model_id = this.defaultModel;
    } else {
      model_id = requestedModelId || null;
      if (!model_id) {
        return [{
          type: 'text',
          text: 'Error: model_id is required. Use list_models to get available model_ids.',
          isError: true,
        }];
      }
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

    // Format response with full URL (use worker proxy URL)
    const textParts: string[] = [];
    const baseUrl = this.workerBaseUrl;
    const fullUrl = (path: string) => path.startsWith('http') ? path : `${baseUrl}${path}`;

    // Helper to check if image has url (not b64_json)
    const hasUrl = (img: { url?: string; b64_json?: string }): img is { url: string } => 'url' in img && !!img.url;

    if (result.images.length === 1) {
      const img = result.images[0];
      textParts.push(`Image generated successfully!\n`);
      if (hasUrl(img)) {
        textParts.push(`![Generated Image](${fullUrl(img.url)})`);
      } else {
        textParts.push(`Image generated (base64 data available)`);
      }
    } else {
      textParts.push(`Generated ${result.images.length} images:\n\n`);
      result.images.forEach((img, i) => {
        if (hasUrl(img)) {
          textParts.push(`Image ${i + 1}: ![Generated Image ${i + 1}](${fullUrl(img.url)})\n`);
        } else {
          textParts.push(`Image ${i + 1}: (base64 data available)\n`);
        }
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
    // Single-model endpoint: list_models is not available
    if (this.isMode1) {
      return [{
        type: 'text',
        text: 'Error: list_models is not available on /mcp/simple. Use /mcp or /mcp/smart for multi-model discovery, or call run_model(prompt="...") directly.',
        isError: true,
      }];
    }

    const models = this.generator.listModels();

    // Return JSON with model_id -> taskTypes mapping
    const modelMap: Record<string, string[]> = {};
    const editCapabilitiesMap: Record<string, any> = {};

    for (const model of models) {
      modelMap[model.id] = model.taskTypes;
      if (model.editCapabilities) {
        editCapabilitiesMap[model.id] = model.editCapabilities;
      }
    }

    // Add next_step guidance
    const userMentionedModel = '${user_mentioned_model_id}';
    const nextStep = `call describe_model(model_id="${userMentionedModel}")`;

    const output = {
      ...modelMap,
      edit_capabilities: editCapabilitiesMap,
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
    // Single-model endpoint: describe_model is not available
    if (this.isMode1) {
      return [{
        type: 'text',
        text: 'Error: describe_model is not available on /mcp/simple. Use /mcp or /mcp/smart for multi-model discovery, or call run_model(prompt="...") directly.',
        isError: true,
      }];
    }

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
      edit_capabilities: modelConfig.editCapabilities || {},
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
    // Canonical parameter channel is prompt-embedded flags ("... --key=value").
    const paramStrings: string[] = [];

    // 1) Include any required non-prompt params
    for (const [key, param] of Object.entries(modelConfig.parameters)) {
      const p = param as any;
      if (p.required && key !== 'prompt') {
        paramStrings.push(`--${key}=value`);
      }
    }

    // 2) If there are no required non-prompt params, include a few common optional flags (if present)
    if (paramStrings.length === 0) {
      const commonOptionalKeys = ['steps', 'num_steps', 'seed', 'width', 'height', 'guidance', 'negative_prompt', 'strength'];
      for (const key of commonOptionalKeys) {
        if (Object.prototype.hasOwnProperty.call(modelConfig.parameters, key)) {
          paramStrings.push(`--${key}=value`);
        }
        if (paramStrings.length >= 4) break;
      }
    }

    const paramsStr = paramStrings.join(' ');

    // Add next_step guidance (preferred: embed params in prompt as flags)
    const nextStep = `call run_model(model_id="${modelConfig.id}" prompt="your prompt here${paramsStr ? ' ' + paramsStr : ''}")`;

    // Add next_step to schema
    schema.next_step = nextStep;

    return [{
      type: 'text',
      text: JSON.stringify(schema, null, 2),
    }];
  }

  /**
   * Get tool definitions for MCP
   * Single-model endpoint (/mcp/simple): Only run_model available
   * Multi-model endpoints (/mcp, /mcp/smart): list_models, describe_model, run_model available
   */
  private getToolDefinitions(): any[] {
    // Single-model endpoint: only run_model (no model selection)
    const mode1Tools = [
      {
        name: 'run_model',
        description: this.defaultModel
          ? `Generate images using the default model (${this.defaultModel}). Canonical parameter channel: embed model parameters directly in the prompt as --key=value flags (e.g., "a cat --steps=20 --seed=42 --width=1024 --height=1024"). If you need to inspect model-specific supported keys, use /mcp or /mcp/smart to call list_models + describe_model.`
          : 'Generate images using the model specified via ?model= on /mcp/simple. Canonical parameter channel: embed model parameters directly in the prompt as --key=value flags (e.g., "a cat --steps=20 --seed=42 --width=1024 --height=1024"). If you need to inspect model-specific supported keys, use /mcp or /mcp/smart to call list_models + describe_model.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Prompt with optional --key=value flags. Canonical channel for model parameters. Example: "a cat --steps=20 --seed=42 --width=1024 --height=1024".',
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
          required: ['prompt'],
        },
      },
    ];

    // Mode 2: All tools available
    const mode2Tools = [
      {
        name: 'run_model',
        description: 'Generate images with a specific model. REQUIRED WORKFLOW: (1) First call list_models to get available model_ids, (2) Then ALWAYS call describe_model(model_id) to discover what parameters that specific model accepts (different models support different parameters like steps, guidance, width, height, etc.), (3) Finally call run_model with the model_id and embed the model-specific parameters you discovered in step 2 as --key=value flags in the prompt (e.g., "a cat --steps=20 --width=1024 --height=1024 --seed=42"). DO NOT skip describe_model - it reveals which parameters are valid for your chosen model. Parameters vary significantly between models and using unsupported parameters may cause errors or be ignored.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Text prompt. Preferred: embed parameters as flags in the prompt using --key=value (e.g., "a cat --steps=20 --width=1024 --height=1024 --seed=42").',
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
        description: 'STEP 1: List all available image generation models with their model_ids and supported task types (text-to-image, image-to-image, etc.). Returns JSON object. After calling this, you MUST call describe_model for your chosen model_id before using run_model.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'describe_model',
        description: 'STEP 2 (REQUIRED): Get the complete parameter schema for a specific model. This reveals ALL available parameters (steps, guidance, width, height, seed, negative_prompt, etc.) with their types, ranges, and defaults. Each model has different supported parameters - you MUST call this before run_model to know which --key=value flags you can use. Call list_models first to get valid model_ids, unless the user explicitly provided a model_id like "@cf/black-forest-labs/flux-1-schnell".',
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

    return this.isMode1 ? mode1Tools : mode2Tools;
  }
}
