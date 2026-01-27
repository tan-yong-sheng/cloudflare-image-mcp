// ============================================================================
// AI Client - Cloudflare AI API wrapper
// ============================================================================

import type { AIClient, ImageGenerationParams } from '../types.js';
import { getModelConfig } from '../models/index.js';

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
 * Convert base64 to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const length = binaryString.length;
  const uint8Array = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }
  return uint8Array;
}

/**
 * Create a Cloudflare AI client for local/Node.js deployment
 * @param config - Configuration object
 * @returns AI client instance
 */
export function createCloudflareAIClient(config: CloudflareAIConfig): AIClient {
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai`;
  const timeoutMs = config.timeoutMs || 120000;

  const jsonHeaders = {
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
        headers: jsonHeaders,
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

  async function makeMultipartRequest(
    modelName: string,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const url = `${baseUrl}/run/${modelName}`;
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

    // Build multipart body
    const parts: string[] = [];

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) continue;

      if (key === 'image' && typeof value === 'string') {
        // Handle base64 image data
        const uintArray = base64ToUint8Array(value);
        parts.push(`--${boundary}\r\n`);
        parts.push(`Content-Disposition: form-data; name="${key}"\r\n`);
        parts.push(`Content-Type: image/png\r\n\r\n`);
        const binaryChunk = new Uint8Array(uintArray.length);
        for (let i = 0; i < uintArray.length; i++) binaryChunk[i] = uintArray[i];
        parts.push(String.fromCharCode(...binaryChunk));
        parts.push('\r\n');
      } else {
        parts.push(`--${boundary}\r\n`);
        parts.push(`Content-Disposition: form-data; name="${key}"\r\n`);
        parts.push(`Content-Type: text/plain\r\n\r\n`);
        parts.push(`${String(value)}\r\n`);
      }
    }

    parts.push(`--${boundary}--\r\n`);

    const body = new TextEncoder().encode(parts.join(''));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
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
        // Binary response
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
        // Cloudflare expects image as an array of base64 strings
        payload.image = Array.isArray(params.image) ? params.image : [params.image];
      }
      if (params.mask !== undefined) {
        payload.mask = params.mask;
      }
      if (params.strength !== undefined) {
        payload.strength = params.strength;
      }

      // Check model config to determine input format
      const modelConfig = getModelConfig(modelId);
      const inputFormat = modelConfig?.inputFormat || 'json';

      if (inputFormat === 'multipart') {
        return makeMultipartRequest(modelId, payload);
      }

      return makeRequest(modelId, payload);
    },
  };
}
