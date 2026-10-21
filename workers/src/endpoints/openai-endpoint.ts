// ============================================================================
// OpenAI-Compatible REST API Endpoint
// Implements /v1/images/generations, /v1/images/edits, /v1/images/variations
// ============================================================================

import type { Env, OpenAIImageResponse } from "../types.js";
import type { ProviderPools } from "../services/provider-pools.js";
import {
  ImageGeneratorService,
  type BatchResult,
} from "../services/image-generator.js";
import { corsHeaders } from "../utils/cors.js";
import {
  buildImageResponse,
  CollectionError,
  collectInputImages,
  type CollectConfig,
} from "../utils/image-request.js";
import { DEFAULT_MODEL } from "../config/models.js";
import {
  resolveDefaultModel,
  type ExposureOverlay,
} from "../config/exposure-overlay.js";

/**
 * The OpenAI `owned_by` value. Namespaced ids (@cf/{provider}/{model}) report
 * their namespace; an un-namespaced id (agnes-image-2.5-flash) has none, so it
 * reports the provider that serves it instead of echoing the whole model id.
 */
function ownedBy(id: string, provider: string | undefined): string {
  return id.includes("/") ? id.split("/")[0] : provider || id;
}

// Per-route input configs: which CF params to extract and which defaults
// apply. Handlers keep routing only; gathering lives in the shared module.
const GENERATIONS_CONFIG: CollectConfig = {
  // R0: configured default replaces the hardcoded id.
  defaultModel: DEFAULT_MODEL,
  // `num_steps` is the SDXL-family spelling of the step count. The
  // client sends the name the model declares, so both must be
  // collected or the control is dead on those models.
  params: ["size", "steps", "num_steps", "seed", "guidance", "negative_prompt"],
  imageKeys: [],
  includePrompt: true,
};

const EDITS_CONFIG: CollectConfig = {
  defaultModel: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  params: [
    "size",
    "steps",
    "num_steps",
    "seed",
    "guidance",
    "negative_prompt",
    "strength",
  ],
  imageKeys: ["image", "image_b64"],
  maskKeys: ["mask", "mask_b64"],
  includeMask: true,
  includePrompt: true,
};

const VARIATIONS_CONFIG: CollectConfig = {
  defaultModel: "@cf/black-forest-labs/flux-2-klein-4b",
  params: ["size", "steps", "num_steps", "seed", "strength"],
  imageKeys: ["image"],
  // Default strength for variations (more faithful to original)
  defaults: { strength: 0.7 },
};

export class OpenAIEndpoint {
  private generator: ImageGeneratorService;
  private corsHeaders: Record<string, string>;
  /** R1b overlay: the D1 is_default row rewrites the model-less default. */
  private defaultModel: string;

  constructor(
    env: Env,
    deps?: { pools?: ProviderPools; exposureOverlay?: ExposureOverlay }
  ) {
    this.generator = new ImageGeneratorService(env, {
      pools: deps?.pools,
      exposureOverlay: deps?.exposureOverlay,
    });
    this.defaultModel = resolveDefaultModel(
      DEFAULT_MODEL,
      deps?.exposureOverlay ?? null
    );
    this.corsHeaders = corsHeaders;
  }

  /**
   * Handle incoming request
   */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: this.corsHeaders });
    }

    try {
      // Route to handler. Awaited (not bare-returned) so handler
      // rejections — e.g. malformed JSON bodies — land in the catch below.
      if (path === "/v1/images/generations" && request.method === "POST") {
        return await this.handleGenerations(request);
      }
      if (path === "/v1/images/edits" && request.method === "POST") {
        return await this.handleEdits(request);
      }
      if (path === "/v1/images/variations" && request.method === "POST") {
        return await this.handleVariations(request);
      }
      if (path === "/v1/models" && request.method === "GET") {
        return this.handleListModels();
      }
      if (path.startsWith("/v1/models/") && request.method === "GET") {
        const modelId = decodeURIComponent(
          path.substring("/v1/models/".length)
        );
        return this.handleDescribeModel(modelId);
      }

      return new Response(
        JSON.stringify({
          error: {
            message: "Not found",
            type: "invalid_request_error",
            code: null,
          },
        }),
        {
          status: 404,
          headers: {
            ...this.corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error) {
      // Caller-input failures surface here (malformed JSON, non-object
      // body, bad count, malformed multipart inside collectInputImages):
      // a bad request, not a service failure.
      if (this.isCallerInputError(error)) {
        const message =
          error instanceof SyntaxError
            ? "Invalid JSON in request body"
            : error instanceof Error
              ? error.message
              : String(error);
        return new Response(
          JSON.stringify({
            error: {
              message,
              type: "invalid_request_error",
              code: null,
            },
          }),
          {
            status: 400,
            headers: {
              ...this.corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
      return this.errorResponse(error);
    }
  }

  /**
   * request.json() rejects with a SyntaxError when the body is not valid
   * JSON; collectInputImages throws CollectionError for non-object
   * bodies, bad counts, and malformed multipart. The handle try-block
   * only wraps routing plus input collection, so either surfacing here
   * can only come from body parsing: both are 400s, not failures.
   */
  private isCallerInputError(error: unknown): boolean {
    return error instanceof SyntaxError || error instanceof CollectionError;
  }

  /**
   * POST /v1/images/generations
   * Text-to-image generation (OpenAI-compatible)
   */
  private async handleGenerations(request: Request): Promise<Response> {
    const { prompt, modelId, n, returnBase64, explicitParams } =
      await collectInputImages(request, {
        ...GENERATIONS_CONFIG,
        defaultModel: this.defaultModel,
      });

    // Validate required fields
    if (!prompt) {
      return new Response(
        JSON.stringify({
          error: {
            message: "prompt is required",
            type: "invalid_request_error",
            param: "prompt",
            code: null,
          },
        }),
        {
          status: 400,
          headers: { ...this.corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate images
    const result = await this.generator.runMany(
      { modelId, prompt, explicitParams, returnBase64 },
      Math.min(n, 8) // Cap at 8 images
    );

    if (!result.success) {
      return this.failureResponse(result, {
        returnBase64,
        origin: new URL(request.url).origin,
      });
    }

    // Build response based on response_format
    const response: OpenAIImageResponse = buildImageResponse(result.images, {
      returnBase64,
      origin: new URL(request.url).origin,
    });

    return new Response(JSON.stringify(response), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" },
    });
  }

  /**
   * POST /v1/images/edits
   * Image editing / img2img / multi-image (OpenAI-compatible)
   * Supports --key=value params embedded in prompt for CF-specific params
   */
  private async handleEdits(request: Request): Promise<Response> {
    const {
      imageDataArr,
      maskData,
      prompt,
      modelId,
      n,
      returnBase64,
      explicitParams,
    } = await collectInputImages(request, EDITS_CONFIG);

    if (imageDataArr.length === 0 || !prompt) {
      return new Response(
        JSON.stringify({
          error: {
            message: "image and prompt are required",
            type: "invalid_request_error",
            code: null,
          },
        }),
        {
          status: 400,
          headers: { ...this.corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const count = Math.min(n, 8);

    // Route to the seam: mask presence selects the masked-edit path,
    // image count selects single vs multi-reference inside the service.
    const imageInput =
      imageDataArr.length === 1 ? imageDataArr[0] : imageDataArr;
    const result = maskData
      ? await this.generator.runMany(
          {
            modelId,
            prompt,
            images: imageDataArr[0],
            mask: maskData,
            explicitParams,
            returnBase64,
          },
          count
        )
      : await this.generator.runMany(
          {
            modelId,
            prompt,
            images: imageInput,
            explicitParams,
            returnBase64,
          },
          count
        );

    if (!result.success) {
      return this.failureResponse(result, {
        returnBase64,
        origin: new URL(request.url).origin,
      });
    }

    // Build OpenAI-compatible response (same pattern as handleGenerations)
    const response: OpenAIImageResponse = buildImageResponse(result.images, {
      returnBase64,
      origin: new URL(request.url).origin,
    });

    return new Response(JSON.stringify(response), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" },
    });
  }

  /**
   * POST /v1/images/variations
   * Image variations (OpenAI-compatible)
   * Supports --key=value params embedded in prompt for CF-specific params
   */
  private async handleVariations(request: Request): Promise<Response> {
    const { imageDataArr, modelId, n, returnBase64, explicitParams } =
      await collectInputImages(request, VARIATIONS_CONFIG);

    if (imageDataArr.length === 0) {
      return new Response(
        JSON.stringify({
          error: {
            message: "image is required",
            type: "invalid_request_error",
            code: null,
          },
        }),
        {
          status: 400,
          headers: { ...this.corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const count = Math.min(n, 8);

    const imageInput =
      imageDataArr.length === 1 ? imageDataArr[0] : imageDataArr;
    const result = await this.generator.runMany(
      {
        modelId,
        prompt: "", // Empty prompt for variations
        images: imageInput,
        explicitParams,
        returnBase64,
      },
      count
    );

    if (!result.success) {
      return this.failureResponse(result, {
        returnBase64,
        origin: new URL(request.url).origin,
      });
    }

    // Build OpenAI-compatible response
    const response: OpenAIImageResponse = buildImageResponse(result.images, {
      returnBase64,
      origin: new URL(request.url).origin,
    });

    return new Response(JSON.stringify(response), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" },
    });
  }

  /**
   * GET /v1/models
   * List available models
   */
  private handleListModels(): Response {
    const models = this.generator.listModels();

    return new Response(
      JSON.stringify({
        data: models.map((m) => ({
          id: m.id,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: ownedBy(m.id, m.provider),
        })),
        object: "list",
      }),
      {
        headers: { ...this.corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  /**
   * GET /v1/models/:model
   * Describe a specific model
   */
  private handleDescribeModel(modelId: string): Response {
    const help = this.generator.getModelHelp(modelId);

    return new Response(
      JSON.stringify({
        id: modelId,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: ownedBy(
          modelId,
          this.generator.getModelConfig(modelId)?.provider
        ),
        description: help,
      }),
      {
        headers: { ...this.corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  /**
   * Map a failed seam result to the OpenAI envelope. Validation failures
   * (invalid caller input) are 400 invalid_request_error; operational
   * failures are 500 api_error. Every envelope carries code: null.
   *
   * A batch that failed part-way still carries the images that succeeded
   * (runMany's contract), so they ride along under `data`. Without them the
   * caller loses working output it already paid for — ask for 4, get 2, and
   * the two that worked are discarded because one failed. The error field
   * still explains the failure and the status stays 4xx/5xx, so a caller
   * that only checks the status is unaffected; one that knows to look can
   * recover the partial result.
   */
  private failureResponse(
    result: BatchResult,
    options: { returnBase64: boolean; origin: string }
  ): Response {
    const validation = result.validationError === true;
    const body: Record<string, unknown> = {
      error: {
        message: result.error,
        type: validation ? "invalid_request_error" : "api_error",
        code: null,
      },
    };
    if (result.images.length > 0) {
      const partial = buildImageResponse(result.images, {
        returnBase64: options.returnBase64,
        origin: options.origin,
      });
      body["created"] = partial.created;
      body["data"] = partial.data;
    }
    return new Response(JSON.stringify(body), {
      status: validation ? 400 : 500,
      headers: { ...this.corsHeaders, "Content-Type": "application/json" },
    });
  }

  /**
   * Create error response
   */
  private errorResponse(error: unknown): Response {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        error: {
          message,
          type: "api_error",
          code: null,
        },
      }),
      {
        status: 500,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}
