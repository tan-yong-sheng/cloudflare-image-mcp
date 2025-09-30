import { CloudflareClient } from './cloudflare-client.js';
import { getModelByName, getAllSupportedModels, getModelDescriptions } from './models/index.js';
import { GenerateImageParams, MultiImageResult, SingleImageResult } from './types.js';
import { BaseModel } from './models/generation/base-model.js';
import { createStorage, createConfigFromEnv } from './storage/index.js';
import { generateParameterValidationMessage } from './utils/tool-schema-generator.js';

export class ImageService {
  private client: CloudflareClient;
  private storageProvider;
  private config: { cloudflareApiToken: string; cloudflareAccountId: string; defaultModel: string };
  private maxRetries: number;

  constructor(config: { cloudflareApiToken: string; cloudflareAccountId: string; defaultModel: string }) {
    this.config = config;
    this.client = new CloudflareClient(config);
    const storageConfig = createConfigFromEnv();
    const { provider } = createStorage(storageConfig);
    this.storageProvider = provider;

    // Configure retry behavior from environment
    this.maxRetries = parseInt(process.env.IMAGE_GENERATION_MAX_RETRIES || '3', 10);

    // Validate retry count
    if (this.maxRetries < 0 || this.maxRetries > 10) {
      console.warn(`[ImageService] Invalid IMAGE_GENERATION_MAX_RETRIES: ${this.maxRetries}, using default of 3`);
      this.maxRetries = 3;
    }

    console.log(`[ImageService] Initialized with ${this.maxRetries} max retries for rate limiting`);
  }

  async generateImage(params: GenerateImageParams): Promise<MultiImageResult> {
    const modelName = this.config.defaultModel;
    const numOutputs = Math.min(params.num_outputs || 1, 8); // Cap at 8 images

    try {
      const model = getModelByName(modelName);

      // Check for unsupported parameters and generate validation message
      const validationMessage = generateParameterValidationMessage(params, modelName, model.config);
      const ignoredParams = validationMessage
        ? validationMessage.match(/ignored: (.+)$/)?.[1]?.split(', ')
        : [];

      // Sequential processing with rate limiting to avoid 429 errors
      const results: SingleImageResult[] = [];

      for (let i = 0; i < numOutputs; i++) {
        // Create variation in seed for multiple images
        const seed = params.seed ? params.seed + i : undefined;

        // Add delay between requests to avoid rate limiting (1 second base delay)
        if (i > 0) {
          await this.delay(1000 * i); // Progressive delay: 1s, 2s, 3s...
        }

        try {
          const result = await this.generateSingleImageWithRetry({
            ...params,
            seed,
            sequence: i + 1
          }, model);
          results.push(result);
        } catch (error) {
          results.push({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            sequence: i + 1
          });
        }
      }

      const successfulCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;
      const successfulUrls = results.filter(r => r.success).map(r => r.imageUrl).filter(Boolean) as string[];

      return {
        success: successfulCount > 0,
        results,
        imageUrl: successfulUrls.length === 1 ? successfulUrls[0] : successfulUrls,
        ignoredParams,
        successfulCount,
        failedCount
      };

    } catch (error) {
      return {
        success: false,
        results: [{
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }],
        ignoredParams: [],
        successfulCount: 0,
        failedCount: numOutputs
      };
    }
  }

  private async generateSingleImage(
    params: GenerateImageParams & { sequence: number },
    model: BaseModel
  ): Promise<SingleImageResult> {
    try {
      // Build request payload
      const payload = model.buildRequestPayload(params.prompt, {
        negativePrompt: params.negativePrompt,
        size: params.size,
        steps: params.steps,
        guidance: params.guidance,
        seed: params.seed,
      });

      // Make API request with scaled timeout for multiple images
      const timeoutMs = 60000 + (params.sequence - 1) * 10000; // Base 60s + 10s per additional image
      const result = await this.client.generateImage(this.config.defaultModel, payload, timeoutMs);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Unknown error',
          sequence: params.sequence
        };
      }

      // Prepare image buffer
      let imageBuffer: Buffer;
      if (result.contentType?.includes('application/json')) {
        // Base64 encoded image
        const imageData = result.data as string;
        imageBuffer = Buffer.from(imageData, 'base64');
      } else {
        // Binary image data
        imageBuffer = result.data as Buffer;
      }

      // Save using storage provider
      const actualOutputSize = model.getActualOutputSize(params.size);
      const metadata = {
        prompt: params.prompt,
        model: this.config.defaultModel,
        timestamp: new Date(),
        parameters: {
          size: actualOutputSize,
          sequence: params.sequence
        }
      };
      const storageResult = await this.storageProvider.save(imageBuffer, metadata);

      return {
        success: true,
        imageUrl: storageResult.url,
        sequence: params.sequence
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sequence: params.sequence
      };
    }
  }

  async listModels(): Promise<string> {
    const models = getAllSupportedModels();
    const descriptions = getModelDescriptions();

    let result = 'Available Cloudflare Workers AI Image Generation Models:\n\n';

    for (const model of models) {
      const config = model.config;
      const description = descriptions[model.name] || 'Unknown model';

      result += `**${model.name}**\n`;
      result += `  Description: ${description}\n`;
      result += `  Recommended for: ${config.recommendedFor}\n`;
      result += `  Max steps: ${config.maxSteps}\n`;
      result += `  Output format: ${config.outputFormat}\n`;

      // Feature support summary
      const features = [];
      if (config.supportsNegativePrompt) features.push('negative prompts');
      if (config.supportsSize) features.push('custom size');
      if (config.supportsGuidance) features.push('guidance control');

      result += `  Supported features: ${features.join(', ') || 'basic generation only'}\n`;

      // Special notes
      if (config.notes) {
        result += `  Notes: ${config.notes}\n`;
      }

      result += '\n';
    }

    result += 'PARAMETER SUPPORT MATRIX:\n';
    result += 'Model                    | Size | Guidance | Negative\n';
    result += '-------------------------|------|----------|----------\n';

    for (const model of models) {
      const config = model.config;
      const modelShort = model.name.split('/').pop()?.slice(0, 20).padEnd(20) || '';
      const sizeSupport = config.supportsSize ? '✅' : '❌';
      const guidanceSupport = config.supportsGuidance ? '✅' : '❌';
      const negativeSupport = config.supportsNegativePrompt ? '✅' : '❌';

      result += `${modelShort} |  ${sizeSupport}  |    ${guidanceSupport}    |    ${negativeSupport}\n`;
    }

    result += '\n✅ = Supported, ❌ = Not supported\n';
    result += '\nFor detailed parameter documentation, see the README.md file.';

    return result;
  }

  /**
   * Generate single image with retry logic for rate limiting
   */
  private async generateSingleImageWithRetry(
    params: GenerateImageParams & { sequence: number },
    model: BaseModel
  ): Promise<SingleImageResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.generateSingleImage(params, model);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if it's a rate limit error (429 or capacity exceeded)
        const errorMessage = lastError.message.toLowerCase();
        const isRateLimitError = errorMessage.includes('429') ||
                                errorMessage.includes('capacity temporarily exceeded') ||
                                errorMessage.includes('capacity exceeded');

        if (isRateLimitError && attempt < this.maxRetries) {
          // Exponential backoff: 2s, 4s, 8s...
          const backoffDelay = Math.pow(2, attempt) * 1000;
          console.log(`[ImageService] Rate limit hit, retrying in ${backoffDelay}ms (attempt ${attempt}/${this.maxRetries})`);
          await this.delay(backoffDelay);
          continue;
        }

        // Non-retryable error or max retries exceeded
        throw lastError;
      }
    }

    throw lastError || new Error('Unknown error occurred');
  }

  /**
   * Simple delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}