// ============================================================================
// Enhanced Model Metadata - Pricing, Performance, and Selection Guide
// ============================================================================

import type { ModelTask } from '../types.js';

/**
 * Model performance characteristics
 */
export interface ModelPerformance {
  /** Speed rating for generation */
  speed: 'ultra-fast' | 'fast' | 'medium' | 'slow';
  /** Default number of steps */
  defaultSteps: number;
  /** Maximum number of steps */
  maxSteps: number;
  /** Estimated generation time in seconds (at default steps) */
  estimatedTimeSeconds: number;
}

/**
 * Model quality characteristics
 */
export interface ModelQuality {
  /** Photorealism capability (0-10) */
  photorealism: number;
  /** Prompt adherence (0-10) */
  promptAdherence: number;
  /** Text rendering in images (0-10, 0 if not supported) */
  textRendering: number;
  /** Artistic style capability (0-10) */
  artisticStyle: number;
}

/**
 * Model pricing information
 */
export interface ModelPricing {
  /** Whether the model is free to use */
  isFree: boolean;
  /** Price per 512x512 tile */
  unitPrice: string;
  /** Price per step (if applicable) */
  perStepPrice?: string;
  /** Estimated cost for standard 1024x1024 generation */
  estimatedCost1024: string;
}

/**
 * Model comparison and alternatives
 */
export interface ModelComparison {
  /** Best use cases for this model */
  bestFor: string[];
  /** When NOT to use this model */
  notRecommendedFor: string[];
  /** Alternative model for higher quality (if available) */
  higherQualityAlternative?: string;
  /** Alternative model for faster generation (if available) */
  fasterAlternative?: string;
  /** Alternative model for lower cost (if available) */
  cheaperAlternative?: string;
}

/**
 * Enhanced model metadata for LLM model selection
 */
export interface EnhancedModelMetadata {
  /** Full model ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description */
  description: string;
  /** Model provider */
  provider: string;
  /** Supported tasks */
  supportedTasks: ModelTask[];
  /** Performance characteristics */
  performance: ModelPerformance;
  /** Quality characteristics */
  quality: ModelQuality;
  /** Pricing information */
  pricing: ModelPricing;
  /** Comparison and recommendations */
  comparison: ModelComparison;
}

/**
 * Selection guide for LLM to choose appropriate models
 */
export interface ModelSelectionGuide {
  /** Models optimized for speed */
  forSpeed: string[];
  /** Free models only */
  forFreeModels: string[];
  /** Models best for photorealism */
  forPhotorealism: string[];
  /** Models best for artistic/style images */
  forArtisticStyle: string[];
  /** Models best for text rendering */
  forTextRendering: string[];
  /** Models supporting img2img */
  forImageToImage: string[];
  /** Models supporting inpainting */
  forInpainting: string[];
  /** Models with highest quality (may be slower/more expensive) */
  forHighestQuality: string[];
}

/**
 * Enhanced model list response
 */
export interface EnhancedModelList {
  /** All available models with full metadata */
  models: EnhancedModelMetadata[];
  /** Selection guide for different use cases */
  selectionGuide: ModelSelectionGuide;
  /** Workflow instructions */
  workflow: {
    step1: string;
    step2: string;
    step3: string;
  };
  /** Next step hint */
  nextStep: string;
}

// ============================================================================
// Model Metadata Definitions
// ============================================================================

export const MODEL_METADATA: Record<string, EnhancedModelMetadata> = {
  '@cf/black-forest-labs/flux-1-schnell': {
    id: '@cf/black-forest-labs/flux-1-schnell',
    name: 'FLUX.1 [schnell]',
    description: '12B parameter rectified flow transformer for rapid image generation. Best for speed with good quality.',
    provider: 'black-forest-labs',
    supportedTasks: ['text-to-image'],
    performance: {
      speed: 'ultra-fast',
      defaultSteps: 4,
      maxSteps: 8,
      estimatedTimeSeconds: 2,
    },
    quality: {
      photorealism: 8,
      promptAdherence: 8,
      textRendering: 9,
      artisticStyle: 8,
    },
    pricing: {
      isFree: false,
      unitPrice: '$0.000053',
      perStepPrice: '$0.00011',
      estimatedCost1024: '~$0.0007',
    },
    comparison: {
      bestFor: ['Rapid prototyping', 'Text-heavy images', 'Quick iterations', 'Production workflows'],
      notRecommendedFor: ['Highest quality requirements', 'Complex compositions'],
      higherQualityAlternative: '@cf/black-forest-labs/flux-2-dev',
    },
  },
  '@cf/black-forest-labs/flux-2-klein-4b': {
    id: '@cf/black-forest-labs/flux-2-klein-4b',
    name: 'FLUX.2 [klein]',
    description: 'Ultra-fast distilled model unifying image generation and editing. Supports both txt2img and img2img.',
    provider: 'black-forest-labs',
    supportedTasks: ['text-to-image', 'image-to-image'],
    performance: {
      speed: 'ultra-fast',
      defaultSteps: 4,
      maxSteps: 50,
      estimatedTimeSeconds: 2,
    },
    quality: {
      photorealism: 8,
      promptAdherence: 8,
      textRendering: 8,
      artisticStyle: 8,
    },
    pricing: {
      isFree: false,
      unitPrice: '$0.000053',
      perStepPrice: '$0.00011',
      estimatedCost1024: '~$0.0007',
    },
    comparison: {
      bestFor: ['Speed with flexibility', 'Image editing workflows', 'Variable step counts'],
      notRecommendedFor: ['Maximum quality (use flux-2-dev)'],
      higherQualityAlternative: '@cf/black-forest-labs/flux-2-dev',
    },
  },
  '@cf/black-forest-labs/flux-2-dev': {
    id: '@cf/black-forest-labs/flux-2-dev',
    name: 'FLUX.2 [dev]',
    description: 'High-quality image model with multi-reference support. Best quality FLUX model.',
    provider: 'black-forest-labs',
    supportedTasks: ['text-to-image', 'image-to-image'],
    performance: {
      speed: 'medium',
      defaultSteps: 20,
      maxSteps: 50,
      estimatedTimeSeconds: 8,
    },
    quality: {
      photorealism: 9,
      promptAdherence: 9,
      textRendering: 9,
      artisticStyle: 9,
    },
    pricing: {
      isFree: false,
      unitPrice: '$0.000053',
      perStepPrice: '$0.00011',
      estimatedCost1024: '~$0.003',
    },
    comparison: {
      bestFor: ['Highest quality', 'Professional outputs', 'Complex scenes', 'Detailed artwork'],
      notRecommendedFor: ['Quick iterations', 'Cost-sensitive applications'],
      fasterAlternative: '@cf/black-forest-labs/flux-1-schnell',
    },
  },
  '@cf/stabilityai/stable-diffusion-xl-base-1.0': {
    id: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    name: 'Stable Diffusion XL Base 1.0',
    description: 'High-quality diffusion model by Stability AI. Supports txt2img, img2img, and inpainting. FREE.',
    provider: 'stabilityai',
    supportedTasks: ['text-to-image', 'image-to-image', 'inpainting'],
    performance: {
      speed: 'medium',
      defaultSteps: 20,
      maxSteps: 20,
      estimatedTimeSeconds: 6,
    },
    quality: {
      photorealism: 8,
      promptAdherence: 8,
      textRendering: 5,
      artisticStyle: 8,
    },
    pricing: {
      isFree: true,
      unitPrice: '$0.00',
      estimatedCost1024: 'FREE',
    },
    comparison: {
      bestFor: ['Free generation', 'Versatile tasks (including inpainting)', 'Balanced quality/speed'],
      notRecommendedFor: ['Text rendering', 'Ultra-fast generation'],
      fasterAlternative: '@cf/bytedance/stable-diffusion-xl-lightning',
    },
  },
  '@cf/bytedance/stable-diffusion-xl-lightning': {
    id: '@cf/bytedance/stable-diffusion-xl-lightning',
    name: 'SDXL Lightning',
    description: 'Lightning-fast SDXL model for high-quality 1024px images. Good balance of speed and quality.',
    provider: 'bytedance',
    supportedTasks: ['text-to-image'],
    performance: {
      speed: 'fast',
      defaultSteps: 4,
      maxSteps: 20,
      estimatedTimeSeconds: 3,
    },
    quality: {
      photorealism: 7,
      promptAdherence: 7,
      textRendering: 4,
      artisticStyle: 7,
    },
    pricing: {
      isFree: false,
      unitPrice: '$0.000053',
      perStepPrice: '$0.00011',
      estimatedCost1024: '~$0.0005',
    },
    comparison: {
      bestFor: ['Fast SDXL generation', '1024px outputs', 'Cost-effective speed'],
      notRecommendedFor: ['Inpainting (not supported)', 'Image editing'],
      higherQualityAlternative: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    },
  },
  '@cf/lykon/dreamshaper-8-lcm-8-lcm': {
    id: '@cf/lykon/dreamshaper-8-lcm-8-lcm',
    name: '@cf/lykon/dreamshaper-8-lcm 8 LCM',
    description: 'Enhanced photorealistic SD model with LCM acceleration. Best for photorealism. FREE.',
    provider: 'lykon',
    supportedTasks: ['text-to-image', 'image-to-image'],
    performance: {
      speed: 'fast',
      defaultSteps: 8,
      maxSteps: 20,
      estimatedTimeSeconds: 4,
    },
    quality: {
      photorealism: 9,
      promptAdherence: 8,
      textRendering: 5,
      artisticStyle: 7,
    },
    pricing: {
      isFree: true,
      unitPrice: '$0.00',
      estimatedCost1024: 'FREE',
    },
    comparison: {
      bestFor: ['Photorealistic images', 'Free high-quality generation', 'Portraits', 'Realistic scenes'],
      notRecommendedFor: ['Text rendering', 'Inpainting (not supported)'],
      fasterAlternative: '@cf/bytedance/stable-diffusion-xl-lightning',
    },
  },
  '@cf/leonardo/lucid-origin': {
    id: '@cf/leonardo/lucid-origin',
    name: 'Lucid Origin',
    description: 'Leonardo.AI most adaptable and prompt-responsive model. Excellent text rendering and wide style support.',
    provider: 'leonardo',
    supportedTasks: ['text-to-image'],
    performance: {
      speed: 'ultra-fast',
      defaultSteps: 4,
      maxSteps: 40,
      estimatedTimeSeconds: 2,
    },
    quality: {
      photorealism: 8,
      promptAdherence: 9,
      textRendering: 9,
      artisticStyle: 9,
    },
    pricing: {
      isFree: false,
      unitPrice: '$0.007',
      perStepPrice: '$0.00013',
      estimatedCost1024: '~$0.008',
    },
    comparison: {
      bestFor: ['Text in images', 'Graphic design', 'Product mockups', 'Wide style range', 'Prompt adherence'],
      notRecommendedFor: ['Cost-sensitive applications', 'Inpainting (not supported)'],
      cheaperAlternative: '@cf/black-forest-labs/flux-1-schnell',
    },
  },
  '@cf/leonardo/phoenix-1.0': {
    id: '@cf/leonardo/phoenix-1.0',
    name: 'Phoenix 1.0',
    description: 'Leonardo.AI model with exceptional prompt adherence. Best for precise control.',
    provider: 'leonardo',
    supportedTasks: ['text-to-image'],
    performance: {
      speed: 'slow',
      defaultSteps: 25,
      maxSteps: 50,
      estimatedTimeSeconds: 10,
    },
    quality: {
      photorealism: 9,
      promptAdherence: 10,
      textRendering: 8,
      artisticStyle: 9,
    },
    pricing: {
      isFree: false,
      unitPrice: '$0.007',
      perStepPrice: '$0.00013',
      estimatedCost1024: '~$0.01',
    },
    comparison: {
      bestFor: ['Maximum prompt adherence', 'Precise control', 'Complex compositions', 'Professional outputs'],
      notRecommendedFor: ['Quick iterations', 'Cost-sensitive applications', 'Simple generations'],
      fasterAlternative: '@cf/leonardo/lucid-origin',
    },
  },
  '@cf/runwayml/stable-diffusion-v1-5-img2img': {
    id: '@cf/runwayml/stable-diffusion-v1-5-img2img',
    name: 'Stable Diffusion 1.5 Img2Img',
    description: 'SD 1.5 for image-to-image transformations. FREE.',
    provider: 'runwayml',
    supportedTasks: ['image-to-image'],
    performance: {
      speed: 'medium',
      defaultSteps: 20,
      maxSteps: 20,
      estimatedTimeSeconds: 5,
    },
    quality: {
      photorealism: 7,
      promptAdherence: 7,
      textRendering: 4,
      artisticStyle: 7,
    },
    pricing: {
      isFree: true,
      unitPrice: '$0.00',
      estimatedCost1024: 'FREE',
    },
    comparison: {
      bestFor: ['Free image editing', 'Image transformations', 'Style transfer'],
      notRecommendedFor: ['Text rendering', 'Highest quality'],
      higherQualityAlternative: '@cf/black-forest-labs/flux-2-dev',
    },
  },
  '@cf/runwayml/stable-diffusion-v1-5-inpainting': {
    id: '@cf/runwayml/stable-diffusion-v1-5-inpainting',
    name: 'Stable Diffusion 1.5 Inpainting',
    description: 'SD 1.5 for inpainting with mask support. FREE.',
    provider: 'runwayml',
    supportedTasks: ['inpainting'],
    performance: {
      speed: 'medium',
      defaultSteps: 20,
      maxSteps: 20,
      estimatedTimeSeconds: 5,
    },
    quality: {
      photorealism: 7,
      promptAdherence: 7,
      textRendering: 4,
      artisticStyle: 7,
    },
    pricing: {
      isFree: true,
      unitPrice: '$0.00',
      estimatedCost1024: 'FREE',
    },
    comparison: {
      bestFor: ['Free inpainting', 'Object removal', 'Object replacement'],
      notRecommendedFor: ['Text rendering', 'Highest quality inpainting'],
      higherQualityAlternative: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    },
  },
};

/**
 * Get enhanced metadata for a model
 */
export function getModelMetadata(modelId: string): EnhancedModelMetadata | null {
  return MODEL_METADATA[modelId] || null;
}

/**
 * Build selection guide from all model metadata
 */
export function buildSelectionGuide(): ModelSelectionGuide {
  const allModels = Object.values(MODEL_METADATA);

  return {
    forSpeed: allModels
      .filter((m) => m.performance.speed === 'ultra-fast')
      .map((m) => m.id),
    forFreeModels: allModels
      .filter((m) => m.pricing.isFree)
      .map((m) => m.id),
    forPhotorealism: allModels
      .filter((m) => m.quality.photorealism >= 8)
      .map((m) => m.id),
    forArtisticStyle: allModels
      .filter((m) => m.quality.artisticStyle >= 8)
      .map((m) => m.id),
    forTextRendering: allModels
      .filter((m) => m.quality.textRendering >= 8)
      .map((m) => m.id),
    forImageToImage: allModels
      .filter((m) => m.supportedTasks.includes('image-to-image'))
      .map((m) => m.id),
    forInpainting: allModels
      .filter((m) => m.supportedTasks.includes('inpainting'))
      .map((m) => m.id),
    forHighestQuality: allModels
      .filter((m) => m.quality.photorealism >= 9 && m.quality.promptAdherence >= 9)
      .map((m) => m.id),
  };
}

/**
 * Get enhanced model list for LLM model selection
 */
export function getEnhancedModelList(): EnhancedModelList {
  const models = Object.values(MODEL_METADATA);
  const selectionGuide = buildSelectionGuide();

  return {
    models,
    selectionGuide,
    workflow: {
      step1: 'list_models() - you are here: Review available models and selection_guide',
      step2: 'describe_model(model_id="<chosen_model>") - Get parameter details for your chosen model',
      step3: 'run_models(model_id="<chosen_model>", prompt="...", ...) - Generate images',
    },
    nextStep: 'Choose a model_id from the selection_guide based on your needs, then call describe_model(model_id="<model_id>")',
  };
}
