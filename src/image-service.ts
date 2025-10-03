import { CloudflareClient } from './cloudflare-client.js';
import { getModelByName, getAllSupportedModels, getModelDescriptions } from './models/index.js';
import { GenerateImageParams, MultiImageResult, SingleImageResult } from './types.js';
import { BaseModel } from './models/generation/base-model.js';
import { createStorage, createConfigFromEnv } from './storage/index.js';
import { generateParameterValidationMessage } from './utils/tool-schema-generator.js';
import { createLogger } from './utils/logger.js';

export class ImageService {
  private client: CloudflareClient;
  private storageProvider;
  private config: { cloudflareApiToken: string; cloudflareAccountId: string; defaultModel: string };
  private maxRetries: number;
  private maxConcurrency: number;
  private batchDelayMs: number;
  private logger = createLogger('ImageService');

  constructor(config: { cloudflareApiToken: string; cloudflareAccountId: string; defaultModel: string }) {
    this.config = config;
    this.client = new CloudflareClient(config);
    const storageConfig = createConfigFromEnv();
    const { provider } = createStorage(storageConfig);
    this.storageProvider = provider;

    // Configure retry behavior from environment
    this.maxRetries = parseInt(process.env.IMAGE_GENERATION_MAX_RETRIES || '3', 10);

    // Configure concurrency from environment (default 4 as requested)
    this.maxConcurrency = parseInt(process.env.IMAGE_GENERATION_CONCURRENCY || '2', 10);

    // Configure batch delay from environment (default 1 second as requested)
    this.batchDelayMs = parseInt(process.env.IMAGE_GENERATION_BATCH_DELAY_MS || '1000', 10);

    // Validate retry count
    if (this.maxRetries < 0 || this.maxRetries > 10) {
      this.logger.warn(`Invalid IMAGE_GENERATION_MAX_RETRIES: ${this.maxRetries}, using default of 3`);
      this.maxRetries = 3;
    }

    // Validate concurrency count (1-8 to be reasonable)
    if (this.maxConcurrency < 1 || this.maxConcurrency > 8) {
      this.logger.warn(`Invalid IMAGE_GENERATION_CONCURRENCY: ${this.maxConcurrency}, using default of 2`);
      this.maxConcurrency = 2;
    }

    // Validate batch delay (100ms to 10s range)
    if (this.batchDelayMs < 100 || this.batchDelayMs > 10000) {
      this.logger.warn(`Invalid IMAGE_GENERATION_BATCH_DELAY_MS: ${this.batchDelayMs}, using default of 1000`);
      this.batchDelayMs = 1000;
    }

    this.logger.info(`Initialized with ${this.maxRetries} max retries, ${this.maxConcurrency} max concurrency, ${this.batchDelayMs}ms batch delay`);
  }

  async generateImage(params: GenerateImageParams): Promise<MultiImageResult> {
    const modelName = this.config.defaultModel;
    const numOutputs = Math.min(params.num_outputs || 1, 8); // Cap at 8 images
    const startTime = Date.now();

    try {
      const model = getModelByName(modelName);

      // Check for unsupported parameters and generate validation message
      const validationMessage = generateParameterValidationMessage(params, modelName, model.config);
      const ignoredParams = validationMessage
        ? validationMessage.match(/ignored: (.+)$/)?.[1]?.split(', ')
        : [];

      this.logger.info(`Generating ${numOutputs} images with concurrency ${this.maxConcurrency}`);

      // Create image generation requests
      const imageRequests: Array<GenerateImageParams & { sequence: number }> = [];
      for (let i = 0; i < numOutputs; i++) {
        const seed = params.seed ? params.seed + i : undefined;
        imageRequests.push({
          ...params,
          seed,
          sequence: i + 1
        });
      }

      // Split requests into chunks based on concurrency
      const chunks = this.chunkArray(imageRequests, this.maxConcurrency);
      let currentConcurrency = this.maxConcurrency;
      const results: SingleImageResult[] = [];

      // Process each chunk
      for (let batchIndex = 0; batchIndex < chunks.length; batchIndex++) {
        const chunk = chunks[batchIndex];

        this.logger.info(`Processing batch ${batchIndex + 1}/${chunks.length} (${chunk.length} concurrent requests)`);

        // Process chunk concurrently
        const batchPromises = chunk.map(request =>
          this.generateSingleImageWithRetry(request, model)
        );

        const batchResults = await Promise.allSettled(batchPromises);
        const rateLimitErrors = this.count429Errors(batchResults);

        // Process batch results
        const processedResults = this.processBatchResults(batchResults);
        results.push(...processedResults);

        const batchSuccessCount = processedResults.filter(r => r.success).length;
        const batchFailedCount = processedResults.filter(r => !r.success).length;

        this.logger.info(`Batch ${batchIndex + 1} completed: ${batchSuccessCount} success, ${batchFailedCount} failed`);

        // Adaptive concurrency reduction for rate limit errors - trigger on ANY 429 error
        if (rateLimitErrors > 0 && currentConcurrency > 1) {
          currentConcurrency = Math.max(1, Math.floor(currentConcurrency / 2));
          this.logger.rateLimit(`Rate limit errors detected (${rateLimitErrors}/${chunk.length}), reducing concurrency to ${currentConcurrency}`);

          // Regenerate remaining chunks with reduced concurrency
          if (batchIndex < chunks.length - 1) {
            const remainingRequests = chunks.slice(batchIndex + 1).flat();
            const remainingChunks = this.chunkArray(remainingRequests, currentConcurrency);
            chunks.splice(batchIndex + 1, chunks.length - batchIndex - 1, ...remainingChunks);
          }
        }

        // Rate limiting delay between batches (except last batch)
        if (batchIndex < chunks.length - 1) {
          this.logger.debug(`Waiting ${this.batchDelayMs}ms before next batch`);
          await this.delay(this.batchDelayMs);
        }
      }

      const totalTime = Date.now() - startTime;
      const successfulCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;
      const successfulUrls = results.filter(r => r.success).map(r => r.imageUrl).filter(Boolean) as string[];

      this.logger.info(`Generated ${successfulCount}/${numOutputs} images successfully in ${totalTime}ms`);

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
          this.logger.rateLimit(`Rate limit hit, retrying in ${backoffDelay}ms (attempt ${attempt}/${this.maxRetries})`);
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

  /**
   * Helper method to chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Count 429 errors in batch results
   */
  private count429Errors(results: PromiseSettledResult<SingleImageResult>[]): number {
    return results.filter(result => {
      if (result.status === 'rejected') {
        const errorMessage = result.reason?.toString().toLowerCase() || '';
        return errorMessage.includes('429') || errorMessage.includes('capacity temporarily exceeded');
      }
      return false;
    }).length;
  }

  /**
   * Process settled batch results into SingleImageResult array
   */
  private processBatchResults(results: PromiseSettledResult<SingleImageResult>[]): SingleImageResult[] {
    const batchResults: SingleImageResult[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        batchResults.push(result.value);
      } else {
        batchResults.push({
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          sequence: batchResults.length + 1
        });
      }
    }

    return batchResults;
  }
}