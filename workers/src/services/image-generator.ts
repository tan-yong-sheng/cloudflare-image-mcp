// ============================================================================
// Image Generator Service - Routes to appropriate Cloudflare AI model
// ============================================================================

import type { Env, ModelConfig } from '../types.js';
import { ParamParser } from './param-parser.js';
import { R2StorageService } from './r2-storage.js';
import { MODEL_CONFIGS } from '../config/models.js';

export class ImageGeneratorService {
  private ai: Ai;
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
        // Uint8Array.buffer is typed as ArrayBufferLike; slice() produces an ArrayBuffer
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
      // Uint8Array.buffer is typed as ArrayBufferLike; slice() produces an ArrayBuffer
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
    // Convert ArrayBuffer to base64 without Node Buffer.
    // Use chunking to avoid quadratic string concatenation and stack issues.
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
    this.ai = env.AI;
    this.storage = new R2StorageService(env);
    this.models = new Map(Object.entries(MODEL_CONFIGS));
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

      // Run the model
      let result: any;
      if (model.inputFormat === 'multipart') {
        // FLUX 2 models require multipart form data
        // Build multipart body as ReadableStream
        const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
        const parts: string[] = [];

        for (const [key, value] of Object.entries(payload)) {
          if (value !== undefined && value !== null) {
            parts.push(`--${boundary}\r\n`);
            if (key === 'image' && typeof value === 'string' && value.length > 100) {
              // For image fields in img2img mode
              const intArray = this.base64ToUint8Array(value);
              parts.push(`Content-Disposition: form-data; name="${key}"\r\n`);
              parts.push(`Content-Type: image/png\r\n\r\n`);
              parts.push(String.fromCharCode(...intArray));
              parts.push('\r\n');
            } else {
              parts.push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`);
              parts.push(`${String(value)}\r\n`);
            }
          }
        }
        parts.push(`--${boundary}--\r\n`);

        const body = new TextEncoder().encode(parts.join(''));
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(body);
            controller.close();
          },
        });

        const contentType = `multipart/form-data; boundary=${boundary}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await (this.ai as any).run(model.id, {
          multipart: {
            body: stream,
            contentType,
          },
        });
      } else {
        // Standard JSON format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await (this.ai as any).run(model.id, payload);
      }

      // Extract image from response (base64 string OR binary stream/bytes)
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

      // Run the model
      let result: any;
      if (model.inputFormat === 'multipart') {
        // Build multipart form data using FormData + Response serialization
        const form = new FormData();
        for (const [key, value] of Object.entries(payload)) {
          if (value !== undefined && value !== null && key !== 'image') {
            form.append(key, String(value));
          }
        }
        // Append image(s) as binary blobs
        for (const img of images) {
          const cleanedB64 = this.cleanBase64(img);
          const bytes = this.base64ToUint8Array(cleanedB64);
          form.append('image', new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' }));
        }

        // Use Response constructor to serialize FormData with proper boundary
        const formResponse = new Response(form);
        const formStream = formResponse.body;
        const formContentType = formResponse.headers.get('content-type')!;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await (this.ai as any).run(model.id, {
          multipart: {
            body: formStream,
            contentType: formContentType,
          },
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await (this.ai as any).run(model.id, payload);
      }

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.ai as any).run(model.id, payload);

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
