// ============================================================================
// OpenAI-Compatible REST API Server
// ============================================================================

import { Request, Response, Router } from 'express';
import {
  getModelConfig,
  resolveModelId,
  listModels,
  type AIClient,
  type StorageProvider,
  type ServerConfig,
} from '@cloudflare-image-mcp/core';

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
      const steps = body.steps as number;
      const seed = body.seed as number;
      const guidance = body.guidance as number;
      const negative_prompt = body.negative_prompt as string;

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

        images.push({ url: uploadResult.url! });
      }

      res.json({
        created: Date.now(),
        data: images.map((img) => ({
          url: img.url,
          revised_prompt: prompt,
        })),
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
   * Edit an image with a mask (inpainting)
   */
  router.post('/images/edits', async (req: Request, res: Response) => {
    try {
      const body = req.body;

      const modelId = (body.model as string) || config.defaultModel;
      const prompt = body.prompt as string;
      const image = body.image as string; // base64
      const mask = body.mask as string; // base64
      const n = Math.min(Math.max((body.n as number) || 1, 1), 8);
      const size = body.size as string;
      const steps = body.steps as number;

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

      if (!modelConfig.supportedTasks.includes('inpainting')) {
        return res.status(400).json({
          error: { message: `Model ${modelId} does not support inpainting`, type: 'invalid_request_error' },
        });
      }

      const result = await aiClient.generateImage(modelId, {
        prompt,
        image,
        mask,
        steps: steps || modelConfig.limits.defaultSteps,
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
        type: 'edit',
      });

      res.json({
        created: Date.now(),
        data: [{ url: uploadResult.url }],
      });
    } catch (error) {
      res.status(500).json({
        error: { message: error instanceof Error ? error.message : 'Internal error', type: 'api_error' },
      });
    }
  });

  /**
   * POST /v1/images/variations
   * Create variations of an image (img2img)
   */
  router.post('/images/variations', async (req: Request, res: Response) => {
    try {
      const body = req.body;

      const modelId = (body.model as string) || config.defaultModel;
      const prompt = body.prompt as string;
      const image = body.image as string; // base64
      const n = Math.min(Math.max((body.n as number) || 1, 1), 8);
      const size = body.size as string;
      const strength = body.strength as number || 0.5;
      const steps = body.steps as number;

      if (!image) {
        return res.status(400).json({
          error: { message: 'image is required', type: 'invalid_request_error' },
        });
      }

      const modelConfig = getModelConfig(modelId);
      if (!modelConfig) {
        return res.status(400).json({
          error: { message: `Unknown model: ${modelId}`, type: 'invalid_request_error' },
        });
      }

      if (!modelConfig.supportedTasks.includes('image-to-image')) {
        return res.status(400).json({
          error: { message: `Model ${modelId} does not support image-to-image`, type: 'invalid_request_error' },
        });
      }

      const result = await aiClient.generateImage(modelId, {
        prompt: prompt || '',
        image,
        strength,
        steps: steps || modelConfig.limits.defaultSteps,
      });

      if (!result.success) {
        return res.status(500).json({
          error: { message: result.error || 'Image generation failed', type: 'api_error' },
        });
      }

      const uploadResult = await storage.uploadImage(result.data!, {
        model: modelId,
        prompt: prompt || '',
        size,
        type: 'variation',
      });

      res.json({
        created: Date.now(),
        data: [{ url: uploadResult.url }],
      });
    } catch (error) {
      res.status(500).json({
        error: { message: error instanceof Error ? error.message : 'Internal error', type: 'api_error' },
      });
    }
  });

  return router;
}
