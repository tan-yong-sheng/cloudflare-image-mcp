// ============================================================================
// OpenAI-Compatible REST API Endpoint
// Implements /v1/images/generations, /v1/images/edits, /v1/images/variations
// ============================================================================

import type { Env, OpenAIImageResponse } from "../types.js";
import { ImageGeneratorService } from "../services/image-generator.js";
import { corsHeaders } from "../utils/cors.js";
import {
  buildImageResponse,
  collectInputImages,
  type CollectConfig,
} from "../utils/image-request.js";

// Per-route input configs: which CF params to extract and which defaults
// apply. Handlers keep routing only; gathering lives in the shared module.
const GENERATIONS_CONFIG: CollectConfig = {
  defaultModel: "@cf/black-forest-labs/flux-1-schnell",
  params: ["size", "steps", "seed", "guidance", "negative_prompt"],
  imageKeys: [],
  includePrompt: true,
};

const EDITS_CONFIG: CollectConfig = {
  defaultModel: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  params: ["size", "steps", "seed", "guidance", "negative_prompt", "strength"],
  imageKeys: ["image", "image_b64"],
  maskKeys: ["mask", "mask_b64"],
  includeMask: true,
  includePrompt: true,
};

const VARIATIONS_CONFIG: CollectConfig = {
  defaultModel: "@cf/black-forest-labs/flux-2-klein-4b",
  params: ["size", "steps", "seed", "strength"],
  imageKeys: ["image"],
  // Default strength for variations (more faithful to original)
  defaults: { strength: 0.7 },
};

export class OpenAIEndpoint {
  private generator: ImageGeneratorService;
  private corsHeaders: Record<string, string>;

  constructor(env: Env) {
    this.generator = new ImageGeneratorService(env);
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
      // Route to handler
      if (path === "/v1/images/generations" && request.method === "POST") {
        return this.handleGenerations(request);
      }
      if (path === "/v1/images/edits" && request.method === "POST") {
        return this.handleEdits(request);
      }
      if (path === "/v1/images/variations" && request.method === "POST") {
        return this.handleVariations(request);
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

      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" },
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
    const { prompt, modelId, n, returnBase64, explicitParams } =
      await collectInputImages(request, GENERATIONS_CONFIG);

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
    const result = await this.generator.generateImages(
      modelId,
      prompt,
      Math.min(n, 8), // Cap at 8 images
      explicitParams,
      returnBase64
    );

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: { message: result.error, type: "api_error" },
        }),
        {
          status: 500,
          headers: { ...this.corsHeaders, "Content-Type": "application/json" },
        }
      );
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
          },
        }),
        {
          status: 400,
          headers: { ...this.corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const count = Math.min(n, 8);

    // Route to appropriate service method
    let result;
    if (maskData) {
      // Inpainting (masked edit) — single image only
      result = await this.generator.generateInpaints(
        modelId,
        prompt,
        imageDataArr[0],
        maskData,
        count,
        explicitParams,
        returnBase64
      );
    } else {
      // Image-to-image — pass single string or array depending on count
      const imageInput =
        imageDataArr.length === 1 ? imageDataArr[0] : imageDataArr;
      result = await this.generator.generateImageToImages(
        modelId,
        prompt,
        imageInput,
        count,
        explicitParams,
        returnBase64
      );
    }

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: { message: result.error, type: "api_error" },
        }),
        {
          status: 500,
          headers: { ...this.corsHeaders, "Content-Type": "application/json" },
        }
      );
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
    const result = await this.generator.generateImageToImages(
      modelId,
      "", // Empty prompt for variations
      imageInput,
      count,
      explicitParams,
      returnBase64
    );

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: { message: result.error, type: "api_error" },
        }),
        {
          status: 500,
          headers: { ...this.corsHeaders, "Content-Type": "application/json" },
        }
      );
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
          owned_by: m.id.split("/")[0],
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
        owned_by: modelId.split("/")[0],
        description: help,
      }),
      {
        headers: { ...this.corsHeaders, "Content-Type": "application/json" },
      }
    );
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
