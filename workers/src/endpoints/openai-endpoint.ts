// ============================================================================
// OpenAI-Compatible REST API Endpoint
// Implements /v1/images/generations, /v1/images/edits, /v1/images/variations
// ============================================================================

import type { Env, OpenAIGenerationRequest, OpenAIVariationRequest, OpenAIImageResponse } from '../types.js';
import { ImageGeneratorService } from '../services/image-generator.js';

export class OpenAIEndpoint {
  private generator: ImageGeneratorService;
  private corsHeaders: Record<string, string>;

  constructor(env: Env) {
    this.generator = new ImageGeneratorService(env);
    this.corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }

  /**
   * Handle incoming request
   */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: this.corsHeaders });
    }

    try {
      // Route to handler
      if (path === '/v1/images/generations' && request.method === 'POST') {
        return this.handleGenerations(request);
      }
      if (path === '/v1/images/edits' && request.method === 'POST') {
        return this.handleEdits(request);
      }
      if (path === '/v1/images/variations' && request.method === 'POST') {
        return this.handleVariations(request);
      }
      if (path === '/v1/models' && request.method === 'GET') {
        return this.handleListModels();
      }
      if (path.startsWith('/v1/models/') && request.method === 'GET') {
        const modelId = decodeURIComponent(path.substring('/v1/models/'.length));
        return this.handleDescribeModel(modelId);
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  /**
   * POST /v1/images/generations
   * Text-to-image generation (OpenAI-compatible)
   */
  private async handleGenerations(request: Request): Promise<Response> {
    const body = await request.json();
    const req = body as OpenAIGenerationRequest;

    // Validate required fields
    if (!req.prompt) {
      return new Response(JSON.stringify({
        error: {
          message: 'prompt is required',
          type: 'invalid_request_error',
          param: 'prompt',
          code: null,
        },
      }), {
        status: 400,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use model ID directly (full model ID required)
    const modelId = req.model || '@cf/black-forest-labs/flux-1-schnell';
    const n = req.n || 1;

    // Generate images
    const result = await this.generator.generateImages(
      modelId,
      req.prompt,
      Math.min(n, 8), // Cap at 8 images
      {
        size: req.size,
        steps: (req as any).steps,
        seed: (req as any).seed,
        guidance: (req as any).guidance,
        negative_prompt: (req as any).negative_prompt,
      }
    );

    if (!result.success) {
      return new Response(JSON.stringify({
        error: { message: result.error, type: 'api_error' },
      }), {
        status: 500,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build response based on response_format
    // OpenAI spec: return only the requested format field (url OR b64_json), no revised_prompt
    let responseData;
    if (req.response_format === 'b64_json') {
      responseData = result.images.map((img) => ({
        b64_json: img.url.split(',').pop() || '', // Extract base64 from data URI
      }));
    } else {
      responseData = result.images.map((img) => ({
        url: img.url,
      }));
    }

    const response: OpenAIImageResponse = {
      created: Math.floor(Date.now() / 1000),
      data: responseData,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * POST /v1/images/edits
   * Image editing / inpainting (OpenAI-compatible)
   */
  private async handleEdits(request: Request): Promise<Response> {
    const contentType = request.headers.get('content-type') || '';

    let imageData: string;
    let maskData: string | undefined;
    let prompt: string;
    let modelId: string;
    let n: number;
    let size: string;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      imageData = formData.get('image') as string;
      maskData = formData.get('mask') as string || undefined;
      prompt = formData.get('prompt') as string;
      modelId = (formData.get('model') as string) || '@cf/stabilityai/stable-diffusion-xl-base-1.0';
      n = parseInt(formData.get('n') as string) || 1;
      size = (formData.get('size') as string) || '1024x1024';
    } else {
      const body = await request.json();
      const req = body as OpenAIGenerationRequest;
      imageData = (req as any).image;
      maskData = (req as any).mask;
      prompt = req.prompt;
      modelId = req.model || '@cf/stabilityai/stable-diffusion-xl-base-1.0';
      n = req.n || 1;
      size = req.size || '1024x1024';
    }

    if (!imageData || !prompt) {
      return new Response(JSON.stringify({
        error: { message: 'image and prompt are required', type: 'invalid_request_error' },
      }), {
        status: 400,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate edit
    let result;
    if (maskData) {
      // Inpainting
      result = await this.generator.generateInpaint(
        modelId,
        prompt,
        imageData,
        maskData,
        { size, n }
      );
    } else {
      // Image-to-image
      result = await this.generator.generateImageToImage(
        modelId,
        prompt,
        imageData,
        0.5, // Default strength
        { size, n }
      );
    }

    if (!result.success) {
      return new Response(JSON.stringify({
        error: { message: result.error, type: 'api_error' },
      }), {
        status: 500,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response: OpenAIImageResponse = {
      created: Math.floor(Date.now() / 1000),
      data: [{
        url: result.imageUrl,
      }],
    };

    return new Response(JSON.stringify(response), {
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * POST /v1/images/variations
   * Image variations (OpenAI-compatible)
   */
  private async handleVariations(request: Request): Promise<Response> {
    const contentType = request.headers.get('content-type') || '';

    let imageData: string;
    let modelId: string;
    let n: number;
    let size: string;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      imageData = formData.get('image') as string;
      modelId = (formData.get('model') as string) || '@cf/black-forest-labs/flux-2-klein-4b';
      n = parseInt(formData.get('n') as string) || 1;
      size = (formData.get('size') as string) || '1024x1024';
    } else {
      const body = await request.json();
      const req = body as OpenAIVariationRequest;
      imageData = req.image;
      modelId = req.model || '@cf/black-forest-labs/flux-2-klein-4b';
      n = req.n || 1;
      size = req.size || '1024x1024';
    }

    if (!imageData) {
      return new Response(JSON.stringify({
        error: { message: 'image is required', type: 'invalid_request_error' },
      }), {
        status: 400,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate variation (uses image-to-image with empty prompt or similar)
    const result = await this.generator.generateImageToImage(
      modelId,
      '', // Empty prompt for variations
      imageData,
      0.7, // Lower strength for more faithful variations
      { size, n }
    );

    if (!result.success) {
      return new Response(JSON.stringify({
        error: { message: result.error, type: 'api_error' },
      }), {
        status: 500,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response: OpenAIImageResponse = {
      created: Math.floor(Date.now() / 1000),
      data: [{
        url: result.imageUrl,
      }],
    };

    return new Response(JSON.stringify(response), {
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * GET /v1/models
   * List available models
   */
  private handleListModels(): Response {
    const models = this.generator.listModels();

    return new Response(JSON.stringify({
      data: models.map((m) => ({
        id: m.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: m.id.split('/')[0],
      })),
      object: 'list',
    }), {
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * GET /v1/models/:model
   * Describe a specific model
   */
  private handleDescribeModel(modelId: string): Response {
    const help = this.generator.getModelHelp(modelId);

    return new Response(JSON.stringify({
      id: modelId,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: modelId.split('/')[0],
      description: help,
    }), {
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * Create error response
   */
  private errorResponse(error: unknown): Response {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      error: {
        message,
        type: 'api_error',
        code: null,
      },
    }), {
      status: 500,
      headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
