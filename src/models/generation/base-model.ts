import { ModelConfig } from '../../types.js';

export abstract class BaseModel {
  abstract readonly name: string;
  abstract readonly config: ModelConfig;

  /**
   * Preprocess prompt based on model requirements
   */
  preprocessPrompt(prompt: string): string {
    const { maxPromptLength } = this.config;

    // Truncate if too long
    if (prompt.length > maxPromptLength) {
      prompt = prompt.slice(0, maxPromptLength - 3) + "...";
    }

    return this.enhancePrompt(prompt);
  }

  /**
   * Model-specific prompt enhancement - must be implemented by subclasses
   */
  protected abstract enhancePrompt(prompt: string): string;

  /**
   * Build request payload with model-specific preprocessing
   */
  buildRequestPayload(prompt: string, params: Record<string, unknown>): Record<string, unknown> {
    const enhancedPrompt = this.preprocessPrompt(prompt);
    const payload: Record<string, unknown> = { prompt: enhancedPrompt };

    // Add negative prompt if supported
    if (this.config.supportsNegativePrompt && typeof params.negativePrompt === 'string') {
      let negativePrompt = params.negativePrompt;

      // Auto-enhance negative prompt for SDXL if none provided
      if (this.name.includes('stable-diffusion-xl-base-1.0') && !negativePrompt.trim()) {
        negativePrompt = this.config.recommendedNegative || '';
      }

      if (negativePrompt) {
        payload.negative_prompt = negativePrompt;
      }
    }

    // Add size if supported
    if (this.config.supportsSize) {
      const size = typeof params.size === 'string' ? params.size : this.config.defaultSize || '1024x1024';
      if (size.includes('x')) {
        const [width, height] = size.split('x').map(Number);
        const maxWidth = this.config.maxWidth || 2048;
        const maxHeight = this.config.maxHeight || 2048;

        payload.width = Math.max(256, Math.min(maxWidth, width));
        payload.height = Math.max(256, Math.min(maxHeight, height));
      }
    }

    // Add guidance with model-specific optimization
    if (this.config.supportsGuidance) {
      const guidance = typeof params.guidance === 'number' ? params.guidance : this.config.defaultGuidance || 7.5;
      payload.guidance = this.optimizeGuidance(guidance);
    }

    // Add seed if supported
    if (this.config.supportsSeed && typeof params.seed === 'number') {
      payload.seed = params.seed;
    }

    // Add steps - will be handled by subclass to determine parameter name
    const steps = Math.min(typeof params.steps === 'number' ? params.steps : this.config.defaultSteps, this.config.maxSteps);
    this.addStepsToPayload(payload, steps);

    return payload;
  }

  /**
   * Add steps to payload with correct parameter name - must be implemented by subclasses
   */
  protected abstract addStepsToPayload(payload: Record<string, unknown>, steps: number): void;

  /**
   * Model-specific guidance optimization - can be overridden by subclasses
   */
  protected optimizeGuidance(guidance: number): number {
    return guidance;
  }

  /**
   * Check if parameter is supported by this model
   */
  isParameterSupported(paramName: string): boolean {
    switch (paramName) {
      case 'negativePrompt':
        return this.config.supportsNegativePrompt;
      case 'size':
        return this.config.supportsSize;
      case 'guidance':
        return this.config.supportsGuidance;
      case 'seed':
        return this.config.supportsSeed;
      default:
        return true;
    }
  }
}