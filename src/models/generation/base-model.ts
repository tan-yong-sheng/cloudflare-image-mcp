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
  buildRequestPayload(prompt: string, params: Record<string, any>): Record<string, any> {
    const enhancedPrompt = this.preprocessPrompt(prompt);
    const payload: Record<string, any> = { prompt: enhancedPrompt };

    // Add negative prompt if supported
    if (this.config.supportsNegativePrompt && params.negativePrompt) {
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
      const size = params.size || this.config.defaultSize || '1024x1024';
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
      payload.guidance = this.optimizeGuidance(params.guidance || this.config.defaultGuidance || 7.5);
    }

    // Add seed if supported
    if (this.config.supportsSeed && params.seed) {
      payload.seed = params.seed;
    }

    // Add steps - will be handled by subclass to determine parameter name
    const steps = Math.min(params.steps || this.config.defaultSteps, this.config.maxSteps);
    this.addStepsToPayload(payload, steps);

    // Handle image input for img2img
    if (this.config.supportsImageInput && params.imageB64) {
      payload.image_b64 = params.imageB64;
      if (params.strength) {
        payload.strength = Math.max(0.1, Math.min(1.0, params.strength));
      }
    }

    // Handle mask for inpainting
    if (this.config.supportsMask && params.mask) {
      payload.mask = params.mask;
    }

    return payload;
  }

  /**
   * Add steps to payload with correct parameter name - must be implemented by subclasses
   */
  protected abstract addStepsToPayload(payload: Record<string, any>, steps: number): void;

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
      case 'imageB64':
        return this.config.supportsImageInput || false;
      case 'strength':
        return this.config.supportsStrength || false;
      case 'mask':
        return this.config.supportsMask || false;
      case 'seed':
        return this.config.supportsSeed;
      default:
        return true;
    }
  }
}