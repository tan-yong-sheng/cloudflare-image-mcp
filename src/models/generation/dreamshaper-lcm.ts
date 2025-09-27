import { BaseModel } from './base-model.js';
import { ModelConfig } from '../../types.js';

export class DreamshaperLCMModel extends BaseModel {
  readonly name = '@cf/lykon/dreamshaper-8-lcm';
  readonly config: ModelConfig = {
    maxPromptLength: 1000,
    defaultSteps: 4,
    maxSteps: 8,
    supportsNegativePrompt: true,
    supportsSize: true,
    supportsGuidance: true,
    supportsSeed: true,
    supportsImageInput: true,
    supportsMask: true,
    supportsStrength: true,
    outputFormat: 'binary',
    recommendedFor: 'photorealistic images (LCM - use 4-8 steps, lower guidance)',
    guidanceRange: '1.0-2.0',
    notes: 'LCM model - requires 4-8 steps and lower guidance (1.0-2.0) for best results'
  };

  protected override enhancePrompt(prompt: string): string {
    // DreamShaper excels at photorealistic content
    const enhancedWords = ['photorealistic', 'realistic', 'photo'];
    const lowerPrompt = prompt.toLowerCase();

    if (!enhancedWords.some(word => lowerPrompt.includes(word))) {
      return `photorealistic, ${prompt}`;
    }

    return prompt;
  }

  protected override optimizeGuidance(guidance: number): number {
    // LCM works better with lower guidance
    const optimized = Math.min(guidance, 2.0);
    return optimized > 2.0 ? 1.5 : optimized;
  }

  protected override addStepsToPayload(payload: Record<string, any>, steps: number): void {
    // SDXL-based models use "num_steps" parameter
    payload.num_steps = steps;
  }
}