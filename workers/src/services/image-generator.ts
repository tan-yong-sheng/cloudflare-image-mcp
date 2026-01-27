// ============================================================================
// Image Generator Service - Routes to appropriate Cloudflare AI model
// ============================================================================

import type { Env, ModelConfig, ParsedParams } from '../types.js';
import { ParamParser } from './param-parser.js';
import { R2StorageService } from './r2-storage.js';
import { MODEL_CONFIGS } from '../config/models.js';

export class ImageGeneratorService {
  private ai: Ai;
  private storage: R2StorageService;
  private models: Map<string, ModelConfig>;

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
    explicitParams: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    imageUrl?: string;
    imageId?: string;
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

      // Extract image from response
      const base64Image = typeof result === 'string' ? result : (result?.image || result);
      if (!base64Image) {
        return { success: false, error: 'No image in model response' };
      }

      // Upload to R2 storage
      const uploadResult = await this.storage.uploadImage(base64Image, {
        model: model.id,
        prompt: params.prompt,
        parameters: {
          size: params.size,
          steps: params.steps,
          seed: params.seed,
          guidance: params.guidance,
          negative_prompt: params.negative_prompt,
        },
      });

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
    explicitParams: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    images: Array<{ url: string; id: string }>;
    error?: string;
  }> {
    const results: Array<{ url: string; id: string }> = [];

    for (let i = 0; i < n; i++) {
      const seed = explicitParams.seed ? explicitParams.seed + i : undefined;
      const result = await this.generateImage(modelId, prompt, {
        ...explicitParams,
        seed,
      });

      if (result.success && result.imageUrl) {
        results.push({ url: result.imageUrl, id: result.imageId! });
      } else {
        return { success: false, images: results, error: result.error };
      }
    }

    return { success: true, images: results };
  }

  /**
   * Image-to-image transformation
   */
  async generateImageToImage(
    modelId: string,
    prompt: string | Record<string, any>,
    imageData: string,
    strength: number = 0.5,
    explicitParams: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    imageUrl?: string;
    imageId?: string;
    error?: string;
  }> {
    const model = this.getModelConfig(modelId);
    if (!model) {
      return { success: false, error: `Unknown model: ${modelId}` };
    }

    if (!model.supportedTasks.includes('image-to-image')) {
      return { success: false, error: `Model ${modelId} does not support image-to-image` };
    }

    try {
      // Parse parameters with image
      const params = ParamParser.parse(
        prompt,
        { ...explicitParams, image: imageData, strength },
        model
      );

      // Build payload with image
      const payload = ParamParser.toCFPayload(params, model);

      // Run the model
      let result: any;
      if (model.inputFormat === 'multipart') {
        const form = new FormData();
        for (const [key, value] of Object.entries(payload)) {
          if (value !== undefined && value !== null) {
            // For image fields, convert base64 to array of integers (0-255)
            if (key === 'image' && typeof value === 'string') {
              const intArray = this.base64ToUint8Array(value);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              form.append(key, intArray as any);
            } else {
              form.append(key, String(value));
            }
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await (this.ai as any).run(model.id, {
          multipart: {
            body: form,
            contentType: 'multipart/form-data',
          },
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await (this.ai as any).run(model.id, payload);
      }

      const base64Image = typeof result === 'string' ? result : (result?.image || result);
      if (!base64Image) {
        return { success: false, error: 'No image in model response' };
      }

      const uploadResult = await this.storage.uploadImage(base64Image, {
        model: model.id,
        prompt: params.prompt,
        parameters: {
          size: params.size,
          steps: params.steps,
          seed: params.seed,
        },
      });

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
   * Inpainting / image editing with mask
   */
  async generateInpaint(
    modelId: string,
    prompt: string,
    imageData: string,
    maskData: string,
    explicitParams: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    imageUrl?: string;
    imageId?: string;
    error?: string;
  }> {
    const model = this.getModelConfig(modelId);
    if (!model) {
      return { success: false, error: `Unknown model: ${modelId}` };
    }

    if (!model.supportedTasks.includes('inpainting')) {
      return { success: false, error: `Model ${modelId} does not support inpainting` };
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

      const base64Image = typeof result === 'string' ? result : (result?.image || result);
      if (!base64Image) {
        return { success: false, error: 'No image in model response' };
      }

      const uploadResult = await this.storage.uploadImage(base64Image, {
        model: model.id,
        prompt: params.prompt,
        parameters: {
          size: params.size,
          steps: params.steps,
          seed: params.seed,
        },
      });

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
    capabilities: string[];
    taskTypes: string[];
  }> {
    const models: Array<{
      id: string;
      name: string;
      description: string;
      capabilities: string[];
      taskTypes: string[];
    }> = [];

    for (const [id, config] of this.models) {
      const capabilities: string[] = [];
      if (config.parameters.seed) capabilities.push('seed');
      if (config.parameters.width) capabilities.push('custom-size');
      if (config.parameters.guidance) capabilities.push('guidance');
      if (config.parameters.negative_prompt) capabilities.push('negative-prompt');

      models.push({
        id,
        name: config.name,
        description: config.description,
        capabilities,
        taskTypes: config.supportedTasks,
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
