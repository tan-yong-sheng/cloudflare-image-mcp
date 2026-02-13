// ============================================================================
// OpenAI-Compatible REST API Endpoint
// Implements /v1/images/generations, /v1/images/edits, /v1/images/variations
// ============================================================================

import type { Env, OpenAIGenerationRequest, OpenAIEditRequest, OpenAIVariationRequest, OpenAIImageResponse } from '../types.js';
import { ImageGeneratorService } from '../services/image-generator.js';

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...(chunk as unknown as number[]));
  }

  return btoa(binary);
}

/**
 * Read a File/Blob from FormData and convert to base64 string
 */
async function fileToBase64(file: File | Blob | null): Promise<string | undefined> {
  if (!file) return undefined;
  const arrayBuffer = await file.arrayBuffer();
  return arrayBufferToBase64(arrayBuffer);
}

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

    // Determine if we should return base64 or url
    const returnBase64 = req.response_format === 'b64_json';

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
      },
      returnBase64
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
        b64_json: 'b64_json' in img ? img.b64_json : '',
      }));
    } else {
      const origin = new URL(request.url).origin;
      responseData = result.images.map((img) => {
        const url = 'url' in img ? img.url : '';
        const absoluteUrl = url.startsWith('/') ? new URL(url, origin).toString() : url;
        return { url: absoluteUrl };
      });
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
   * Image editing / img2img / multi-image (OpenAI-compatible)
   * Supports --key=value params embedded in prompt for CF-specific params
   */
  private async handleEdits(request: Request): Promise<Response> {
    const contentType = request.headers.get('content-type') || '';

    let imageDataArr: string[] = [];
    let maskData: string | undefined;
    let prompt: string;
    let modelId: string;
    let n: number;
    let returnBase64 = false;

    // Collect only explicitly-provided params (undefined = not provided,
    // so --key=value in prompt can fill gaps via ParamParser)
    const explicitParams: Record<string, any> = {};

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();

      // Support both single "image" and array "image[]" fields (OpenAI style)
      const allEntries = formData.getAll('image') as (File | string)[];
      const arrayEntries = formData.getAll('image[]') as (File | string)[];
      const imageEntries = [...allEntries, ...arrayEntries];

      for (const entry of imageEntries) {
        if (entry instanceof File) {
          const b64 = await fileToBase64(entry);
          if (b64) imageDataArr.push(b64);
        } else if (typeof entry === 'string' && entry.length > 0) {
          imageDataArr.push(entry);
        }
      }

      const maskFile = formData.get('mask') as File | null;
      maskData = await fileToBase64(maskFile);

      prompt = formData.get('prompt') as string;
      modelId = (formData.get('model') as string) || '@cf/stabilityai/stable-diffusion-xl-base-1.0';
      n = parseInt(formData.get('n') as string) || 1;
      returnBase64 = formData.get('response_format') === 'b64_json';

      // Extract optional CF-specific params from form data (only if provided)
      const sizeVal = formData.get('size') as string | null;
      if (sizeVal) explicitParams.size = sizeVal;

      const stepsVal = formData.get('steps') as string | null;
      if (stepsVal) explicitParams.steps = parseInt(stepsVal);

      const seedVal = formData.get('seed') as string | null;
      if (seedVal) explicitParams.seed = parseInt(seedVal);

      const guidanceVal = formData.get('guidance') as string | null;
      if (guidanceVal) explicitParams.guidance = parseFloat(guidanceVal);

      const negPromptVal = formData.get('negative_prompt') as string | null;
      if (negPromptVal) explicitParams.negative_prompt = negPromptVal;

      const strengthVal = formData.get('strength') as string | null;
      if (strengthVal) explicitParams.strength = parseFloat(strengthVal);
    } else {
      const body = await request.json();
      const req = body as OpenAIEditRequest;

      // Support single image string or array of images
      const rawImage = (req as any).image ?? (req as any).image_b64;
      if (Array.isArray(rawImage)) {
        imageDataArr = rawImage.filter((img: any) => typeof img === 'string' && img.length > 0);
      } else if (typeof rawImage === 'string' && rawImage.length > 0) {
        imageDataArr = [rawImage];
      }

      maskData = (req as any).mask ?? (req as any).mask_b64;
      prompt = req.prompt;
      modelId = req.model || '@cf/stabilityai/stable-diffusion-xl-base-1.0';
      n = req.n || 1;
      returnBase64 = req.response_format === 'b64_json';

      // Extract optional CF-specific params from JSON body (only if provided)
      if (req.size !== undefined) explicitParams.size = req.size;
      if (req.steps !== undefined) explicitParams.steps = req.steps;
      if (req.seed !== undefined) explicitParams.seed = req.seed;
      if (req.guidance !== undefined) explicitParams.guidance = req.guidance;
      if (req.negative_prompt !== undefined) explicitParams.negative_prompt = req.negative_prompt;
      if (req.strength !== undefined) explicitParams.strength = req.strength;
    }

    if (imageDataArr.length === 0 || !prompt) {
      return new Response(JSON.stringify({
        error: { message: 'image and prompt are required', type: 'invalid_request_error' },
      }), {
        status: 400,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const count = Math.min(n, 8);

    // Route to appropriate service method
    let result;
    if (maskData) {
      // Inpainting (masked edit) — single image only
      result = await this.generator.generateInpaints(
        modelId, prompt, imageDataArr[0], maskData, count, explicitParams, returnBase64
      );
    } else {
      // Image-to-image — pass single string or array depending on count
      const imageInput = imageDataArr.length === 1 ? imageDataArr[0] : imageDataArr;
      result = await this.generator.generateImageToImages(
        modelId, prompt, imageInput, count, explicitParams, returnBase64
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

    // Build OpenAI-compatible response (same pattern as handleGenerations)
    let responseData;
    if (returnBase64) {
      responseData = result.images.map((img) => ({
        b64_json: 'b64_json' in img ? img.b64_json : '',
      }));
    } else {
      const origin = new URL(request.url).origin;
      responseData = result.images.map((img) => {
        const url = 'url' in img ? img.url : '';
        const absoluteUrl = url.startsWith('/') ? new URL(url, origin).toString() : url;
        return { url: absoluteUrl };
      });
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
   * POST /v1/images/variations
   * Image variations (OpenAI-compatible)
   * Supports --key=value params embedded in prompt for CF-specific params
   */
  private async handleVariations(request: Request): Promise<Response> {
    const contentType = request.headers.get('content-type') || '';

    let imageDataArr: string[] = [];
    let modelId: string;
    let n: number;
    let returnBase64 = false;
    const explicitParams: Record<string, any> = {};

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();

      // Support both single "image" and array "image[]" fields
      const allEntries = formData.getAll('image') as (File | string)[];
      const arrayEntries = formData.getAll('image[]') as (File | string)[];
      const imageEntries = [...allEntries, ...arrayEntries];

      for (const entry of imageEntries) {
        if (entry instanceof File) {
          const b64 = await fileToBase64(entry);
          if (b64) imageDataArr.push(b64);
        } else if (typeof entry === 'string' && entry.length > 0) {
          imageDataArr.push(entry);
        }
      }

      modelId = (formData.get('model') as string) || '@cf/black-forest-labs/flux-2-klein-4b';
      n = parseInt(formData.get('n') as string) || 1;
      returnBase64 = formData.get('response_format') === 'b64_json';

      const sizeVal = formData.get('size') as string | null;
      if (sizeVal) explicitParams.size = sizeVal;

      const stepsVal = formData.get('steps') as string | null;
      if (stepsVal) explicitParams.steps = parseInt(stepsVal);

      const seedVal = formData.get('seed') as string | null;
      if (seedVal) explicitParams.seed = parseInt(seedVal);

      const strengthVal = formData.get('strength') as string | null;
      if (strengthVal) explicitParams.strength = parseFloat(strengthVal);
    } else {
      const body = await request.json();
      const req = body as OpenAIVariationRequest;

      const rawImage = req.image;
      if (Array.isArray(rawImage)) {
        imageDataArr = rawImage.filter((img: any) => typeof img === 'string' && img.length > 0);
      } else if (typeof rawImage === 'string' && rawImage.length > 0) {
        imageDataArr = [rawImage];
      }

      modelId = req.model || '@cf/black-forest-labs/flux-2-klein-4b';
      n = req.n || 1;
      returnBase64 = req.response_format === 'b64_json';

      if (req.size !== undefined) explicitParams.size = req.size;
      if ((req as any).steps !== undefined) explicitParams.steps = (req as any).steps;
      if ((req as any).seed !== undefined) explicitParams.seed = (req as any).seed;
      if ((req as any).strength !== undefined) explicitParams.strength = (req as any).strength;
    }

    if (imageDataArr.length === 0) {
      return new Response(JSON.stringify({
        error: { message: 'image is required', type: 'invalid_request_error' },
      }), {
        status: 400,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const count = Math.min(n, 8);

    // Default strength for variations (more faithful to original)
    if (explicitParams.strength === undefined) {
      explicitParams.strength = 0.7;
    }

    const imageInput = imageDataArr.length === 1 ? imageDataArr[0] : imageDataArr;
    const result = await this.generator.generateImageToImages(
      modelId,
      '', // Empty prompt for variations
      imageInput,
      count,
      explicitParams,
      returnBase64
    );

    if (!result.success) {
      return new Response(JSON.stringify({
        error: { message: result.error, type: 'api_error' },
      }), {
        status: 500,
        headers: { ...this.corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build OpenAI-compatible response
    let responseData;
    if (returnBase64) {
      responseData = result.images.map((img) => ({
        b64_json: 'b64_json' in img ? img.b64_json : '',
      }));
    } else {
      const origin = new URL(request.url).origin;
      responseData = result.images.map((img) => {
        const url = 'url' in img ? img.url : '';
        const absoluteUrl = url.startsWith('/') ? new URL(url, origin).toString() : url;
        return { url: absoluteUrl };
      });
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
