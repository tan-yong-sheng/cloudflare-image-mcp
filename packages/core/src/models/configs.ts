// ============================================================================
// Model Configurations - Central configuration for all supported models
// ============================================================================

import type { ModelConfig, ModelTask } from '../types.js';

/**
 * Model configurations for all supported image generation models
 */
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  '@cf/black-forest-labs/flux-1-schnell': {
    id: '@cf/black-forest-labs/flux-1-schnell',
    name: 'FLUX.1 [schnell]',
    description: 'Fast 12B parameter rectified flow transformer for rapid image generation',
    provider: 'black-forest-labs',
    apiVersion: 2,
    inputFormat: 'json',
    responseFormat: 'base64',
    supportedTasks: ['text-to-image'] as ModelTask[],
    parameters: {
      prompt: { cfParam: 'prompt', type: 'string', required: true },
      steps: { cfParam: 'steps', type: 'integer', default: 4, min: 1, max: 8 },
      seed: { cfParam: 'seed', type: 'integer' },
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 4,
      maxSteps: 8,
      minWidth: 512,
      maxWidth: 2048,
      minHeight: 512,
      maxHeight: 2048,
      supportedSizes: ['512x512', '768x768', '1024x1024'],
    },
  },
  '@cf/black-forest-labs/flux-2-klein-4b': {
    id: '@cf/black-forest-labs/flux-2-klein-4b',
    name: 'FLUX.2 [klein]',
    description: 'Ultra-fast distilled model unifying image generation and editing',
    provider: 'black-forest-labs',
    apiVersion: 2,
    inputFormat: 'multipart',
    responseFormat: 'base64',
    supportedTasks: ['text-to-image', 'image-to-image'] as ModelTask[],
    parameters: {
      prompt: { cfParam: 'prompt', type: 'string', required: true },
      steps: { cfParam: 'steps', type: 'integer', default: 4, min: 1, max: 50 },
      seed: { cfParam: 'seed', type: 'integer' },
      width: { cfParam: 'width', type: 'integer', default: 1024, min: 256, max: 2048, step: 64 },
      height: { cfParam: 'height', type: 'integer', default: 1024, min: 256, max: 2048, step: 64 },
      image: { cfParam: 'image', type: 'string' },
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 4,
      maxSteps: 50,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      supportedSizes: ['256x256', '512x512', '768x768', '1024x1024', '1280x1280'],
    },
  },
  '@cf/black-forest-labs/flux-2-dev': {
    id: '@cf/black-forest-labs/flux-2-dev',
    name: 'FLUX.2 [dev]',
    description: 'High-quality image model with multi-reference support',
    provider: 'black-forest-labs',
    apiVersion: 2,
    inputFormat: 'multipart',
    responseFormat: 'base64',
    supportedTasks: ['text-to-image', 'image-to-image'] as ModelTask[],
    parameters: {
      prompt: { cfParam: 'prompt', type: 'string', required: true },
      steps: { cfParam: 'steps', type: 'integer', default: 20, min: 1, max: 50 },
      seed: { cfParam: 'seed', type: 'integer' },
      width: { cfParam: 'width', type: 'integer', default: 1024, min: 256, max: 2048, step: 64 },
      height: { cfParam: 'height', type: 'integer', default: 1024, min: 256, max: 2048, step: 64 },
      image: { cfParam: 'image', type: 'string' },
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 20,
      maxSteps: 50,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      supportedSizes: ['256x256', '512x512', '768x768', '1024x1024', '1280x1280'],
    },
  },
  '@cf/stabilityai/stable-diffusion-xl-base-1.0': {
    id: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    name: 'Stable Diffusion XL Base 1.0',
    description: 'High-quality diffusion model by Stability AI',
    provider: 'stabilityai',
    apiVersion: 2,
    inputFormat: 'json',
    responseFormat: 'binary',
    supportedTasks: ['text-to-image', 'image-to-image', 'inpainting'] as ModelTask[],
    parameters: {
      prompt: { cfParam: 'prompt', type: 'string', required: true },
      negative_prompt: { cfParam: 'negative_prompt', type: 'string', default: '' },
      num_steps: { cfParam: 'num_steps', type: 'integer', default: 20, min: 1, max: 20 },
      guidance: { cfParam: 'guidance', type: 'number', default: 7.5, min: 1, max: 30 },
      seed: { cfParam: 'seed', type: 'integer' },
      width: { cfParam: 'width', type: 'integer', default: 1024, min: 256, max: 2048, step: 64 },
      height: { cfParam: 'height', type: 'integer', default: 1024, min: 256, max: 2048, step: 64 },
      image_b64: { cfParam: 'image_b64', type: 'string' },
      mask: { cfParam: 'mask', type: 'string' },
      strength: { cfParam: 'strength', type: 'number', default: 1, min: 0, max: 1 },
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 20,
      maxSteps: 20,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      supportedSizes: ['256x256', '512x512', '768x768', '1024x1024', '1280x1280', '1024x1792', '1792x1024'],
    },
  },
  '@cf/bytedance/stable-diffusion-xl-lightning': {
    id: '@cf/bytedance/stable-diffusion-xl-lightning',
    name: 'SDXL Lightning',
    description: 'Lightning-fast SDXL model for high-quality 1024px images',
    provider: 'bytedance',
    apiVersion: 2,
    inputFormat: 'json',
    responseFormat: 'binary',
    supportedTasks: ['text-to-image'] as ModelTask[],
    parameters: {
      prompt: { cfParam: 'prompt', type: 'string', required: true },
      negative_prompt: { cfParam: 'negative_prompt', type: 'string', default: '' },
      num_steps: { cfParam: 'num_steps', type: 'integer', default: 4, min: 1, max: 20 },
      guidance: { cfParam: 'guidance', type: 'number', default: 7.5, min: 1, max: 30 },
      seed: { cfParam: 'seed', type: 'integer' },
      width: { cfParam: 'width', type: 'integer', default: 1024, min: 256, max: 2048, step: 64 },
      height: { cfParam: 'height', type: 'integer', default: 1024, min: 256, max: 2048, step: 64 },
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 4,
      maxSteps: 20,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      supportedSizes: ['512x512', '1024x1024'],
    },
  },
  '@cf/lykon/dreamshaper-8-lcm': {
    id: '@cf/lykon/dreamshaper-8-lcm',
    name: 'DreamShaper 8 LCM',
    description: 'Enhanced photorealistic SD model with LCM acceleration',
    provider: 'lykon',
    apiVersion: 2,
    inputFormat: 'json',
    responseFormat: 'binary',
    supportedTasks: ['text-to-image', 'image-to-image'] as ModelTask[],
    parameters: {
      prompt: { cfParam: 'prompt', type: 'string', required: true },
      negative_prompt: { cfParam: 'negative_prompt', type: 'string', default: '' },
      num_steps: { cfParam: 'num_steps', type: 'integer', default: 8, min: 1, max: 20 },
      guidance: { cfParam: 'guidance', type: 'number', default: 7.5, min: 1, max: 30 },
      seed: { cfParam: 'seed', type: 'integer' },
      width: { cfParam: 'width', type: 'integer', default: 1024, min: 256, max: 2048, step: 64 },
      height: { cfParam: 'height', type: 'integer', default: 1024, min: 256, max: 2048, step: 64 },
      image_b64: { cfParam: 'image_b64', type: 'string' },
      strength: { cfParam: 'strength', type: 'number', default: 1, min: 0, max: 1 },
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 8,
      maxSteps: 20,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      supportedSizes: ['512x512', '768x768', '1024x1024'],
    },
  },
};

/**
 * Model aliases for convenient access
 */
export const MODEL_ALIASES: Record<string, string> = {
  // OpenAI-compatible aliases
  'dall-e-3': '@cf/black-forest-labs/flux-1-schnell',
  'dall-e-2': '@cf/stabilityai/stable-diffusion-xl-base-1.0',

  // Short names
  'flux-schnell': '@cf/black-forest-labs/flux-1-schnell',
  'flux-klein': '@cf/black-forest-labs/flux-2-klein-4b',
  'flux-dev': '@cf/black-forest-labs/flux-2-dev',
  'sdxl-base': '@cf/stabilityai/stable-diffusion-xl-base-1.0',
  'sdxl-lightning': '@cf/bytedance/stable-diffusion-xl-lightning',
  'dreamshaper': '@cf/lykon/dreamshaper-8-lcm',
};

/**
 * All supported model aliases (combines keys and aliases)
 */
export const SUPPORTED_MODEL_IDS: string[] = [
  ...Object.keys(MODEL_CONFIGS),
  ...Object.keys(MODEL_ALIASES),
];
