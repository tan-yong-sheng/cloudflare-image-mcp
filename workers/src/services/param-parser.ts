// ============================================================================
// Parameter Parser - Parses --key=value syntax from prompt
// Supports both prompt-embedded parameters and standard JSON fields
// ============================================================================

import type { ParsedParams, ModelConfig } from '../types.js';

export class ParamParser {
  /**
   * Parse parameters from prompt with --key=value syntax
   * Also merges with explicit JSON fields
   *
   * Examples:
   * - "cyberpunk cat --steps=6 --seed=12345"
   * - "portrait photo --width=512 --height=768 --guidance=8.5"
   * - "surreal landscape --n=3" (for multiple images)
   */
  static parse(
    input: string | Record<string, any>,
    explicitParams: Record<string, any> = {},
    modelConfig?: ModelConfig
  ): ParsedParams {
    // Handle object input (OpenAI JSON format)
    if (typeof input === 'object' && input !== null) {
      return this.parseObject(input, modelConfig);
    }

    // Handle string input with --key=value syntax
    if (typeof input === 'string') {
      return this.parseString(input, explicitParams, modelConfig);
    }

    throw new Error(`Invalid input type: ${typeof input}`);
  }

  /**
   * Parse a string with embedded parameters
   */
  private static parseString(
    raw: string,
    explicitParams: Record<string, any>,
    modelConfig?: ModelConfig
  ): ParsedParams {
    // Match --key=value or --key value patterns
    const paramRegex = /--(\w+)(?:=(.+?))?(?=\s+--|\s*$)/g;
    const params: Record<string, string> = {};
    let match;

    // Extract pure prompt (everything before first --)
    const promptMatch = raw.match(/^([^-]+?)(?=\s+--)/);
    const purePrompt = promptMatch ? promptMatch[1].trim() : raw;

    // Parse embedded parameters
    while ((match = paramRegex.exec(raw)) !== null) {
      const key = match[1];
      const value = match[2]?.trim() || 'true';
      params[key.toLowerCase()] = value;
    }

    // Merge explicit params (higher priority) with embedded params
    const mergedParams = { ...params, ...explicitParams };

    // Parse and validate each parameter
    const result: ParsedParams = {
      prompt: purePrompt,
      rawPrompt: raw,
    };

    // Standard parameters
    if (mergedParams.n !== undefined) {
      result.n = this.parseInteger(mergedParams.n, 1, 10, 'n');
    }
    if (mergedParams.size !== undefined) {
      result.size = this.parseSize(mergedParams.size);
    }
    if (mergedParams.width !== undefined) {
      result.width = this.parseInteger(mergedParams.width, 256, 2048, 'width');
    }
    if (mergedParams.height !== undefined) {
      result.height = this.parseInteger(mergedParams.height, 256, 2048, 'height');
    }

    // Cloudflare-specific parameters
    if (mergedParams.steps !== undefined) {
      result.steps = this.parseInteger(mergedParams.steps, 1, modelConfig?.limits?.maxSteps || 50, 'steps');
    }
    if (mergedParams.num_steps !== undefined) {
      result.steps = this.parseInteger(mergedParams.num_steps, 1, modelConfig?.limits?.maxSteps || 20, 'num_steps');
    }
    if (mergedParams.seed !== undefined) {
      result.seed = this.parseInteger(mergedParams.seed, 0, Number.MAX_SAFE_INTEGER, 'seed');
    }
    if (mergedParams.guidance !== undefined) {
      result.guidance = this.parseNumber(mergedParams.guidance, 1, 30, 'guidance');
    }
    if (mergedParams.negative_prompt !== undefined) {
      result.negative_prompt = String(mergedParams.negative_prompt);
    }
    if (mergedParams.strength !== undefined) {
      result.strength = this.parseNumber(mergedParams.strength, 0, 1, 'strength');
    }

    // Image inputs
    if (mergedParams.image !== undefined) {
      result.image_b64 = this.extractBase64(mergedParams.image);
    }
    if (mergedParams.image_b64 !== undefined) {
      result.image_b64 = this.extractBase64(mergedParams.image_b64);
    }
    if (mergedParams.mask !== undefined) {
      result.mask_b64 = this.extractBase64(mergedParams.mask);
    }

    // Apply model-specific limits
    if (modelConfig) {
      this.applyModelLimitsInPlace(result, modelConfig);
    }

    return result;
  }

  /**
   * Parse object input (OpenAI JSON format)
   */
  private static parseObject(
    obj: Record<string, any>,
    modelConfig?: ModelConfig
  ): ParsedParams {
    const result: ParsedParams = {
      prompt: obj.prompt || '',
      rawPrompt: obj.prompt || '',
    };

    // Standard OpenAI parameters
    if (obj.n !== undefined) {
      result.n = this.parseInteger(obj.n, 1, 10, 'n');
    }
    if (obj.size !== undefined) {
      result.size = this.parseSize(obj.size);
      const [width, height] = result.size.split('x').map(Number);
      result.width = width;
      result.height = height;
    }

    // Cloudflare-specific parameters
    if (obj.steps !== undefined) {
      result.steps = this.parseInteger(obj.steps, 1, modelConfig?.limits?.maxSteps || 50, 'steps');
    }
    if (obj.num_steps !== undefined) {
      result.steps = this.parseInteger(obj.num_steps, 1, modelConfig?.limits?.maxSteps || 20, 'num_steps');
    }
    if (obj.seed !== undefined) {
      result.seed = this.parseInteger(obj.seed, 0, Number.MAX_SAFE_INTEGER, 'seed');
    }
    if (obj.guidance !== undefined) {
      result.guidance = this.parseNumber(obj.guidance, 1, 30, 'guidance');
    }
    if (obj.negative_prompt !== undefined) {
      result.negative_prompt = String(obj.negative_prompt);
    }
    if (obj.strength !== undefined) {
      result.strength = this.parseNumber(obj.strength, 0, 1, 'strength');
    }

    // Image inputs
    if (obj.image !== undefined) {
      result.image_b64 = this.extractBase64(obj.image);
    }
    if (obj.image_b64 !== undefined) {
      result.image_b64 = this.extractBase64(obj.image_b64);
    }
    if (obj.mask !== undefined) {
      result.mask_b64 = this.extractBase64(obj.mask);
    }

    // Apply model-specific limits
    if (modelConfig) {
      this.applyModelLimitsInPlace(result, modelConfig);
    }

    return result;
  }

  /**
   * Apply model-specific limits in place
   */
  private static applyModelLimitsInPlace(params: ParsedParams, model: ModelConfig): void {
    const limits = model.limits;

    if (params.width !== undefined) {
      params.width = Math.max(limits.minWidth, Math.min(limits.maxWidth, params.width));
    }
    if (params.height !== undefined) {
      params.height = Math.max(limits.minHeight, Math.min(limits.maxHeight, params.height));
    }
    if (params.steps !== undefined) {
      params.steps = Math.max(1, Math.min(limits.maxSteps, params.steps));
    }
  }

  /**
   * Parse size string (e.g., "1024x1024")
   */
  private static parseSize(size: string): string {
    const match = size.match(/^(\d+)x(\d+)$/);
    if (!match) {
      throw new Error(`Invalid size format: ${size}. Use WxH format (e.g., 1024x1024)`);
    }
    const width = parseInt(match[1], 10);
    const height = parseInt(match[2], 10);
    return `${width}x${height}`;
  }

  /**
   * Parse integer with validation
   */
  private static parseInteger(value: any, min: number, max: number, name: string): number {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Invalid ${name}: must be an integer`);
    }
    if (parsed < min || parsed > max) {
      throw new Error(`${name} must be between ${min} and ${max}`);
    }
    return parsed;
  }

  /**
   * Parse number with validation
   */
  private static parseNumber(value: any, min: number, max: number, name: string): number {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      throw new Error(`Invalid ${name}: must be a number`);
    }
    if (parsed < min || parsed > max) {
      throw new Error(`${name} must be between ${min} and ${max}`);
    }
    return parsed;
  }

  /**
   * Extract base64 from data URI or raw base64 string
   */
  private static extractBase64(input: string): string {
    if (input.startsWith('data:')) {
      // Extract from data:image/png;base64,XXXXX
      const match = input.match(/base64,(.+)$/);
      if (!match) {
        throw new Error('Invalid data URI format');
      }
      return match[1];
    }
    return input;
  }

  /**
   * Convert parsed params to Cloudflare AI payload
   */
  static toCFPayload(params: ParsedParams, model: ModelConfig): Record<string, any> {
    const payload: Record<string, any> = {
      prompt: params.prompt,
    };

    // Map each supported parameter to its Cloudflare equivalent
    for (const [key, config] of Object.entries(model.parameters)) {
      const value = (params as any)[key];
      if (value !== undefined && value !== null) {
        payload[config.cfParam] = value;
      }
    }

    return payload;
  }

  /**
   * Format help text for a model
   */
  static formatHelp(model: ModelConfig): string {
    const lines = [`## ${model.name} Parameters`, ''];

    for (const [key, config] of Object.entries(model.parameters)) {
      const required = config.required ? ' (required)' : '';
      const defaultStr = config.default !== undefined ? ` [default: ${config.default}]` : '';
      const rangeStr =
        config.min !== undefined && config.max !== undefined
          ? ` [${config.min}-${config.max}]`
          : '';

      lines.push(`--${key}${required}${defaultStr}${rangeStr}`);
      if (config.description) {
        lines.push(`  ${config.description}`);
      }
    }

    return lines.join('\n');
  }
}
