// ============================================================================
// OpenAI-Compatible REST API Server
// ============================================================================

import { Request, Response, Router } from 'express';
import multer from 'multer';
import {
  getModelConfig,
  resolveModelId,
  listModels,
  parseModelParams,
  type AIClient,
  type StorageProvider,
  type ServerConfig,
} from '@cloudflare-image-mcp/core';

// Configure multer for memory storage (to handle base64 conversion)
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Create the image generation API router
 */
export function createImageAPI(
  config: ServerConfig,
  aiClient: AIClient,
  storage: StorageProvider
): Router {
  const router = Router();

  /**
   * GET /v1/models
   * List all available models
   */
  router.get('/models', (_req: Request, res: Response) => {
    const models = listModels();
    const formatted = models.map((model) => ({
      id: model.id,
      object: 'model',
      created: 0,
      owned_by: model.id.split('/')[1] || 'cloudflare',
    }));

    res.json({
      object: 'list',
      data: formatted,
    });
  });

  /**
   * POST /v1/images/generations
   * Generate images from a text prompt
   */
  router.post('/images/generations', async (req: Request, res: Response) => {
    try {
      const body = req.body;

      // Parse request
      const modelId = (body.model as string) || config.defaultModel;
      const prompt = body.prompt as string;
      const n = Math.min(Math.max((body.n as number) || 1, 1), 8);
      const size = body.size as string;
      const response_format = (body.response_format as string) || 'url'; // 'url' or 'b64_json'
      const steps = body.steps as number;
      const seed = body.seed as number;
      const guidance = body.guidance as number;
      const negative_prompt = body.negative_prompt as string;

      // Validate response_format
      if (response_format && response_format !== 'url' && response_format !== 'b64_json') {
        return res.status(400).json({
          error: {
            message: 'response_format must be "url" or "b64_json"',
            type: 'invalid_request_error',
          },
        });
      }

      // Validate prompt
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({
          error: {
            message: 'prompt is required and must be a string',
            type: 'invalid_request_error',
          },
        });
      }

      // Get model config
      const actualModelId = resolveModelId(modelId);
      const modelConfig = getModelConfig(actualModelId);

      if (!modelConfig) {
        return res.status(400).json({
          error: {
            message: `Unknown model: ${modelId}`,
            type: 'invalid_request_error',
          },
        });
      }

      // Generate images
      const images: Array<{ url: string; b64_json?: string }> = [];

      for (let i = 0; i < n; i++) {
        const currentSeed = seed ? seed + i : undefined;

        const result = await aiClient.generateImage(actualModelId, {
          prompt,
          steps: steps || modelConfig.limits.defaultSteps,
          seed: currentSeed,
          guidance,
          negative_prompt,
          width: size ? parseInt(size.split('x')[0]) : undefined,
          height: size ? parseInt(size.split('x')[1]) : undefined,
        });

        if (!result.success) {
          return res.status(500).json({
            error: {
              message: result.error || 'Image generation failed',
              type: 'api_error',
            },
          });
        }

        // Upload to storage
        const uploadResult = await storage.uploadImage(result.data!, {
          model: actualModelId,
          prompt,
          size,
          steps: String(steps || modelConfig.limits.defaultSteps),
          seed: currentSeed !== undefined ? String(currentSeed) : '',
        });

        if (!uploadResult.success) {
          return res.status(500).json({
            error: {
              message: uploadResult.error || 'Failed to store image',
              type: 'api_error',
            },
          });
        }

        images.push({ url: uploadResult.url!, b64_json: response_format === 'b64_json' ? result.data : undefined });
      }

      // Build response based on response_format
      const responseData = images.map((img) => {
        if (response_format === 'b64_json') {
          return { b64_json: img.b64_json, revised_prompt: prompt };
        }
        return { url: img.url, revised_prompt: prompt };
      });

      res.json({
        created: Date.now(),
        data: responseData,
      });
    } catch (error) {
      console.error('Image generation error:', error);
      res.status(500).json({
        error: {
          message: error instanceof Error ? error.message : 'Internal server error',
          type: 'api_error',
        },
      });
    }
  });

  /**
   * POST /v1/images/edits
   * OpenAI-compatible endpoint for image editing (inpainting) and image-to-image transformations
   * Supports multipart form data with file uploads (image[] array) per OpenAI spec
   */
  router.post('/images/edits', upload.fields([
    { name: 'image', maxCount: 16 },
    { name: 'mask', maxCount: 1 },
  ]), async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const files = req.files as Record<string, Express.Multer.File[]>;

      const modelId = (body.model as string) || config.defaultModel;
      const prompt = body.prompt as string;

      // Parse numeric parameters based on model schema
      const parsedParams = parseModelParams(modelId, body);
      const n = Math.min(Math.max((parsedParams.n as number) || 1, 1), 8);
      const size = body.size as string;
      const response_format = (body.response_format as string) || 'url';
      const steps = parsedParams.steps as number | undefined;
      const strength = parsedParams.strength as number | undefined;

      // Validate response_format
      if (response_format && response_format !== 'url' && response_format !== 'b64_json') {
        return res.status(400).json({
          error: { message: 'response_format must be "url" or "b64_json"', type: 'invalid_request_error' },
        });
      }

      if (!prompt) {
        return res.status(400).json({
          error: { message: 'prompt is required', type: 'invalid_request_error' },
        });
      }

      const modelConfig = getModelConfig(modelId);
      if (!modelConfig) {
        return res.status(400).json({
          error: { message: `Unknown model: ${modelId}`, type: 'invalid_request_error' },
        });
      }

      // Handle image input - supports both OpenAI image[] array format and single image
      const imageFiles = files['image'] || [];
      let imageBase64: string | undefined;

      if (imageFiles.length > 0) {
        // Use first image from the image[] array (OpenAI format)
        imageBase64 = imageFiles[0].buffer.toString('base64');
      } else if (body.image && typeof body.image === 'string') {
        // Single image as base64 string
        imageBase64 = body.image;
      } else if (body.image_b64 && typeof body.image_b64 === 'string') {
        // Alternative field name for base64 image
        imageBase64 = body.image_b64;
      }

      // Handle mask input for inpainting
      const maskFiles = files['mask'] || [];
      let maskBase64: string | undefined;

      if (maskFiles.length > 0) {
        maskBase64 = maskFiles[0].buffer.toString('base64');
      } else if (body.mask && typeof body.mask === 'string') {
        maskBase64 = body.mask;
      }

      const hasMask = !!maskBase64;
      const hasImage = !!imageBase64;

      // Determine task type and validate
      if (hasMask) {
        if (!modelConfig.supportedTasks.includes('inpainting')) {
          return res.status(400).json({
            error: { message: `Model ${modelId} does not support inpainting`, type: 'invalid_request_error' },
          });
        }
      } else if (hasImage) {
        if (!modelConfig.supportedTasks.includes('image-to-image')) {
          return res.status(400).json({
            error: { message: `Model ${modelId} does not support image-to-image`, type: 'invalid_request_error' },
          });
        }
      } else {
        return res.status(400).json({
          error: { message: 'image is required for edits endpoint', type: 'invalid_request_error' },
        });
      }

      const result = await aiClient.generateImage(modelId, {
        prompt,
        image: imageBase64,
        mask: maskBase64,
        steps: steps || modelConfig.limits.defaultSteps,
        strength,
      });

      if (!result.success) {
        return res.status(500).json({
          error: { message: result.error || 'Image generation failed', type: 'api_error' },
        });
      }

      const uploadResult = await storage.uploadImage(result.data!, {
        model: modelId,
        prompt,
        size,
        type: hasMask ? 'inpainting' : 'image-to-image',
      });

      // Build response based on response_format
      if (response_format === 'b64_json') {
        res.json({
          created: Date.now(),
          data: [{ b64_json: result.data, revised_prompt: prompt }],
        });
      } else {
        res.json({
          created: Date.now(),
          data: [{ url: uploadResult.url, revised_prompt: prompt }],
        });
      }
    } catch (error) {
      res.status(500).json({
        error: { message: error instanceof Error ? error.message : 'Internal error', type: 'api_error' },
      });
    }
  });

  return router;
}
