import { BaseModel } from './base-model.js';
import { ModelConfig } from '../../types.js';

export class SDXLLightningModel extends BaseModel {
  readonly name = '@cf/bytedance/stable-diffusion-xl-lightning';
  readonly config: ModelConfig = {
    maxPromptLength: 1000,
    defaultSteps: 4,
    maxSteps: 8,
    supportsNegativePrompt: true,
    supportsSize: true,
    supportsGuidance: true,
    supportsSeed: true,
    outputFormat: 'binary',
    recommendedFor: 'fast generation with good quality',
  };

  protected override enhancePrompt(prompt: string): string {
    // Similar to SDXL base but optimized for speed
    const enhancedWords = [
      'cinematic', 'artistic', 'professional', 'detailed',
      'high quality', 'masterpiece'
    ];
    const lowerPrompt = prompt.toLowerCase();

    if (!enhancedWords.some(word => lowerPrompt.includes(word))) {
      return `professional, detailed, ${prompt}`;
    }

    return prompt;
  }

  protected override addStepsToPayload(payload: Record<string, unknown>, steps: number): void {
    // SDXL models use "num_steps" parameter
    payload.num_steps = steps;
  }
}