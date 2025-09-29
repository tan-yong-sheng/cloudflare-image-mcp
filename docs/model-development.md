# Model Development Guide

This guide explains how to add new models to the Cloudflare Image MCP Server using the modular architecture.

## Architecture Overview

The model system is built around a modular architecture where each model is implemented as a separate class extending the `BaseModel` abstract class.

### Core Components

1. **BaseModel**: Abstract base class with common functionality
2. **Model Classes**: Individual model implementations
3. **Model Registry**: Central registry in `src/models/index.ts`

## Creating a New Model

### Step 1: Create Model Class

Create a new file in `src/models/` directory:

```typescript
// src/models/my-new-model.ts
import { BaseModel } from './base-model.js';
import { ModelConfig } from '../types.js';

export class MyNewModel extends BaseModel {
  readonly name = '@cf/provider/my-new-model';
  readonly config: ModelConfig = {
    maxPromptLength: 1000,
    defaultSteps: 10,
    maxSteps: 20,
    supportsNegativePrompt: true,
    supportsSize: true,
    supportsGuidance: true,
    supportsSeed: true,
    outputFormat: 'binary', // or 'base64'
    recommendedFor: 'specific use case description',

    // Optional fields
    defaultGuidance?: number,
    guidanceRange?: string,
    recommendedNegative?: string,
    notes?: string,
    supportsImageInput?: boolean,
    supportsMask?: boolean,
    supportsStrength?: boolean,
    guidanceValues?: number[],
    defaultSize?: string,
    maxWidth?: number,
    maxHeight?: number,
  };

  /**
   * Model-specific prompt enhancement
   */
  protected enhancePrompt(prompt: string): string {
    // Add model-specific enhancements
    return `high quality, ${prompt}`;
  }

  /**
   * Model-specific guidance optimization
   */
  protected optimizeGuidance(guidance: number): number {
    // Add model-specific guidance optimization
    return Math.max(1.0, Math.min(guidance, 15.0));
  }
}
```

### Step 2: Register the Model

Add your model to the registry in `src/models/index.ts`:

```typescript
// src/models/index.ts
import { MyNewModel } from './my-new-model.js';

export const SUPPORTED_MODELS: BaseModel[] = [
  // ... existing models
  new MyNewModel(),
];

export function getModelDescriptions(): Record<string, string> {
  return {
    // ... existing models
    "@cf/provider/my-new-model": "My New Model - Description of capabilities",
  };
}
```

### Step 3: Update Documentation

Update the documentation files:

1. **README.md**: Add your model to the support matrix
2. **docs/api-reference.md**: Add model-specific documentation
3. **docs/model-development.md**: (this file) - add any model-specific considerations

## Model Configuration Options

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Full model identifier |
| `maxPromptLength` | number | Maximum prompt length |
| `defaultSteps` | number | Default number of steps |
| `maxSteps` | number | Maximum number of steps |
| `supportsNegativePrompt` | boolean | Whether negative prompts are supported |
| `supportsSize` | boolean | Whether custom sizes are supported |
| `supportsGuidance` | boolean | Whether guidance control is supported |
| `supportsSeed` | boolean | Whether seed control is supported |
| `outputFormat` | string | 'binary' or 'base64' |
| `recommendedFor` | string | Description of best use cases |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `defaultGuidance` | number | Default guidance value |
| `guidanceRange` | string | Optimal guidance range |
| `recommendedNegative` | string | Default negative prompt |
| `notes` | string | Additional model information |
| `supportsStrength` | boolean | Whether strength control is supported |
| `guidanceValues` | number[] | Supported guidance values |
| `defaultSize` | string | Default image size |
| `maxWidth` | number | Maximum image width |
| `maxHeight` | number | Maximum image height |

## Model-Specific Customization

### Prompt Enhancement

Override the `enhancePrompt` method to add model-specific prompt improvements:

```typescript
protected enhancePrompt(prompt: string): string {
  const enhancedWords = ['detailed', 'high quality', 'masterpiece'];
  const lowerPrompt = prompt.toLowerCase();

  if (!enhancedWords.some(word => lowerPrompt.includes(word))) {
    return `detailed, high quality, ${prompt}`;
  }

  return prompt;
}
```

### Guidance Optimization

Override the `optimizeGuidance` method for model-specific guidance handling:

```typescript
protected optimizeGuidance(guidance: number): number {
  // Example: Leonardo AI specific guidance values
  const supportedValues = [1.0, 1.3, 1.8, 2.5, 3.0, 3.5, 4.0, 4.5];
  const closestValue = supportedValues.reduce((prev, curr) =>
    Math.abs(curr - guidance) < Math.abs(prev - guidance) ? curr : prev
  );

  return Math.max(0.0, Math.min(closestValue, 10.0));
}
```

### Custom Parameter Handling

The `buildRequestPayload` method in `BaseModel` handles common parameter processing. If your model requires special parameter handling, you can override it:

```typescript
buildRequestPayload(prompt: string, params: Record<string, any>): Record<string, any> {
  const payload = super.buildRequestPayload(prompt, params);

  // Add model-specific parameters
  payload.custom_param = this.processCustomParam(params.customParam);

  return payload;
}
```

## Testing Your Model

### Unit Testing

Create a test file for your model:

```typescript
// tests/models/my-new-model.test.ts
import { MyNewModel } from '../../src/models/my-new-model.js';

describe('MyNewModel', () => {
  let model: MyNewModel;

  beforeEach(() => {
    model = new MyNewModel();
  });

  describe('enhancePrompt', () => {
    it('should enhance prompt with quality keywords', () => {
      const result = model.enhancePrompt('a cat');
      expect(result).toContain('high quality');
      expect(result).toContain('a cat');
    });
  });

  describe('optimizeGuidance', () => {
    it('should clamp guidance to valid range', () => {
      expect(model.optimizeGuidance(25)).toBe(15.0);
      expect(model.optimizeGuidance(0)).toBe(1.0);
      expect(model.optimizeGuidance(7.5)).toBe(7.5);
    });
  });
});
```

### Integration Testing

Test your model with the actual MCP server:

```typescript
// tests/integration/my-new-model.test.ts
import { ImageService } from '../../src/image-service.js';

describe('MyNewModel Integration', () => {
  let service: ImageService;

  beforeEach(() => {
    service = new ImageService({
      cloudflareApiToken: 'test-token',
      cloudflareAccountId: 'test-account',
      defaultModel: '@cf/provider/my-new-model'
    });
  });

  it('should generate image with new model', async () => {
    const result = await service.generateImage({
      prompt: 'test prompt',
      model: '@cf/provider/my-new-model'
    });

    // Add assertions based on expected behavior
    expect(result).toBeDefined();
  });
});
```

## Best Practices

### 1. Follow Naming Conventions
- Use PascalCase for class names: `MyNewModel`
- Use kebab-case for file names: `my-new-model.ts`

### 2. Provide Comprehensive Configuration
- Fill out all relevant configuration fields
- Add helpful notes and descriptions
- Specify optimal parameter ranges

### 3. Handle Edge Cases
- Validate input parameters
- Handle API errors gracefully
- Provide meaningful error messages

### 4. Document Model-Specific Behavior
- Add detailed comments for special behavior
- Document parameter limitations
- Explain optimization strategies

### 5. Test Thoroughly
- Test prompt enhancement
- Test guidance optimization
- Test parameter validation
- Test error scenarios

## Example: Complete Model Implementation

Here's a complete example of a hypothetical new model:

```typescript
// src/models/advanced-sdxl.ts
import { BaseModel } from './base-model.js';
import { ModelConfig } from '../types.js';

export class AdvancedSDXLModel extends BaseModel {
  readonly name = '@cf/advanced/advanced-sdxl';
  readonly config: ModelConfig = {
    maxPromptLength: 1500,
    defaultSteps: 12,
    maxSteps: 25,
    supportsNegativePrompt: true,
    supportsSize: true,
    supportsGuidance: true,
    supportsSeed: true,
    supportsImageInput: true,
    supportsMask: true,
    supportsStrength: true,
    outputFormat: 'binary',
    recommendedFor: 'advanced image generation with enhanced quality',
    defaultGuidance: 11.0,
    guidanceRange: '8.0-15.0',
    recommendedNegative: 'blurry, low quality, distorted, unrealistic, bad anatomy, poor quality',
    notes: 'Advanced SDXL model with enhanced prompt understanding and quality optimization',
    defaultSize: '1024x1024',
    maxWidth: 1536,
    maxHeight: 1536,
  };

  protected enhancePrompt(prompt: string): string {
    const enhancedWords = [
      'masterpiece', 'best quality', 'ultra detailed', 'high resolution',
      'professional photography', '8k', 'sharp focus'
    ];
    const lowerPrompt = prompt.toLowerCase();

    if (!enhancedWords.some(word => lowerPrompt.includes(word))) {
      return `masterpiece, best quality, ultra detailed, ${prompt}`;
    }

    return prompt;
  }

  protected optimizeGuidance(guidance: number): number {
    // Advanced SDXL works best with guidance 8-15
    if (guidance === 7.5) {
      return this.config.defaultGuidance || 11.0;
    }
    return Math.max(8.0, Math.min(guidance, 15.0));
  }

  buildRequestPayload(prompt: string, params: Record<string, any>): Record<string, any> {
    const payload = super.buildRequestPayload(prompt, params);

    // Add advanced model-specific parameters
    payload.quality_boost = true;
    payload.style_enhancement = 'professional';

    return payload;
  }
}
```

This modular architecture makes it easy to add new models while maintaining consistency and reusability across the codebase.