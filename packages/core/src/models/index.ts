// ============================================================================
// Model Registry - Helper functions for model lookups
// ============================================================================

import type { ModelConfig, ModelTask } from '../types.js';
import { MODEL_CONFIGS, MODEL_ALIASES } from './configs.js';

/**
 * Resolve a model ID or alias to the full model ID
 * @param input - Model ID or alias (e.g., "flux-schnell" or full ID)
 * @returns Full model ID
 */
export function resolveModelId(input: string): string {
  return MODEL_ALIASES[input] || input;
}

/**
 * Get model configuration by ID or alias
 * @param modelId - Model ID or alias
 * @returns Model configuration or null if not found
 */
export function getModelConfig(modelId: string): ModelConfig | null {
  const actualId = resolveModelId(modelId);
  return MODEL_CONFIGS[actualId] || null;
}

/**
 * Check if a model ID or alias is valid
 * @param modelId - Model ID or alias
 * @returns True if model exists
 */
export function isValidModel(modelId: string): boolean {
  const actualId = resolveModelId(modelId);
  return actualId in MODEL_CONFIGS;
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
    return `Unknown model: ${modelId}. Available models: ${Object.keys(MODEL_ALIASES).join(', ')}`;
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
