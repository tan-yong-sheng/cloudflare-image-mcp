// ============================================================================
// AI Client - Cloudflare AI API wrapper
// ============================================================================

import type { AIClient, ImageGenerationParams } from '../types.js';

export interface CloudflareAIConfig {
  /** Cloudflare account ID */
  accountId: string;
  /** Cloudflare API token */
  apiToken: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Cloudflare API response type
 */
interface CloudflareApiResponse {
  success: boolean;
  result?: {
    image?: string;
    [key: string]: unknown;
  };
  errors?: Array<{ message: string }>;
  messages?: Array<{ message: string }>;
}

/**
 * Create a Cloudflare AI client for local/Node.js deployment
 * @param config - Configuration object
 * @returns AI client instance
 */
export function createCloudflareAIClient(config: CloudflareAIConfig): AIClient {
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai`;
  const timeoutMs = config.timeoutMs || 120000;

  const headers = {
    'Authorization': `Bearer ${config.apiToken}`,
    'Content-Type': 'application/json',
  };

  async function makeRequest(
    modelName: string,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const url = `${baseUrl}/run/${modelName}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `API Error ${response.status}: ${errorText}`,
        };
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        // JSON response (FLUX models)
        const jsonResponse = (await response.json()) as CloudflareApiResponse;

        if (!jsonResponse.success) {
          return {
            success: false,
            error: jsonResponse.errors?.[0]?.message || 'Unknown API error',
          };
        }

        const imageData = jsonResponse.result?.image;
        if (!imageData) {
          return {
            success: false,
            error: 'No image data found in response',
          };
        }

        return {
          success: true,
          data: imageData,
        };
      } else {
        // Binary response (SDXL models)
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length < 100) {
          return {
            success: false,
            error: 'Invalid binary image data received',
          };
        }

        return {
          success: true,
          data: buffer.toString('base64'),
        };
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timed out. The image generation is taking longer than expected.',
        };
      }

      return {
        success: false,
        error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return {
    async generateImage(modelId: string, params: ImageGenerationParams): Promise<{
      success: boolean;
      data?: string;
      error?: string;
    }> {
      // Build payload based on model type
      const payload: Record<string, unknown> = {
        prompt: params.prompt,
      };

      // Add optional parameters if provided
      if (params.steps !== undefined) {
        payload.num_steps = params.steps;
      }
      if (params.seed !== undefined) {
        payload.seed = params.seed;
      }
      if (params.guidance !== undefined) {
        payload.guidance = params.guidance;
      }
      if (params.negative_prompt !== undefined) {
        payload.negative_prompt = params.negative_prompt;
      }
      if (params.width !== undefined) {
        payload.width = params.width;
      }
      if (params.height !== undefined) {
        payload.height = params.height;
      }
      if (params.image !== undefined) {
        payload.image = params.image;
      }
      if (params.mask !== undefined) {
        payload.mask = params.mask;
      }
      if (params.strength !== undefined) {
        payload.strength = params.strength;
      }

      return makeRequest(modelId, payload);
    },
  };
}
