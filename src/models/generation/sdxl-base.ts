import { BaseModel } from './base-model.js';
import { ModelConfig } from '../../types.js';

export class SDXLBaseModel extends BaseModel {
  readonly name = '@cf/stabilityai/stable-diffusion-xl-base-1.0';
  readonly config: ModelConfig = {
    maxPromptLength: 1000,
    defaultSteps: 15,
    maxSteps: 20,
    supportsNegativePrompt: true,
    supportsSize: true,
    supportsGuidance: true,
    supportsSeed: true,
    supportsImageInput: true,
    supportsMask: true,
    supportsStrength: true,
    outputFormat: 'binary',
    recommendedFor: 'high quality, detailed images',
    defaultGuidance: 12.0,
    guidanceRange: '10.0-15.0',
    recommendedNegative: 'blurry, low quality, distorted, unrealistic, bad anatomy, poor quality, jpeg artifacts',
    notes: 'SDXL works best with guidance 10-15, detailed prompts, and comprehensive negative prompts'
  };

  protected override enhancePrompt(prompt: string): string {
    // SDXL models benefit from style descriptors and detailed prompts
    const enhancedWords = [
      'cinematic', 'artistic', 'professional', 'detailed',
      'high quality', 'masterpiece', 'ultra realistic'
    ];
    const lowerPrompt = prompt.toLowerCase();

    if (!enhancedWords.some(word => lowerPrompt.includes(word))) {
      return `professional, cinematic, highly detailed, ${prompt}`;
    }

    return prompt;
  }

  protected override optimizeGuidance(guidance: number): number {
    // Use optimized guidance range for SDXL: 10-15 for better quality
    if (guidance === 7.5) {
      return this.config.defaultGuidance || 12.0;
    }
    return Math.max(10.0, Math.min(guidance, 15.0));
  }

  protected override addStepsToPayload(payload: Record<string, any>, steps: number): void {
    // SDXL models use "num_steps" parameter
    payload.num_steps = steps;
  }
}