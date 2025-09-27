import { CloudflareClient } from './cloudflare-client.js';
import { getModelByName, getAllSupportedModels, getModelDescriptions } from './models/index.js';
import { GenerateImageParams } from './types.js';
import { createLocalStorage } from './storage/factory.js';

export class ImageService {
  private client: CloudflareClient;
  private storageProvider;

  constructor(config: { cloudflareApiToken: string; cloudflareAccountId: string; defaultModel: string }) {
    this.client = new CloudflareClient(config);
    const outputPath = process.env.IMAGE_OUTPUT_PATH || 'outputs';
    this.storageProvider = createLocalStorage({ basePath: outputPath });
  }

  async generateImage(params: GenerateImageParams & { model?: string }): Promise<{
    success: boolean;
    imageUrl?: string;
    error?: string;
    ignoredParams?: string[];
  }> {
    const modelName = params.model || '@cf/black-forest-labs/flux-1-schnell';

    try {
      const model = getModelByName(modelName);

      // Check for unsupported parameters
      const ignoredParams: string[] = [];

      if (params.negativePrompt && !model.config.supportsNegativePrompt) {
        ignoredParams.push('negativePrompt');
      }
      if (params.size !== '1024x1024' && !model.config.supportsSize) {
        ignoredParams.push('size');
      }
      if (params.guidance !== 7.5 && !model.config.supportsGuidance) {
        ignoredParams.push('guidance');
      }
      if (params.imageB64 && !model.config.supportsImageInput) {
        ignoredParams.push('imageB64 (img2img not supported)');
      }
      if (params.strength !== 1.0 && !model.config.supportsStrength) {
        ignoredParams.push('strength');
      }

      // Build request payload
      const payload = model.buildRequestPayload(params.prompt, {
        negativePrompt: params.negativePrompt,
        size: params.size,
        steps: params.steps,
        guidance: params.guidance,
        seed: params.seed,
        imageB64: params.imageB64,
        strength: params.strength,
      });

      // Make API request
      const result = await this.client.generateImage(modelName, payload);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Unknown error',
          ignoredParams: ignoredParams || []
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
      const metadata = {
        prompt: params.prompt,
        model: modelName,
        timestamp: new Date()
      };
      const storageResult = await this.storageProvider.save(imageBuffer, metadata);

      return {
        success: true,
        imageUrl: storageResult.url,
        ignoredParams: ignoredParams || []
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        ignoredParams: []
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
      if (config.supportsImageInput) features.push('img2img');
      if (config.supportsMask) features.push('inpainting');
      if (config.supportsStrength) features.push('strength control');

      result += `  Supported features: ${features.join(', ') || 'basic generation only'}\n`;

      // Special notes
      if (config.notes) {
        result += `  Notes: ${config.notes}\n`;
      }

      result += '\n';
    }

    result += 'PARAMETER SUPPORT MATRIX:\n';
    result += 'Model                    | Size | Guidance | Negative | img2img | Inpaint\n';
    result += '-------------------------|------|----------|----------|---------|--------\n';

    for (const model of models) {
      const config = model.config;
      const modelShort = model.name.split('/').pop()?.slice(0, 20).padEnd(20) || '';
      const sizeSupport = config.supportsSize ? '✅' : '❌';
      const guidanceSupport = config.supportsGuidance ? '✅' : '❌';
      const negativeSupport = config.supportsNegativePrompt ? '✅' : '❌';
      const img2imgSupport = config.supportsImageInput ? '✅' : '❌';
      const inpaintSupport = config.supportsMask ? '✅' : '❌';

      result += `${modelShort} |  ${sizeSupport}  |    ${guidanceSupport}    |    ${negativeSupport}    |   ${img2imgSupport}   |   ${inpaintSupport}\n`;
    }

    result += '\n✅ = Supported, ❌ = Not supported\n';
    result += '\nFor detailed parameter documentation, see the README.md file.';

    return result;
  }
}