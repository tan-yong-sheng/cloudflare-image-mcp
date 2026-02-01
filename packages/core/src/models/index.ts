// ============================================================================
// Model Registry - Helper functions for model lookups
// ============================================================================

import type { ModelConfig, ModelTask } from '../types.js';
import { MODEL_CONFIGS } from './configs.js';

/**
 * Get model configuration by full model ID
 * @param modelId - Full model ID (e.g., @cf/black-forest-labs/flux-1-schnell)
 * @returns Model configuration or null if not found
 */
export function getModelConfig(modelId: string): ModelConfig | null {
  return MODEL_CONFIGS[modelId] || null;
}

/**
 * Check if a model ID is valid
 * @param modelId - Full model ID
 * @returns True if model exists
 */
export function isValidModel(modelId: string): boolean {
  return modelId in MODEL_CONFIGS;
}

/**
 * List all available models
 * @returns Array of model summaries
 */
export function listModels(): Array<{
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  taskTypes: ModelTask[];
}> {
  return Object.values(MODEL_CONFIGS).map((config) => ({
    id: config.id,
    name: config.name,
    description: config.description,
    capabilities: Object.keys(config.parameters),
    taskTypes: config.supportedTasks,
  }));
}

/**
 * Get model help text with available parameters
 * @param modelId - Model ID or alias
 * @returns Help text string
 */
export function getModelHelp(modelId: string): string {
  const model = getModelConfig(modelId);
  if (!model) {
    return `Unknown model: ${modelId}. Available models: ${Object.keys(MODEL_CONFIGS).join(', ')}`;
  }

  let help = `# ${model.name}\n\n`;
  help += `${model.description}\n\n`;
  help += `**Provider:** ${model.provider}\n\n`;
  help += `## Supported Tasks\n\n`;
  help += model.supportedTasks.map((t) => `- ${t}`).join('\n');
  help += `\n\n## Parameters\n\n`;
  help += `| Parameter | Type | Default | Range | Description |\n`;
  help += `|-----------|------|---------|-------|-------------|\n`;

  for (const [name, config] of Object.entries(model.parameters)) {
    const range = config.min !== undefined && config.max !== undefined
      ? `${config.min}-${config.max}`
      : config.min !== undefined
        ? `≥${config.min}`
        : config.max !== undefined
          ? `≤${config.max}`
          : '-';
    const defaultVal = config.default !== undefined ? String(config.default) : '-';
    const required = config.required ? '(required)' : '';
    help += `| ${name} | ${config.type} | ${defaultVal} | ${range} | ${config.cfParam} ${required} |\n`;
  }

  help += `\n## Limits\n\n`;
  help += `- **Max prompt length:** ${model.limits.maxPromptLength} characters\n`;
  help += `- **Default steps:** ${model.limits.defaultSteps}\n`;
  help += `- **Max steps:** ${model.limits.maxSteps}\n`;
  help += `- **Image sizes:** ${model.limits.supportedSizes.join(', ')}\n`;

  return help;
}

/**
 * Get parameter schema for a model (for MCP tools)
 * @param modelId - Model ID or alias
 * @returns Parameter schema object
 */
export function getParameterSchema(modelId: string): Record<string, unknown> {
  const model = getModelConfig(modelId);
  if (!model) {
    return {};
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, config] of Object.entries(model.parameters)) {
    const prop: Record<string, unknown> = {
      type: config.type === 'integer' || config.type === 'number' ? 'number' : 'string',
      description: config.cfParam,
    };

    if (config.default !== undefined) {
      prop.default = config.default;
    }
    if (config.min !== undefined) {
      prop.minimum = config.min;
    }
    if (config.max !== undefined) {
      prop.maximum = config.max;
    }

    properties[name] = prop;

    if (config.required) {
      required.push(name);
    }
  }

  return {
    type: 'object' as const,
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Parse and validate parameters based on model schema
 * Converts string values from multipart/form-data to correct types
 * @param modelId - Model ID or alias
 * @param params - Raw parameters (may contain string values)
 * @returns Parsed parameters with correct types
 */
export function parseModelParams(
  modelId: string,
  params: Record<string, unknown>
): Record<string, unknown> {
  const model = getModelConfig(modelId);
  if (!model) {
    return params;
  }

  const parsed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    const paramConfig = model.parameters[key];
    if (!paramConfig) {
      // Unknown parameter, pass through as-is
      parsed[key] = value;
      continue;
    }

    // Convert based on parameter type
    if (paramConfig.type === 'integer' || paramConfig.type === 'number') {
      if (typeof value === 'number') {
        parsed[key] = value;
      } else if (typeof value === 'string') {
        const parsedNum = parseFloat(value);
        if (isNaN(parsedNum)) {
          // If can't parse as number, keep as string
          parsed[key] = value;
        } else {
          parsed[key] = paramConfig.type === 'integer' ? Math.round(parsedNum) : parsedNum;
        }
      } else {
        parsed[key] = value;
      }
    } else if (paramConfig.type === 'boolean') {
      if (typeof value === 'boolean') {
        parsed[key] = value;
      } else if (typeof value === 'string') {
        parsed[key] = value.toLowerCase() === 'true' || value === '1';
      } else {
        parsed[key] = Boolean(value);
      }
    } else {
      // String type, keep as-is
      parsed[key] = value;
    }
  }

  return parsed;
}

/**
 * Generate OpenAPI 3.0 schema for a model
 * @param modelId - Model ID or alias
 * @returns OpenAPI schema object
 */
export function generateOpenAPISchema(modelId: string): Record<string, unknown> {
  const model = getModelConfig(modelId);
  if (!model) {
    return {};
  }

  // Build request body schema from parameters
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, config] of Object.entries(model.parameters)) {
    const prop: Record<string, unknown> = {
      type: config.type === 'integer' || config.type === 'number' ? 'number' : 'string',
      description: config.cfParam,
    };

    if (config.default !== undefined) {
      prop.default = config.default;
    }
    if (config.min !== undefined) {
      prop.minimum = config.min;
    }
    if (config.max !== undefined) {
      prop.maximum = config.max;
    }
    if (config.required) {
      required.push(name);
    }

    properties[name] = prop;
  }

  const schema = {
    openapi: '3.0.0',
    info: {
      title: model.name,
      version: '1.0.0',
      description: model.description,
    },
    servers: [{ url: 'http://localhost:3000/v1' }],
    paths: {
      '/images/generations': {
        post: {
          summary: 'Generate images from text prompt',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    model: { type: 'string', default: modelId },
                    prompt: { type: 'string', description: 'Text description of the image' },
                    n: { type: 'integer', minimum: 1, maximum: 8, default: 1 },
                    size: { type: 'string', enum: model.limits.supportedSizes },
                    response_format: { type: 'string', enum: ['url', 'b64_json'] },
                    ...properties,
                  },
                  required: ['prompt'],
                },
              },
            },
          },
        },
      },
    },
  };

  return schema;
}

/**
 * Parse embedded parameters from prompt using --- delimiter
 * Example: "A sunset ---steps=8 --seed=1234"
 * Returns: { cleanPrompt: "A sunset", embeddedParams: { steps: 8, seed: 1234 } }
 * @param prompt - Prompt with optional embedded parameters
 * @returns Object containing clean prompt and parsed parameters
 */
export function parseEmbeddedParams(prompt: string): {
  cleanPrompt: string;
  embeddedParams: Record<string, unknown>;
} {
  // Split on --- delimiter
  const parts = prompt.split('---');
  const cleanPrompt = parts[0].trim();

  const embeddedParams: Record<string, unknown> = {};

  if (parts.length > 1) {
    // Parse each param: --key=value or -key=value or key=value
    const paramString = parts.slice(1).join('---').trim();
    // Match --key=value, -key=value, or key=value formats
    const paramRegex = /--?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^"'-\s][^-\s]*))/g;

    let match;
    // Reset regex lastIndex to ensure fresh matching
    paramRegex.lastIndex = 0;

    while ((match = paramRegex.exec(paramString)) !== null) {
      const key = match[1];
      const value = match[2] ?? match[3] ?? match[4];

      // Try to parse as number or boolean
      if (value !== undefined) {
        if (value === '') {
          embeddedParams[key] = true; // Flag format like --flag
        } else if (!isNaN(Number(value)) && value.trim() !== '') {
          embeddedParams[key] = Number(value);
        } else if (value.toLowerCase() === 'true') {
          embeddedParams[key] = true;
        } else if (value.toLowerCase() === 'false') {
          embeddedParams[key] = false;
        } else {
          embeddedParams[key] = value;
        }
      }
    }
  }

  return { cleanPrompt, embeddedParams };
}

/**
 * Merge parameters with embedded params taking precedence
 * Embedded params override explicit params
 * @param explicitParams - Explicitly provided parameters
 * @param embeddedParams - Parameters parsed from prompt
 * @returns Merged parameters with embedded taking precedence
 */
export function mergeParams(
  explicitParams: Record<string, unknown>,
  embeddedParams: Record<string, unknown>
): Record<string, unknown> {
  return { ...explicitParams, ...embeddedParams };
}

/**
 * Detect task type from parameters
 * @param params - Parameters including image and mask
 * @returns Detected task type
 */
export function detectTask(
  params: Partial<{
    task: string;
    image: unknown;
    mask: unknown;
  }>
): 'text-to-image' | 'image-to-image' | 'inpainting' {
  // If task is explicitly specified, use it
  if (params.task) {
    return params.task as 'text-to-image' | 'image-to-image' | 'inpainting';
  }

  // Auto-detect based on image and mask
  if (params.mask) {
    return 'inpainting';
  }
  if (params.image) {
    return 'image-to-image';
  }
  return 'text-to-image';
}
