import { getModelByName } from '../models/index.js';
import { ModelConfig } from '../types.js';

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * Generate dynamic tool schema for generate_image based on the configured model's capabilities
 */
export function generateImageToolSchema(defaultModel: string): ToolSchema {
  const model = getModelByName(defaultModel);
  const config = model.config;

  // Base properties that are always available
  const properties: Record<string, unknown> = {
    prompt: {
      type: 'string',
      description: 'Text description of the image to generate',
    },
    seed: {
      type: 'number',
      description: 'Random seed for reproducible results',
    },
  };

  // Conditionally add size parameter if supported
  if (config.supportsSize) {
    properties.size = {
      type: 'string',
      description: `Image size in format "widthxheight" (e.g., "1024x1024"). Default: ${config.defaultSize || '1024x1024'}`,
      default: config.defaultSize || '1024x1024',
    };
  }

  // Conditionally add negativePrompt parameter if supported
  if (config.supportsNegativePrompt) {
    properties.negativePrompt = {
      type: 'string',
      description: 'Text describing what to avoid in the image',
      default: '',
    };
  }

  // Conditionally add steps parameter with model-specific constraints
  properties.steps = {
    type: 'number',
    description: `Number of diffusion steps (range: 1-${config.maxSteps}, default: ${config.defaultSteps})`,
    default: config.defaultSteps,
    minimum: 1,
    maximum: config.maxSteps,
  };

  // Conditionally add guidance parameter if supported
  if (config.supportsGuidance) {
    let guidanceDescription = `How closely to follow the prompt`;

    // Add model-specific guidance information
    if (config.guidanceRange) {
      guidanceDescription += ` (range: ${config.guidanceRange}`;
      if (config.defaultGuidance) {
        guidanceDescription += `, default: ${config.defaultGuidance}`;
      }
      guidanceDescription += ')';
    } else if (config.defaultGuidance) {
      guidanceDescription += ` (default: ${config.defaultGuidance})`;
    }

    // Add model-specific notes
    if (config.guidanceValues) {
      guidanceDescription += `. Recommended values: ${config.guidanceValues.join(', ')}`;
    }

    if (model.name.includes('dreamshaper-8-lcm')) {
      guidanceDescription += '. Note: LCM model works best with lower guidance (1.0-2.0)';
    } else if (model.name.includes('phoenix-1.0')) {
      guidanceDescription += '. Note: Use contrast 3.5 for medium, 4.0 for high contrast. Alchemy mode requires contrast ≥2.5';
    } else if (model.name.includes('lucid-origin')) {
      guidanceDescription += '. Note: Use contrast 3.5 for medium quality';
    }

    properties.guidance = {
      type: 'number',
      description: guidanceDescription,
      default: config.defaultGuidance || 7.5,
    };
  }

  // Note: Image-to-image parameters (imageB64, strength) are not currently supported
  // by any of the available models, so they're not included in the dynamic schema

  // Build description with model-specific information
  let description = `Generate an image using ${model.name}`;

  // Add model-specific capabilities
  const capabilities = [];
  if (config.supportsNegativePrompt) capabilities.push('negative prompts');
  if (config.supportsSize) capabilities.push('custom sizes');
  if (config.supportsGuidance) capabilities.push('guidance control');

  if (capabilities.length > 0) {
    description += ` with support for: ${capabilities.join(', ')}`;
  }

  // Add recommended usage
  if (config.recommendedFor) {
    description += `. Recommended for: ${config.recommendedFor}`;
  }

  // Add special notes if any
  if (config.notes) {
    description += `. ${config.notes}`;
  }

  return {
    name: 'generate_image',
    description,
    inputSchema: {
      type: 'object',
      properties,
      required: ['prompt'],
    },
  };
}

/**
 * Generate model-specific parameter validation message
 */
export function generateParameterValidationMessage(
  params: Record<string, unknown>,
  modelName: string,
  modelConfig: ModelConfig
): string {
  const unsupportedParams: string[] = [];

  if (params.negativePrompt && !modelConfig.supportsNegativePrompt) {
    unsupportedParams.push('negativePrompt');
  }

  if (params.size && params.size !== '1024x1024' && !modelConfig.supportsSize) {
    unsupportedParams.push('size');
  }

  if (params.guidance && params.guidance !== 7.5 && !modelConfig.supportsGuidance) {
    unsupportedParams.push('guidance');
  }

  if (unsupportedParams.length === 0) {
    return '';
  }

  return `Note: The following parameters are not supported by ${modelName} and were ignored: ${unsupportedParams.join(', ')}`;
}