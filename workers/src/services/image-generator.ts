// ============================================================================
// Image Generator Service - run-once / run-many generation seam
// ============================================================================
// One deep module serving both the OpenAI endpoint and the MCP tool module.
// Text-to-image, image-to-image, and masked edits all execute through
// runOnce (single) and runMany (batch); task-specific checks live inside.
// Cloudflare REST transport and R2 persistence sit behind injected
// adapters (real in production, in-memory in tests).

import type { Env, ModelConfig } from "../types.js";
import { ParamParser } from "./param-parser.js";
import { R2StorageService } from "./r2-storage.js";
import {
  RestAITransport,
  type AITransport,
  type ImageStore,
} from "./generation-adapters.js";
import type { GeneratedImage } from "../utils/image-request.js";
import { MODEL_CONFIGS } from "../config/models.js";
import { arrayBufferToBase64, cleanBase64 } from "../utils/encoding.js";

/**
 * One generation request. Images select the task: absent means
 * text-to-image, present means image-to-image, and a mask on top means
 * a masked edit (exactly one input image).
 */
export interface GenerationRequest {
  modelId: string;
  prompt: string | Record<string, any>;
  images?: string | string[];
  mask?: string;
  explicitParams?: Record<string, any>;
  returnBase64?: boolean;
}

export interface SingleResult {
  success: boolean;
  imageUrl?: string;
  imageId?: string;
  base64Data?: string;
  error?: string;
}

export interface BatchResult {
  success: boolean;
  images: GeneratedImage[];
  error?: string;
}

export class ImageGeneratorService {
  private transport: AITransport;
  private store: ImageStore;
  private models: Map<string, ModelConfig>;

  private async extractImageResult(
    result: unknown
  ): Promise<
    | { kind: "base64"; data: string }
    | { kind: "binary"; data: ArrayBuffer }
    | null
  > {
    // Common base64-returning shape
    if (typeof result === "string") {
      return { kind: "base64", data: result };
    }

    // Some models may return { image: "...base64..." }
    if (result && typeof result === "object" && "image" in result) {
      const maybeImage = (result as any).image;
      if (typeof maybeImage === "string") {
        return { kind: "base64", data: maybeImage };
      }
      if (maybeImage instanceof ArrayBuffer) {
        return { kind: "binary", data: maybeImage };
      }
      if (maybeImage instanceof Uint8Array) {
        const copied = new Uint8Array(maybeImage);
        const buf = copied.buffer.slice(
          copied.byteOffset,
          copied.byteOffset + copied.byteLength
        );
        return { kind: "binary", data: buf };
      }
      if (maybeImage instanceof ReadableStream) {
        const buf = await new Response(maybeImage).arrayBuffer();
        return { kind: "binary", data: buf };
      }
    }

    // Binary response directly
    if (result instanceof ArrayBuffer) {
      return { kind: "binary", data: result };
    }
    if (result instanceof Uint8Array) {
      const copied = new Uint8Array(result);
      const buf = copied.buffer.slice(
        copied.byteOffset,
        copied.byteOffset + copied.byteLength
      );
      return { kind: "binary", data: buf };
    }
    if (result instanceof ReadableStream) {
      const buf = await new Response(result).arrayBuffer();
      return { kind: "binary", data: buf };
    }

    return null;
  }

  constructor(
    env: Env,
    deps?: { transport?: AITransport; store?: ImageStore }
  ) {
    this.models = new Map(Object.entries(MODEL_CONFIGS));

    // Build AI accounts list:
    // 1. AI_ACCOUNTS (JSON array) if set and valid
    // 2. Else fall back to CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
    const fallback = [
      {
        account_id: env.CLOUDFLARE_ACCOUNT_ID,
        api_token: env.CLOUDFLARE_API_TOKEN,
      },
    ];

    /**
     * Which credential pool is active (observability label only, never a secret value):
     * 'AI_ACCOUNTS' when multi-account inference is configured, 'fallback' when
     * using the deploy credentials (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN).
     */
    let credentialSource: "AI_ACCOUNTS" | "fallback" = "fallback";
    let aiAccounts = fallback;

    if (env.AI_ACCOUNTS) {
      try {
        const parsed = JSON.parse(env.AI_ACCOUNTS) as {
          account_id: string;
          api_token: string;
        }[];
        if (!Array.isArray(parsed) || parsed.length === 0) {
          console.warn(
            "AI_ACCOUNTS is empty or not an array, falling back to deploy credentials"
          );
          aiAccounts = fallback;
        } else {
          const valid = parsed.every((a) => a.account_id && a.api_token);
          if (!valid) {
            console.warn(
              "AI_ACCOUNTS entries missing account_id/api_token, falling back to deploy credentials"
            );
            aiAccounts = fallback;
          } else {
            aiAccounts = parsed;
            credentialSource = "AI_ACCOUNTS";
          }
        }
      } catch {
        console.warn(
          "AI_ACCOUNTS is not valid JSON, falling back to deploy credentials"
        );
        aiAccounts = fallback;
      }
    } else {
      aiAccounts = fallback;
    }

    // Observability: name the active inference path (counts only, never values).
    if (credentialSource === "AI_ACCOUNTS") {
      console.warn(
        `AI inference path: AI_ACCOUNTS with ${aiAccounts.length} account(s)`
      );
    } else {
      console.warn("AI inference path: fallback to deploy credentials");
    }

    this.transport =
      deps?.transport ?? new RestAITransport(aiAccounts, credentialSource);
    this.store = deps?.store ?? new R2StorageService(env);
  }

  /**
   * Get model configuration by full model ID
   */
  getModelConfig(modelId: string): ModelConfig | null {
    return this.models.get(modelId) || null;
  }

  /**
   * Run one generation: text-to-image, image-to-image, or masked edit.
   * The task follows from the request shape (images present, mask present).
   */
  async runOnce(request: GenerationRequest): Promise<SingleResult> {
    const { modelId, explicitParams = {}, returnBase64 = false } = request;

    const model = this.getModelConfig(modelId);
    if (!model) {
      return { success: false, error: `Unknown model: ${modelId}` };
    }

    try {
      if (request.mask !== undefined) {
        return await this.runMaskedEdit(
          model,
          request,
          explicitParams,
          returnBase64
        );
      }
      if (request.images !== undefined) {
        return await this.runImageToImage(
          model,
          request,
          explicitParams,
          returnBase64
        );
      }
      return await this.runTextToImage(
        model,
        request,
        explicitParams,
        returnBase64
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Image generation failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Run the same request n times (seeds increment when one is given).
   * A mid-batch failure keeps completed images and reports the error.
   */
  async runMany(
    request: GenerationRequest,
    n: number = 1
  ): Promise<BatchResult> {
    const results: GeneratedImage[] = [];
    const baseExplicit = request.explicitParams ?? {};

    for (let i = 0; i < n; i++) {
      const seed =
        baseExplicit.seed !== undefined ? baseExplicit.seed + i : undefined;
      const result = await this.runOnce({
        ...request,
        explicitParams: {
          ...baseExplicit,
          seed,
        },
      });

      if (result.success) {
        if (request.returnBase64 && result.base64Data) {
          results.push({ b64_json: result.base64Data });
        } else if (result.imageUrl) {
          results.push({ url: result.imageUrl, id: result.imageId! });
        } else {
          return {
            success: false,
            images: results,
            error: "No image data returned",
          };
        }
      } else {
        return { success: false, images: results, error: result.error };
      }
    }

    return { success: true, images: results };
  }

  /**
   * Text-to-image: prompt in, stored image (or inline base64) out.
   */
  private async runTextToImage(
    model: ModelConfig,
    request: GenerationRequest,
    explicitParams: Record<string, any>,
    returnBase64: boolean
  ): Promise<SingleResult> {
    // Parse parameters
    const params = ParamParser.parse(request.prompt, explicitParams, model);

    // Build Cloudflare AI payload
    const payload = ParamParser.toCFPayload(params, model);

    // Run the model via the injected transport
    const result = await this.transport.run(model.id, payload, model);

    return await this.finishSingle(
      model,
      params.prompt,
      {
        size: params.size,
        steps: params.steps,
        seed: params.seed,
        guidance: params.guidance,
        negative_prompt: params.negative_prompt,
      },
      result,
      returnBase64
    );
  }

  /**
   * Image-to-image transformation (supports single or multiple inputs).
   */
  private async runImageToImage(
    model: ModelConfig,
    request: GenerationRequest,
    explicitParams: Record<string, any>,
    returnBase64: boolean
  ): Promise<SingleResult> {
    if (!model.supportedTasks.includes("image-to-image")) {
      return {
        success: false,
        error: `Model ${model.id} does not support image-to-image`,
      };
    }

    if (model.editCapabilities?.mask === "required") {
      return {
        success: false,
        error: `Model ${model.id} requires a mask; use /v1/images/edits with mask (masked edit).`,
      };
    }

    // Handle multi-image: validate count against model limits
    const images = Array.isArray(request.images)
      ? request.images
      : [request.images as string];
    const maxInput = model.maxInputImages || 1;
    if (images.length > maxInput) {
      return {
        success: false,
        error: `Model ${model.id} supports up to ${maxInput} input image(s), got ${images.length}`,
      };
    }

    // For single image, set image param for ParamParser
    const mergedExplicit = { ...explicitParams, image: images[0] };

    // Parse parameters with image
    const params = ParamParser.parse(request.prompt, mergedExplicit, model);

    // Build payload with image
    const payload = ParamParser.toCFPayload(params, model);

    // Run the model via the injected transport (pass images for multipart handling)
    const result = await this.transport.run(model.id, payload, model, images);

    return await this.finishSingle(
      model,
      params.prompt,
      {
        size: params.size,
        steps: params.steps,
        seed: params.seed,
      },
      result,
      returnBase64
    );
  }

  /**
   * Inpainting / image editing with mask (exactly one input image).
   */
  private async runMaskedEdit(
    model: ModelConfig,
    request: GenerationRequest,
    explicitParams: Record<string, any>,
    returnBase64: boolean
  ): Promise<SingleResult> {
    if (!model.editCapabilities?.mask) {
      return {
        success: false,
        error: `Model ${model.id} does not support mask-based edits`,
      };
    }

    if (Array.isArray(request.images)) {
      return {
        success: false,
        error:
          `mask can only be used with a single image, got ` +
          `${request.images.length} input image(s)`,
      };
    }

    if (!request.images) {
      return {
        success: false,
        error: "image is required for masked edits",
      };
    }

    const params = ParamParser.parse(
      request.prompt,
      { ...explicitParams, image: request.images, mask: request.mask },
      model
    );

    const payload = ParamParser.toCFPayload(params, model);

    // Run the model via the injected transport
    const result = await this.transport.run(model.id, payload, model);

    return await this.finishSingle(
      model,
      params.prompt,
      {
        size: params.size,
        steps: params.steps,
        seed: params.seed,
      },
      result,
      returnBase64
    );
  }

  /**
   * Interpret one transport result: extract image bytes, then either
   * return them inline or persist via the injected store.
   */
  private async finishSingle(
    model: ModelConfig,
    prompt: string,
    parameters: {
      size?: string;
      steps?: number;
      seed?: number;
      guidance?: number;
      negative_prompt?: string;
    },
    result: unknown,
    returnBase64: boolean
  ): Promise<SingleResult> {
    // Extract image from response (base64 string OR binary)
    const extracted = await this.extractImageResult(result);
    if (!extracted) {
      return { success: false, error: "No image in model response" };
    }

    // If base64 format requested, return directly without uploading
    if (returnBase64) {
      const base64Data =
        extracted.kind === "base64"
          ? cleanBase64(extracted.data)
          : arrayBufferToBase64(extracted.data);

      return {
        success: true,
        base64Data,
      };
    }

    // Upload to R2 storage
    const uploadResult = await this.store.uploadImage(
      extracted.kind === "base64"
        ? cleanBase64(extracted.data)
        : extracted.data,
      {
        model: model.id,
        prompt,
        parameters,
      }
    );

    return {
      success: true,
      imageUrl: uploadResult.url,
      imageId: uploadResult.id,
    };
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
    editCapabilities?: ModelConfig["editCapabilities"];
  }> {
    const models: Array<{
      id: string;
      name: string;
      description: string;
      provider: string;
      supportedSizes: string[];
      taskTypes: string[];
      editCapabilities?: ModelConfig["editCapabilities"];
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
    return this.store.cleanupExpired();
  }
}
