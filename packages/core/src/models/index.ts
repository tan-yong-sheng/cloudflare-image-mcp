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
