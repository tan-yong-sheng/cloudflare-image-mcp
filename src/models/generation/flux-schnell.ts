import { BaseModel } from './base-model.js';
import { ModelConfig } from '../../types.js';

export class FluxSchnellModel extends BaseModel {
  readonly name = '@cf/black-forest-labs/flux-1-schnell';
  readonly config: ModelConfig = {
    maxPromptLength: 2048,
    defaultSteps: 4,
    maxSteps: 8,
    supportsNegativePrompt: false,
    supportsSize: false,
    supportsGuidance: false,
    supportsSeed: true,
    outputFormat: 'base64',
    recommendedFor: 'fast generation, high quality',
    fixedOutputSize: '1024x1024',
  };

  protected override enhancePrompt(prompt: string): string {
    // FLUX works well with detailed, artistic descriptions
    const enhancedWords = ['detailed', 'high quality', 'masterpiece'];
    const lowerPrompt = prompt.toLowerCase();

    if (!enhancedWords.some(word => lowerPrompt.includes(word))) {
      return `detailed, high quality, ${prompt}`;
    }

    return prompt;
  }

  protected override addStepsToPayload(payload: Record<string, unknown>, steps: number): void {
    // FLUX models use "steps" parameter
    payload.steps = steps;
  }
}