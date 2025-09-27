import fetch from 'node-fetch';
import { CloudflareApiResponse, ServerConfig } from './types.js';

export class CloudflareClient {
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  async generateImage(
    modelName: string,
    payload: Record<string, any>
  ): Promise<{
    success: boolean;
    data?: string | Buffer;
    error?: string;
    contentType?: string;
  }> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.config.cloudflareAccountId}/ai/run/${modelName}`;

    const headers = {
      'Authorization': `Bearer ${this.config.cloudflareApiToken}`,
      'Content-Type': 'application/json',
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

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
          error: `API Error ${response.status}: ${errorText}`
        };
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        // JSON response (FLUX and Lucid Origin)
        const jsonResponse = await response.json() as CloudflareApiResponse;

        if (!jsonResponse.success) {
          return {
            success: false,
            error: jsonResponse.errors?.[0]?.message || 'Unknown API error'
          };
        }

        const imageData = jsonResponse.result?.image || jsonResponse.image;
        if (!imageData) {
          return {
            success: false,
            error: 'No image data found in response'
          };
        }

        return {
          success: true,
          data: imageData,
          contentType: 'application/json'
        };
      } else {
        // Binary response (SDXL models)
        const buffer = await response.buffer();

        if (buffer.length < 100) {
          return {
            success: false,
            error: 'Invalid binary image data received'
          };
        }

        return {
          success: true,
          data: buffer,
          contentType: contentType
        };
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timed out. The image generation is taking longer than expected.'
        };
      }

      return {
        success: false,
        error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}