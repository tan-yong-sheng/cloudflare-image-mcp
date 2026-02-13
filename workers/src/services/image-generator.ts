// ============================================================================
// Image Generator Service - Routes to appropriate Cloudflare AI model
// ============================================================================

import type { Env, ModelConfig, AIAccount } from '../types.js';
import { ParamParser } from './param-parser.js';
import { R2StorageService } from './r2-storage.js';
import { MODEL_CONFIGS } from '../config/models.js';

export class ImageGeneratorService {
  private aiAccounts: AIAccount[];
  private storage: R2StorageService;
  private models: Map<string, ModelConfig>;

  private cleanBase64(data: string): string {
    return data.replace(/^data:image\/\w+;base64,/, '');
  }

  private async extractImageResult(
    result: unknown
  ): Promise<
    | { kind: 'base64'; data: string }
    | { kind: 'binary'; data: ArrayBuffer }
    | null
  > {
    // Common base64-returning shape
    if (typeof result === 'string') {
      return { kind: 'base64', data: result };
    }

    // Some models may return { image: "...base64..." }
    if (result && typeof result === 'object' && 'image' in result) {
      const maybeImage = (result as any).image;
      if (typeof maybeImage === 'string') {
        return { kind: 'base64', data: maybeImage };
      }
      if (maybeImage instanceof ArrayBuffer) {
        return { kind: 'binary', data: maybeImage };
      }
      if (maybeImage instanceof Uint8Array) {
        const copied = new Uint8Array(maybeImage);
        const buf = copied.buffer.slice(copied.byteOffset, copied.byteOffset + copied.byteLength);
        return { kind: 'binary', data: buf };
      }
      if (maybeImage instanceof ReadableStream) {
        const buf = await new Response(maybeImage).arrayBuffer();
        return { kind: 'binary', data: buf };
      }
    }

    // Binary response directly
    if (result instanceof ArrayBuffer) {
      return { kind: 'binary', data: result };
    }
    if (result instanceof Uint8Array) {
      const copied = new Uint8Array(result);
      const buf = copied.buffer.slice(copied.byteOffset, copied.byteOffset + copied.byteLength);
      return { kind: 'binary', data: buf };
    }
    if (result instanceof ReadableStream) {
      const buf = await new Response(result).arrayBuffer();
      return { kind: 'binary', data: buf };
    }

    return null;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000; // 32KB
    let binary = '';

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      binary += String.fromCharCode(...(chunk as any));
    }

    return btoa(binary);
  }

  constructor(env: Env) {
    this.storage = new R2StorageService(env);
    this.models = new Map(Object.entries(MODEL_CONFIGS));

    // Build AI accounts list:
    // 1. AI_ACCOUNTS (JSON array) if set and valid
    // 2. Else fall back to CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
    const fallback = [{
      account_id: env.CLOUDFLARE_ACCOUNT_ID,
      api_token: env.CLOUDFLARE_API_TOKEN,
    }];

    if (env.AI_ACCOUNTS) {
      try {
        const parsed = JSON.parse(env.AI_ACCOUNTS) as AIAccount[];
        if (!Array.isArray(parsed) || parsed.length === 0) {
          console.warn('AI_ACCOUNTS is empty or not an array, falling back to deploy credentials');
          this.aiAccounts = fallback;
        } else {
          const valid = parsed.every(a => a.account_id && a.api_token);
          if (!valid) {
            console.warn('AI_ACCOUNTS entries missing account_id/api_token, falling back to deploy credentials');
            this.aiAccounts = fallback;
          } else {
            this.aiAccounts = parsed;
          }
        }
      } catch (e) {
        console.warn(`AI_ACCOUNTS is not valid JSON (${e instanceof Error ? e.message : e}), falling back to deploy credentials`);
        this.aiAccounts = fallback;
      }
    } else {
      this.aiAccounts = fallback;
    }
  }

  /**
   * Pick a random AI account for load distribution
   */
  private pickAccount(): AIAccount {
    return this.aiAccounts[Math.floor(Math.random() * this.aiAccounts.length)];
  }

  /**
   * Call Cloudflare Workers AI via REST API
   */
  private async runAI(
    modelId: string,
    payload: Record<string, any>,
    model: ModelConfig,
    images?: string[]
  ): Promise<any> {
    const account = this.pickAccount();
    const url = `https://api.cloudflare.com/client/v4/accounts/${account.account_id}/ai/run/${modelId}`;

    let response: Response;

    if (model.inputFormat === 'multipart') {
      // Multipart form data (FLUX 2 models)
      const form = new FormData();
      for (const [key, value] of Object.entries(payload)) {
        if (value !== undefined && value !== null && key !== 'image') {
          form.append(key, String(value));
        }
      }

      // Append image(s) as binary blobs if provided
      if (images && images.length > 0) {
        for (const img of images) {
          const cleanedB64 = this.cleanBase64(img);
          const bytes = this.base64ToUint8Array(cleanedB64);
          form.append('image', new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' }));
        }
      } else if (payload.image && typeof payload.image === 'string' && payload.image.length > 100) {
        // Single image in payload (text-to-image with image param)
        const cleanedB64 = this.cleanBase64(payload.image);
        const bytes = this.base64ToUint8Array(cleanedB64);
        form.append('image', new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' }));
      }

      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.api_token}`,
        },
        body: form,
      });
    } else {
      // JSON format
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.api_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare AI API error (${response.status}): ${errorText}`);
    }

    // Determine response type from content-type header
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      // JSON response — may contain { result: { image: "base64..." } } or { result: "base64..." }
      const json = await response.json() as any;
      // Cloudflare REST API wraps result in { result: ... }
      return json.result !== undefined ? json.result : json;
    }

    // Binary response (image/png, application/octet-stream, etc.)
    return await response.arrayBuffer();
  }

  /**
   * Get model configuration by full model ID
   */
  getModelConfig(modelId: string): ModelConfig | null {
    return this.models.get(modelId) || null;
  }

  /**
   * Generate image from text prompt
   */
  async generateImage(
    modelId: string,
    prompt: string | Record<string, any>,
    explicitParams: Record<string, any> = {},
    returnBase64: boolean = false
  ): Promise<{
    success: boolean;
    imageUrl?: string;
    imageId?: string;
    base64Data?: string;
    revisedPrompt?: string;
    error?: string;
  }> {
    const model = this.getModelConfig(modelId);
    if (!model) {
      return { success: false, error: `Unknown model: ${modelId}` };
    }

    try {
      // Parse parameters
      const params = ParamParser.parse(prompt, explicitParams, model);

      // Build Cloudflare AI payload
      const payload = ParamParser.toCFPayload(params, model);

      // Run the model via REST API
      const result = await this.runAI(model.id, payload, model);

      // Extract image from response (base64 string OR binary)
      const extracted = await this.extractImageResult(result);
      if (!extracted) {
        return { success: false, error: 'No image in model response' };
      }

      // If base64 format requested, return directly without uploading
      if (returnBase64) {
        const base64Data = extracted.kind === 'base64'
          ? this.cleanBase64(extracted.data)
          : this.arrayBufferToBase64(extracted.data);

        return {
          success: true,
          base64Data,
        };
      }

      // Upload to R2 storage
      const uploadResult = await this.storage.uploadImage(
        extracted.kind === 'base64' ? this.cleanBase64(extracted.data) : extracted.data,
        {
          model: model.id,
          prompt: params.prompt,
          parameters: {
            size: params.size,
            steps: params.steps,
            seed: params.seed,
            guidance: params.guidance,
            negative_prompt: params.negative_prompt,
          },
        }
      );

      return {
        success: true,
        imageUrl: uploadResult.url,
        imageId: uploadResult.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Image generation failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Generate multiple images
   */
  async generateImages(
    modelId: string,
    prompt: string | Record<string, any>,
    n: number = 1,
    explicitParams: Record<string, any> = {},
    returnBase64: boolean = false
  ): Promise<{
    success: boolean;
    images: Array<{ url: string; id: string } | { b64_json: string }>;
    error?: string;
  }> {
    const results: Array<{ url: string; id: string } | { b64_json: string }> = [];

    for (let i = 0; i < n; i++) {
      const seed = explicitParams.seed ? explicitParams.seed + i : undefined;
      const result = await this.generateImage(modelId, prompt, {
        ...explicitParams,
        seed,
      }, returnBase64);

      if (result.success) {
        if (returnBase64 && result.base64Data) {
          results.push({ b64_json: result.base64Data });
        } else if (result.imageUrl) {
          results.push({ url: result.imageUrl, id: result.imageId! });
        } else {
          return { success: false, images: results, error: 'No image data returned' };
        }
      } else {
        return { success: false, images: results, error: result.error };
      }
    }

    return { success: true, images: results };
  }

  /**
   * Image-to-image transformation (supports single or multiple input images)
   */
  async generateImageToImage(
    modelId: string,
    prompt: string | Record<string, any>,
    imageData: string | string[],
    strength?: number,
    explicitParams: Record<string, any> = {},
    returnBase64: boolean = false
  ): Promise<{
    success: boolean;
    imageUrl?: string;
    imageId?: string;
    base64Data?: string;
    error?: string;
  }> {
    const model = this.getModelConfig(modelId);
    if (!model) {
      return { success: false, error: `Unknown model: ${modelId}` };
    }

    if (!model.supportedTasks.includes('image-to-image')) {
      return { success: false, error: `Model ${modelId} does not support image-to-image` };
    }

    if (model.editCapabilities?.mask === 'required') {
      return {
        success: false,
        error: `Model ${modelId} requires a mask; use /v1/images/edits with mask (masked edit).`,
      };
    }

    // Handle multi-image: validate count against model limits
    const images = Array.isArray(imageData) ? imageData : [imageData];
    const maxInput = model.maxInputImages || 1;
    if (images.length > maxInput) {
      return {
        success: false,
        error: `Model ${modelId} supports up to ${maxInput} input image(s), got ${images.length}`,
      };
    }

    try {
      // Build explicit params - only include strength if provided
      const mergedExplicit: Record<string, any> = { ...explicitParams };
      if (strength !== undefined) {
        mergedExplicit.strength = strength;
      }
      // For single image, set image param for ParamParser
      mergedExplicit.image = images[0];

      // Parse parameters with image
      const params = ParamParser.parse(prompt, mergedExplicit, model);

      // Build payload with image
      const payload = ParamParser.toCFPayload(params, model);

      // Run the model via REST API (pass images for multipart handling)
      const result = await this.runAI(model.id, payload, model, images);

      const extracted = await this.extractImageResult(result);
      if (!extracted) {
        return { success: false, error: 'No image in model response' };
      }

      if (returnBase64) {
        const base64Data = extracted.kind === 'base64'
          ? this.cleanBase64(extracted.data)
          : this.arrayBufferToBase64(extracted.data);

        return {
          success: true,
          base64Data,
        };
      }

      const uploadResult = await this.storage.uploadImage(
        extracted.kind === 'base64' ? this.cleanBase64(extracted.data) : extracted.data,
        {
          model: model.id,
          prompt: params.prompt,
          parameters: {
            size: params.size,
            steps: params.steps,
            seed: params.seed,
          },
        }
      );

      return {
        success: true,
        imageUrl: uploadResult.url,
        imageId: uploadResult.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * Generate multiple output images from image-to-image transformation
   */
  async generateImageToImages(
    modelId: string,
    prompt: string | Record<string, any>,
    imageData: string | string[],
    n: number = 1,
    explicitParams: Record<string, any> = {},
    returnBase64: boolean = false
  ): Promise<{
    success: boolean;
    images: Array<{ url: string; id: string } | { b64_json: string }>;
    error?: string;
  }> {
    const results: Array<{ url: string; id: string } | { b64_json: string }> = [];

    for (let i = 0; i < n; i++) {
      const seed = explicitParams.seed ? explicitParams.seed + i : undefined;
      const result = await this.generateImageToImage(
        modelId,
        prompt,
        imageData,
        explicitParams.strength,
        { ...explicitParams, seed },
        returnBase64
      );

      if (result.success) {
        if (returnBase64 && result.base64Data) {
          results.push({ b64_json: result.base64Data });
        } else if (result.imageUrl) {
          results.push({ url: result.imageUrl, id: result.imageId! });
        } else {
          return { success: false, images: results, error: 'No image data returned' };
        }
      } else {
        return { success: false, images: results, error: result.error };
      }
    }

    return { success: true, images: results };
  }

  /**
   * Generate multiple inpainted images
   */
  async generateInpaints(
    modelId: string,
    prompt: string,
    imageData: string,
    maskData: string,
    n: number = 1,
    explicitParams: Record<string, any> = {},
    returnBase64: boolean = false
  ): Promise<{
    success: boolean;
    images: Array<{ url: string; id: string } | { b64_json: string }>;
    error?: string;
  }> {
    const results: Array<{ url: string; id: string } | { b64_json: string }> = [];

    for (let i = 0; i < n; i++) {
      const seed = explicitParams.seed ? explicitParams.seed + i : undefined;
      const result = await this.generateInpaint(
        modelId,
        prompt,
        imageData,
        maskData,
        { ...explicitParams, seed },
        returnBase64
      );

      if (result.success) {
        if (returnBase64 && result.base64Data) {
          results.push({ b64_json: result.base64Data });
        } else if (result.imageUrl) {
          results.push({ url: result.imageUrl, id: result.imageId! });
        } else {
          return { success: false, images: results, error: 'No image data returned' };
        }
      } else {
        return { success: false, images: results, error: result.error };
      }
    }

    return { success: true, images: results };
  }

  /**
   * Inpainting / image editing with mask
   */
  async generateInpaint(
    modelId: string,
    prompt: string,
    imageData: string,
    maskData: string,
    explicitParams: Record<string, any> = {},
    returnBase64: boolean = false
  ): Promise<{
    success: boolean;
    imageUrl?: string;
    imageId?: string;
    base64Data?: string;
    error?: string;
  }> {
    const model = this.getModelConfig(modelId);
    if (!model) {
      return { success: false, error: `Unknown model: ${modelId}` };
    }

    if (!model.editCapabilities?.mask) {
      return { success: false, error: `Model ${modelId} does not support mask-based edits` };
    }

    try {
      const params = ParamParser.parse(
        prompt,
        { ...explicitParams, image: imageData, mask: maskData },
        model
      );

      const payload = ParamParser.toCFPayload(params, model);

      // Run the model via REST API
      const result = await this.runAI(model.id, payload, model);

      const extracted = await this.extractImageResult(result);
      if (!extracted) {
        return { success: false, error: 'No image in model response' };
      }

      if (returnBase64) {
        const base64Data = extracted.kind === 'base64'
          ? this.cleanBase64(extracted.data)
          : this.arrayBufferToBase64(extracted.data);

        return {
          success: true,
          base64Data,
        };
      }

      const uploadResult = await this.storage.uploadImage(
        extracted.kind === 'base64' ? this.cleanBase64(extracted.data) : extracted.data,
        {
          model: model.id,
          prompt: params.prompt,
          parameters: {
            size: params.size,
            steps: params.steps,
            seed: params.seed,
          },
        }
      );

      return {
        success: true,
        imageUrl: uploadResult.url,
        imageId: uploadResult.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * Get list of all available models
   */
  listModels(): Array<{
    id: string;
    name: string;
    description: string;
    provider: string;
    supportedSizes: string[];
    taskTypes: string[];
    editCapabilities?: ModelConfig['editCapabilities'];
  }> {
    const models: Array<{
      id: string;
      name: string;
      description: string;
      provider: string;
      supportedSizes: string[];
      taskTypes: string[];
      editCapabilities?: ModelConfig['editCapabilities'];
    }> = [];

    for (const [id, config] of this.models) {
      models.push({
        id,
        name: config.name,
        description: config.description,
        provider: config.provider,
        supportedSizes: config.limits.supportedSizes,
        taskTypes: config.supportedTasks,
        editCapabilities: config.editCapabilities,
      });
    }

    return models;
  }

  /**
   * Get parameter help for a model
   */
  getModelHelp(modelId: string): string {
    const model = this.getModelConfig(modelId);
    if (!model) {
      return `Unknown model: ${modelId}`;
    }
    return ParamParser.formatHelp(model);
  }

  /**
   * Cleanup expired images
   */
  async cleanupExpired(): Promise<number> {
    return this.storage.cleanupExpired();
  }

  /**
   * Convert base64 string to Uint8Array for multipart form data
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    // Handle data URI prefix
    const data = base64.replace(/^data:image\/\w+;base64,/, '');

    // Decode base64 to binary string
    const binaryString = atob(data);

    // Convert to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  }
}
