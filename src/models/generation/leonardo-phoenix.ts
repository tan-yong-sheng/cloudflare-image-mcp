import { BaseModel } from './base-model.js';
import { ModelConfig } from '../../types.js';

export class LeonardoPhoenixModel extends BaseModel {
  readonly name = '@cf/leonardo/phoenix-1.0';
  readonly config: ModelConfig = {
    maxPromptLength: 2048,
    defaultSteps: 25,
    maxSteps: 50,
    supportsNegativePrompt: true,
    supportsSize: true,
    supportsGuidance: true,
    supportsSeed: true,
    outputFormat: 'binary',
    recommendedFor: 'exceptional prompt adherence and coherent text generation',
    defaultGuidance: 3.5,
    guidanceRange: '2.0-10.0',
    guidanceValues: [1.0, 1.3, 1.8, 2.5, 3.0, 3.5, 4.0, 4.5],
    defaultSize: '512x512',
    maxWidth: 2048,
    maxHeight: 2048,
    notes: 'Leonardo AI Phoenix 1.0 - Use contrast 3.5 for medium, 4.0 for high contrast. Alchemy mode requires contrast ≥2.5'
  };

  protected override enhancePrompt(prompt: string): string {
    // Leonardo Phoenix works well with detailed prompts
    const enhancedWords = ['detailed', 'high quality', 'professional'];
    const lowerPrompt = prompt.toLowerCase();

    if (!enhancedWords.some(word => lowerPrompt.includes(word))) {
      return `detailed, high quality, ${prompt}`;
    }

    return prompt;
  }

  protected override optimizeGuidance(guidance: number): number {
    // Leonardo AI recommends specific contrast values
    const supportedValues = this.config.guidanceValues || [1.0, 1.3, 1.8, 2.5, 3.0, 3.5, 4.0, 4.5];

    // Round to nearest supported value
    const closestValue = supportedValues.reduce((prev: number, curr: number) =>
      Math.abs(curr - guidance) < Math.abs(prev - guidance) ? curr : prev
    );

    // Clamp to API range
    return Math.max(2.0, Math.min(closestValue, 10.0));
  }

  protected override addStepsToPayload(payload: Record<string, unknown>, steps: number): void {
    // Leonardo models use "steps" parameter
    payload.steps = steps;
  }
}