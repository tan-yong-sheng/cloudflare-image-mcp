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
   * Routes based on taskType: "generations" (text-to-image) or "edits" (image editing)
   */
  private async handleRunModels(args: any): Promise<any[]> {
    const {
      taskType,
      prompt,
      model_id: requestedModelId,
      n,
      size,
      image,
      mask,
      cf_params,
    } = args || {};

    // ── Validate taskType ──
    if (!taskType) {
      return [{
        type: 'text',
        text: 'Error: taskType is required. Use "generations" for text-to-image or "edits" for image editing.',
        isError: true,
      }];
    }
    if (taskType !== 'generations' && taskType !== 'edits') {
      return [{
        type: 'text',
        text: `Error: Invalid taskType "${taskType}". Must be "generations" or "edits".`,
        isError: true,
      }];
    }

    // ── Validate prompt ──
    if (!prompt) {
      return [{
        type: 'text',
        text: 'Error: prompt is required',
        isError: true,
      }];
    }

    // ── Validate edits-specific fields ──
    if (taskType === 'edits' && !image) {
      return [{
        type: 'text',
        text: 'Error: image is required when taskType is "edits".',
        isError: true,
      }];
    }
    if (taskType === 'generations' && image) {
      return [{
        type: 'text',
        text: 'Error: image cannot be used with taskType "generations". Use taskType "edits" for image editing.',
        isError: true,
      }];
    }
    if (taskType === 'generations' && mask) {
      return [{
        type: 'text',
        text: 'Error: mask cannot be used with taskType "generations". Use taskType "edits" for inpainting.',
        isError: true,
      }];
    }

    // ── Resolve model_id ──
    let model_id: string | null = null;

    if (this.isMode1) {
      if (!this.defaultModel) {
        return [{
          type: 'text',
          text: 'Error: /mcp/simple requires ?model=. Example: /mcp/simple?model=@cf/{provider}/{model_name}',
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

    // ── Validate model exists ──
    const modelConfig = this.generator.getModelConfig(model_id);
    if (!modelConfig) {
      return [{
        type: 'text',
        text: `Error: Unknown model_id: ${model_id}. Use list_models to get valid model_ids.`,
        isError: true,
      }];
    }

    // ── Validate model supports the requested task ──
    if (taskType === 'edits' && !modelConfig.supportedTasks.includes('image-to-image')) {
      return [{
        type: 'text',
        text: `Error: Model ${model_id} does not support image editing. Use taskType "generations" or choose a model that supports image-to-image.`,
        isError: true,
      }];
    }

    // ── Build explicitParams from OpenAI-standard fields + cf_params ──
    const numImages = Math.min(n || 1, 8);
    const explicitParams: Record<string, any> = {};
    if (size !== undefined) explicitParams.size = size;

    // Merge cf_params (steps, seed, guidance, negative_prompt, strength)
    if (cf_params && typeof cf_params === 'object') {
      // Validate strength is only used with edits
      if (cf_params.strength !== undefined && taskType === 'generations') {
        return [{
          type: 'text',
          text: 'Error: cf_params.strength cannot be used with taskType "generations". Use taskType "edits" for image editing.',
          isError: true,
        }];
      }
      for (const [key, value] of Object.entries(cf_params)) {
        if (value !== undefined) explicitParams[key] = value;
      }
    }

    // ── Execute ──
    let result;

    if (taskType === 'edits') {
      if (mask) {
        const singleImage = Array.isArray(image) ? image[0] : image;
        result = await this.generator.generateInpaints(
          model_id,
          prompt,
          singleImage,
          mask,
          numImages,
          explicitParams
        );
      } else {
        const imageInput = Array.isArray(image) ? image : image;
        result = await this.generator.generateImageToImages(
          model_id,
          prompt,
          imageInput,
          numImages,
          explicitParams
        );
      }
    } else {
      result = await this.generator.generateImages(
        model_id,
        prompt,
        numImages,
        explicitParams
      );
    }

    if (!result.success) {
      return [{
        type: 'text',
        text: `Error: ${result.error}`,
        isError: true,
      }];
    }

    // ── Format response ──
    const textParts: string[] = [];
    const baseUrl = this.workerBaseUrl;
    const fullUrl = (path: string) => path.startsWith('http') ? path : `${baseUrl}${path}`;
    const hasUrl = (img: { url?: string; b64_json?: string }): img is { url: string } => 'url' in img && !!img.url;

    const modeLabel = taskType === 'edits' ? (mask ? 'Inpainted' : 'Edited') : 'Generated';

    if (result.images.length === 1) {
      const img = result.images[0];
      textParts.push(`Image ${modeLabel.toLowerCase()} successfully!\n`);
      if (hasUrl(img)) {
        textParts.push(`![${modeLabel} Image](${fullUrl(img.url)})`);
      } else {
        textParts.push(`Image ${modeLabel.toLowerCase()} (base64 data available)`);
      }
    } else {
      textParts.push(`${modeLabel} ${result.images.length} images:\n\n`);
      result.images.forEach((img, i) => {
        if (hasUrl(img)) {
          textParts.push(`Image ${i + 1}: ![${modeLabel} Image ${i + 1}](${fullUrl(img.url)})\n`);
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

    const sortedModels = [...models].sort((a, b) => {
      const byProvider = a.provider.localeCompare(b.provider);
      if (byProvider !== 0) return byProvider;
      return a.name.localeCompare(b.name);
    });

    const editCapabilitiesMap: Record<string, any> = {};
    for (const model of sortedModels) {
      if (model.editCapabilities) {
        editCapabilitiesMap[model.id] = model.editCapabilities;
      }
    }

    const output = {
      models: sortedModels.map((m) => {
        const taskTypes: string[] = ['generations'];
        if (m.taskTypes.includes('image-to-image')) taskTypes.push('edits');
        return {
          model_id: m.id,
          name: m.name,
          description: m.description,
          provider: m.provider,
          supported_image_sizes: m.supportedSizes,
          supported_task_types: taskTypes,
        };
      }),
      edit_capabilities: editCapabilitiesMap,
      next_step: 'call describe_model(model_id="<model_id from list_models>")',
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

    // Map supportedTasks to taskType enum values
    const supportedTaskTypes: string[] = ['generations']; // all models support text-to-image
    if (modelConfig.supportedTasks.includes('image-to-image')) {
      supportedTaskTypes.push('edits');
    }

    // Build cf_params split by taskType so the LLM knows exactly which
    // params to use for each mode.
    // Skip: prompt (top-level), image/image_b64/mask/mask_b64 (OpenAI-standard top-level fields)
    const imageParamKeys = new Set(['prompt', 'image', 'image_b64', 'mask', 'mask_b64']);
    const editsOnlyKeys = new Set(['strength']); // CF-specific params only valid for edits

    const buildParamEntry = (param: any) => {
      const entry: any = {
        type: param.type,
        cf_param: param.cfParam,
        description: param.description || `Parameter: ${param.cfParam}`,
      };
      if (param.required) entry.required = true;
      if (param.default !== undefined) entry.default = param.default;
      if (param.min !== undefined) entry.minimum = param.min;
      if (param.max !== undefined) entry.maximum = param.max;
      if (param.step !== undefined) entry.step = param.step;
      return entry;
    };

    // Generations cf_params: all non-image, non-edits-only params
    const generationsCfParams: Record<string, any> = {};
    // Edits cf_params: all non-image params (including edits-only like strength)
    const editsCfParams: Record<string, any> = {};

    for (const [key, param] of Object.entries(modelConfig.parameters)) {
      if (imageParamKeys.has(key)) continue;

      const entry = buildParamEntry(param as any);

      if (!editsOnlyKeys.has(key)) {
        generationsCfParams[key] = entry;
      }

      if (supportedTaskTypes.includes('edits')) {
        editsCfParams[key] = entry;
      }
    }

    const cfParams: Record<string, any> = {
      generations: generationsCfParams,
    };
    if (supportedTaskTypes.includes('edits')) {
      cfParams.edits = editsCfParams;
    }

    // Build schema
    const schema: any = {
      model_id: modelConfig.id,
      name: modelConfig.name,
      description: modelConfig.description,
      provider: modelConfig.provider,
      input_format: modelConfig.inputFormat,
      response_format: modelConfig.responseFormat,
      supported_task_types: supportedTaskTypes,
      edit_capabilities: modelConfig.editCapabilities || {},
      max_input_images: modelConfig.maxInputImages || 1,
      cf_params: cfParams,
    };

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

    // Build next_step examples with cf_params per taskType
    const genKeys = Object.keys(generationsCfParams).slice(0, 3);
    const genCfStr = genKeys.length > 0
      ? `, cf_params={${genKeys.map(k => `"${k}": ...`).join(', ')}}`
      : '';

    const generationsExample = `run_model(taskType="generations", model_id="${modelConfig.id}", prompt="your prompt"${genCfStr})`;

    let editsExample = '';
    if (supportedTaskTypes.includes('edits')) {
      const editKeys = Object.keys(editsCfParams).filter(k => editsOnlyKeys.has(k) || genKeys.includes(k)).slice(0, 3);
      const editCfStr = editKeys.length > 0
        ? `, cf_params={${editKeys.map(k => `"${k}": ...`).join(', ')}}`
        : '';
      editsExample = `\nFor image editing: run_model(taskType="edits", model_id="${modelConfig.id}", prompt="edit description", image="<base64>"${editCfStr})`;
    }

    schema.next_step = generationsExample + editsExample;

    return [{
      type: 'text',
      text: JSON.stringify(schema, null, 2),
    }];
  }

  /**
   * Shared run_model input schema properties (used by both mode1 and mode2)
   */
  private getRunModelSchema(requireModelId: boolean): any {
    const properties: any = {
      taskType: {
        type: 'string',
        enum: ['generations', 'edits'],
        description: 'Task type. "generations" for text-to-image, "edits" for image editing/inpainting.',
      },
      prompt: {
        type: 'string',
        description: 'Text prompt describing the desired image. Supports --key=value flags for model-specific parameters (e.g., "a cat --steps=20 --width=1024").',
      },
      n: {
        type: 'number',
        description: 'Number of images to generate (1-8).',
        minimum: 1,
        maximum: 8,
      },
      size: {
        type: 'string',
        description: 'Image size (e.g., "1024x1024").',
      },
      // Edits-only (OpenAI-standard)
      image: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
        description: 'Required when taskType="edits". Base64-encoded input image(s). Array of up to 4 for multi-reference models (FLUX 2).',
      },
      mask: {
        type: 'string',
        description: 'Optional. Only for taskType="edits". Base64-encoded mask for inpainting. White areas edited, black preserved.',
      },
      // Cloudflare-specific params — keys vary by model AND taskType.
      // Call describe_model to see cf_params.generations and cf_params.edits
      // for the exact params available per mode.
      cf_params: {
        type: 'object',
        description: 'Cloudflare Workers AI specific parameters (e.g., steps, seed, guidance, strength). IMPORTANT: available params differ per model and per taskType. Call describe_model(model_id) to see cf_params.generations and cf_params.edits for exact keys.',
        additionalProperties: true,
      },
    };

    const required = ['taskType', 'prompt'];

    if (requireModelId) {
      properties.model_id = {
        type: 'string',
        description: 'Exact model_id from list_models output (format: @cf/{provider}/{model_name}).',
      };
      required.push('model_id');
    }

    return { type: 'object', properties, required };
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
          ? `Generate or edit images using model ${this.defaultModel}. Set taskType to "generations" for text-to-image or "edits" for image editing. Use cf_params for model-specific parameters. Use /mcp or /mcp/smart for model discovery.`
          : 'Generate or edit images using the model specified via ?model= on /mcp/simple. Set taskType to "generations" for text-to-image or "edits" for image editing. Use cf_params for model-specific parameters.',
        inputSchema: this.getRunModelSchema(false),
      },
    ];

    // Mode 2: All tools available
    const mode2Tools = [
      {
        name: 'run_model',
        description: 'Generate or edit images with a specific model. Set taskType to "generations" for text-to-image or "edits" for image editing. REQUIRED WORKFLOW: (1) call list_models, (2) call describe_model(model_id) to discover supported cf_params, (3) call run_model. DO NOT skip describe_model — parameters vary between models.',
        inputSchema: this.getRunModelSchema(true),
      },
      {
        name: 'list_models',
        description: 'STEP 1: List all available image generation models with their model_ids and supported task types (text-to-image, image-to-image). After calling this, you MUST call describe_model for your chosen model_id before using run_model.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'describe_model',
        description: 'STEP 2 (REQUIRED): Get the complete parameter schema for a specific model. Reveals ALL available cf_params (steps, guidance, width, height, seed, etc.) with types, ranges, and defaults. Each model supports different parameters. Call list_models first to get valid model_ids.',
        inputSchema: {
          type: 'object',
          properties: {
            model_id: {
              type: 'string',
              description: 'Exact model_id from list_models output.',
            },
          },
          required: ['model_id'],
        },
      },
    ];

    return this.isMode1 ? mode1Tools : mode2Tools;
  }
}
