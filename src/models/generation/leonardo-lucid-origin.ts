import { BaseModel } from './base-model.js';
import { ModelConfig } from '../../types.js';

export class LeonardoLucidOriginModel extends BaseModel {
  readonly name = '@cf/leonardo/lucid-origin';
  readonly config: ModelConfig = {
    maxPromptLength: 2048,
    defaultSteps: 4,
    maxSteps: 40,
    supportsNegativePrompt: false,
    supportsSize: true,
    supportsGuidance: true,
    supportsSeed: true,
    outputFormat: 'base64',
    recommendedFor: 'adaptable model for graphic design, HD renders, and creative direction',
    defaultGuidance: 3.5,
    guidanceRange: '0.0-10.0',
    guidanceValues: [1.0, 1.3, 1.8, 2.5, 3.0, 3.5, 4.0, 4.5],
    defaultSize: '1024x1024',
    maxWidth: 2500,
    maxHeight: 2500,
    notes: 'Leonardo AI Lucid Origin - Use contrast 3.5 for medium quality. Most adaptable model with wide style support'
  };

  protected override enhancePrompt(prompt: string): string {
    // Leonardo Lucid Origin works well with creative prompts
    const enhancedWords = ['detailed', 'high quality', 'creative', 'artistic'];
    const lowerPrompt = prompt.toLowerCase();

    if (!enhancedWords.some(word => lowerPrompt.includes(word))) {
      return `detailed, creative, ${prompt}`;
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
    return Math.max(0.0, Math.min(closestValue, 10.0));
  }

  protected override addStepsToPayload(payload: Record<string, unknown>, steps: number): void {
    // Leonardo models use "steps" parameter
    payload.steps = steps;
  }
}