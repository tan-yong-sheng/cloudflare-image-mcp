// ============================================================================
// Model Configurations - Central configuration for all supported models
// ============================================================================

import type { ModelConfig } from "../types.js";

// Shared parameter fragments (C0): single-shape blocks referenced by
// value across models. Read-only at runtime (iteration/serialization
// only, never mutated) — safe to share by reference. Multi-shape
// params (steps, num_steps, guidance, lucid dims) stay inline.
type ParamEntry = ModelConfig["parameters"][string];

const promptParam: ParamEntry = {
  cfParam: "prompt",
  type: "string",
  required: true,
  description: "Text description of the image",
};

const seedParam: ParamEntry = {
  cfParam: "seed",
  type: "integer",
  default: null,
  description: "Random seed for reproducibility",
};

const negativePromptParam: ParamEntry = {
  cfParam: "negative_prompt",
  type: "string",
  default: "",
  description: "Elements to avoid in the image",
};

const imageParam: ParamEntry = {
  cfParam: "image",
  type: "string",
  required: false,
  description: "Input image for img2img (base64 encoded, up to 4 images)",
};

const imageB64Param: ParamEntry = {
  cfParam: "image_b64",
  type: "string",
  default: null,
  description: "Input image for img2img (base64)",
};

const maskB64Param: ParamEntry = {
  cfParam: "mask",
  type: "string",
  default: null,
  description: "Mask for masked edits (base64)",
};

const strengthParam: ParamEntry = {
  cfParam: "strength",
  type: "number",
  default: 1,
  min: 0,
  max: 1,
  description: "Img2img transformation strength",
};

// Provenance notes (docs-verified Oct 2026):
// - step: 64 appears on NO official Cloudflare page, but it feeds the MCP
//   schema step hint and the UI falls back to 64 for w/h regardless, so it
//   stays as an inert default rather than churning the API surface.
// - flux-2 dims bounds are functional but unverified (Cloudflare publishes
//   an opaque multipart schema); BFL's own 4MP ceiling suggests ours may
//   be conservative. Live size probing deferred to post-0.2.0.
// - schnell limits are inert: it declares no width/height params, so
//   toCFPayload drops dims and the UI hides size; the shape stays because
//   ModelConfig.limits requires all bounds plus supportedSizes.
//
// Q5: constants as values (no factories) — one constant per identical
// block, referenced by value in each model.
const dims1024Width: ParamEntry = {
  cfParam: "width",
  type: "integer",
  default: 1024,
  min: 256,
  max: 2048,
  step: 64,
  description: "Image width in pixels",
};

const dims1024Height: ParamEntry = {
  cfParam: "height",
  type: "integer",
  default: 1024,
  min: 256,
  max: 2048,
  step: 64,
  description: "Image height in pixels",
};

const dims512Width: ParamEntry = {
  cfParam: "width",
  type: "integer",
  default: 512,
  min: 256,
  max: 2048,
  step: 64,
  description: "Image width in pixels",
};

const dims512Height: ParamEntry = {
  cfParam: "height",
  type: "integer",
  default: 512,
  min: 256,
  max: 2048,
  step: 64,
  description: "Image height in pixels",
};

// Docs-verified minima (Cloudflare pages): Leonardo models accept min 0
// (no schema lower bound); other models keep the 256 floor above.
const dims1024WidthMin0: ParamEntry = {
  cfParam: "width",
  type: "integer",
  default: 1024,
  min: 0,
  max: 2048,
  step: 64,
  description: "Image width in pixels",
};

const dims1024HeightMin0: ParamEntry = {
  cfParam: "height",
  type: "integer",
  default: 1024,
  min: 0,
  max: 2048,
  step: 64,
  description: "Image height in pixels",
};

const dimsLucidWidth: ParamEntry = {
  cfParam: "width",
  type: "integer",
  default: 1120,
  min: 0,
  max: 2500,
  step: 64,
  description: "Image width in pixels",
};

const dimsLucidHeight: ParamEntry = {
  cfParam: "height",
  type: "integer",
  default: 1120,
  min: 0,
  max: 2500,
  step: 64,
  description: "Image height in pixels",
};

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  "@cf/black-forest-labs/flux-1-schnell": {
    id: "@cf/black-forest-labs/flux-1-schnell",
    name: "FLUX.1 [schnell]",
    description:
      "Fast 12B parameter rectified flow transformer for rapid image generation",
    provider: "black-forest-labs",
    apiVersion: 2,
    inputFormat: "json",
    responseFormat: "base64",
    supportedTasks: ["text-to-image"],
    parameters: {
      prompt: promptParam,
      steps: {
        cfParam: "steps",
        type: "integer",
        default: 4,
        min: 1,
        max: 8,
        description: "Diffusion steps (higher = better quality, slower)",
      },
      seed: seedParam,
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 4,
      maxSteps: 8,
      minWidth: 512,
      maxWidth: 2048,
      minHeight: 512,
      maxHeight: 2048,
      supportedSizes: ["1024x1024"],
    },
  },
  "@cf/black-forest-labs/flux-2-klein-4b": {
    id: "@cf/black-forest-labs/flux-2-klein-4b",
    name: "FLUX.2 [klein]",
    description:
      "Ultra-fast distilled model unifying image generation and editing",
    provider: "black-forest-labs",
    apiVersion: 2,
    inputFormat: "multipart",
    responseFormat: "base64",
    supportedTasks: ["text-to-image", "image-to-image"],
    maxInputImages: 4,
    parameters: {
      prompt: promptParam,
      steps: {
        cfParam: "steps",
        type: "integer",
        default: 4,
        min: 1,
        max: 50,
        description: "Diffusion steps",
      },
      seed: seedParam,
      width: dims1024Width,
      height: dims1024Height,
      image: imageParam,
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 4,
      maxSteps: 50,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      // Live probe 2026-10-12: klein-4b returns 1024x1024 for every
      // requested size — provider accepts w/h, ignores them.
      supportedSizes: ["1024x1024"],
    },
  },
  "@cf/black-forest-labs/flux-2-dev": {
    id: "@cf/black-forest-labs/flux-2-dev",
    name: "FLUX.2 [dev]",
    description: "High-quality image model with multi-reference support",
    provider: "black-forest-labs",
    apiVersion: 2,
    inputFormat: "multipart",
    responseFormat: "base64",
    supportedTasks: ["text-to-image", "image-to-image"],
    maxInputImages: 4,
    parameters: {
      prompt: promptParam,
      steps: {
        cfParam: "steps",
        type: "integer",
        default: 20,
        min: 1,
        max: 50,
        description: "Diffusion steps",
      },
      seed: seedParam,
      width: dims1024Width,
      height: dims1024Height,
      image: imageParam,
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 20,
      maxSteps: 50,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      // Live probe 2026-10-12: klein-4b returns 1024x1024 for every
      // requested size — provider accepts w/h, ignores them.
      supportedSizes: ["1024x1024"],
    },
  },
  "@cf/black-forest-labs/flux-2-klein-9b": {
    id: "@cf/black-forest-labs/flux-2-klein-9b",
    name: "FLUX.2 [klein] 9B",
    description:
      "Ultra-fast, distilled 9B image model with enhanced quality, unifying generation and editing",
    provider: "black-forest-labs",
    apiVersion: 2,
    inputFormat: "multipart",
    responseFormat: "base64",
    supportedTasks: ["text-to-image", "image-to-image"],
    maxInputImages: 4,
    parameters: {
      prompt: promptParam,
      steps: {
        cfParam: "steps",
        type: "integer",
        default: 25,
        min: 1,
        max: 50,
        description: "Diffusion steps",
      },
      seed: seedParam,
      width: dims1024Width,
      height: dims1024Height,
      image: imageParam,
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 25,
      maxSteps: 50,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      // Live probe 2026-10-12: klein-4b returns 1024x1024 for every
      // requested size — provider accepts w/h, ignores them.
      supportedSizes: ["1024x1024"],
    },
  },
  "@cf/stabilityai/stable-diffusion-xl-base-1.0": {
    id: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    name: "Stable Diffusion XL Base 1.0",
    description: "High-quality diffusion model by Stability AI",
    provider: "stabilityai",
    apiVersion: 2,
    inputFormat: "json",
    responseFormat: "binary",
    supportedTasks: ["text-to-image", "image-to-image"],
    editCapabilities: { mask: "supported" },
    parameters: {
      prompt: promptParam,
      negative_prompt: negativePromptParam,
      num_steps: {
        cfParam: "num_steps",
        type: "integer",
        default: 20,
        min: 1,
        max: 20,
        description: "Diffusion steps",
      },
      guidance: {
        cfParam: "guidance",
        type: "number",
        default: 7.5,
        min: 1,
        max: 30,
        description: "Prompt adherence strength",
      },
      seed: seedParam,
      width: dims1024Width,
      height: dims1024Height,
      image_b64: imageB64Param,
      mask_b64: maskB64Param,
      strength: strengthParam,
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 20,
      maxSteps: 20,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      // Live probes 2026-10-13: provider returns 1024x1024 for every
      // requested size (incl. 1024x1792 portrait) — sizes accepted,
      // ignored.
      supportedSizes: ["1024x1024"],
    },
  },
  "@cf/bytedance/stable-diffusion-xl-lightning": {
    id: "@cf/bytedance/stable-diffusion-xl-lightning",
    name: "SDXL Lightning",
    description: "Lightning-fast SDXL model for high-quality 1024px images",
    provider: "bytedance",
    apiVersion: 2,
    inputFormat: "json",
    responseFormat: "binary",
    supportedTasks: ["text-to-image"],
    parameters: {
      prompt: promptParam,
      negative_prompt: negativePromptParam,
      num_steps: {
        cfParam: "num_steps",
        type: "integer",
        default: 4,
        min: 1,
        max: 20,
        description: "Diffusion steps",
      },
      guidance: {
        cfParam: "guidance",
        type: "number",
        default: 7.5,
        min: 1,
        max: 30,
        description: "Prompt adherence strength",
      },
      seed: seedParam,
      width: dims1024Width,
      height: dims1024Height,
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 4,
      maxSteps: 20,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      supportedSizes: ["1024x1024"],
    },
  },
  "@cf/lykon/dreamshaper-8-lcm": {
    id: "@cf/lykon/dreamshaper-8-lcm",
    name: "@cf/lykon/dreamshaper-8-lcm 8 LCM",
    description: "Enhanced photorealistic SD model with LCM acceleration",
    provider: "lykon",
    apiVersion: 2,
    inputFormat: "json",
    responseFormat: "binary",
    supportedTasks: ["text-to-image", "image-to-image"],
    parameters: {
      prompt: promptParam,
      negative_prompt: negativePromptParam,
      num_steps: {
        cfParam: "num_steps",
        type: "integer",
        default: 8,
        min: 1,
        max: 20,
        description: "Diffusion steps",
      },
      guidance: {
        cfParam: "guidance",
        type: "number",
        default: 7.5,
        min: 1,
        max: 30,
        description: "Prompt adherence strength",
      },
      seed: seedParam,
      width: dims1024Width,
      height: dims1024Height,
      image_b64: imageB64Param,
      strength: strengthParam,
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 8,
      maxSteps: 20,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      supportedSizes: ["512x512"],
    },
  },
  "@cf/leonardo/lucid-origin": {
    id: "@cf/leonardo/lucid-origin",
    name: "Lucid Origin",
    description: "Leonardo.AI's most adaptable and prompt-responsive model",
    provider: "leonardo",
    apiVersion: 2,
    inputFormat: "json",
    responseFormat: "base64",
    supportedTasks: ["text-to-image"],
    parameters: {
      prompt: promptParam,
      guidance: {
        cfParam: "guidance",
        type: "number",
        default: 4.5,
        min: 0,
        max: 10,
        description: "Prompt adherence strength",
      },
      seed: seedParam,
      width: dimsLucidWidth,
      height: dimsLucidHeight,
      num_steps: {
        cfParam: "num_steps",
        type: "integer",
        default: 4,
        min: 1,
        max: 40,
        description: "Diffusion steps",
      },
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 4,
      maxSteps: 40,
      minWidth: 0,
      maxWidth: 2500,
      minHeight: 0,
      maxHeight: 2500,
      // Live probe 2026-10-13: 1280x720 request returned 1120x1120
      // (the default) — provider ignores requested size.
      supportedSizes: ["1120x1120"],
    },
  },
  "@cf/leonardo/phoenix-1.0": {
    id: "@cf/leonardo/phoenix-1.0",
    name: "Phoenix 1.0",
    description:
      "Leonardo.AI model with exceptional prompt adherence and coherent text",
    provider: "leonardo",
    apiVersion: 2,
    inputFormat: "json",
    responseFormat: "binary",
    supportedTasks: ["text-to-image"],
    parameters: {
      prompt: promptParam,
      guidance: {
        cfParam: "guidance",
        type: "number",
        default: 2,
        min: 2,
        max: 10,
        description: "Prompt adherence strength",
      },
      seed: seedParam,
      width: dims1024WidthMin0,
      height: dims1024HeightMin0,
      num_steps: {
        cfParam: "num_steps",
        type: "integer",
        default: 25,
        min: 1,
        max: 50,
        description: "Diffusion steps",
      },
      negative_prompt: negativePromptParam,
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 25,
      maxSteps: 50,
      minWidth: 0,
      maxWidth: 2048,
      minHeight: 0,
      maxHeight: 2048,
      // Live probes 2026-10-13: 512/1024/1280 requests all returned
      // 1024x1024 — provider ignores requested size.
      supportedSizes: ["1024x1024"],
    },
  },

  "@cf/runwayml/stable-diffusion-v1-5-inpainting": {
    id: "@cf/runwayml/stable-diffusion-v1-5-inpainting",
    name: "Stable Diffusion 1.5 Inpainting",
    description: "Stable Diffusion for masked edits (requires mask)",
    provider: "runwayml",
    apiVersion: 2,
    inputFormat: "json",
    responseFormat: "binary",
    supportedTasks: ["image-to-image"],
    editCapabilities: { mask: "required" },
    parameters: {
      prompt: promptParam,
      negative_prompt: negativePromptParam,
      width: dims512Width,
      height: dims512Height,
      image_b64: imageB64Param,
      mask_b64: maskB64Param,
      num_steps: {
        cfParam: "num_steps",
        type: "integer",
        default: 20,
        min: 1,
        max: 20,
        description: "Diffusion steps",
      },
      strength: strengthParam,
      guidance: {
        cfParam: "guidance",
        type: "number",
        default: 7.5,
        min: 1,
        max: 30,
        description: "Prompt adherence strength",
      },
      seed: seedParam,
    },
    limits: {
      maxPromptLength: 2048,
      defaultSteps: 20,
      maxSteps: 20,
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      supportedSizes: ["256x256", "512x512", "768x768", "1024x1024"],
    },
  },
};

// R0 (#69): operator exposure flags. enabled defaults true (absent =
// exposed); alias offers a short id; excludedScopes is stored for R1/D1
// overrides (no scope evaluation exists yet). Later D1 exposure rows
// reuse these exact field names.
export const DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export function isModelExposed(config: ModelConfig): boolean {
  return config.exposure?.enabled ?? true;
}

export function resolveModelId(
  modelId: string,
  registry: Record<string, ModelConfig> = MODEL_CONFIGS
): string {
  if (registry[modelId]) return modelId;
  for (const [id, config] of Object.entries(registry)) {
    if (config.exposure?.alias === modelId) return id;
  }
  return modelId;
}

export function getModelConfig(modelId: string): ModelConfig | null {
  const config = MODEL_CONFIGS[resolveModelId(modelId)] || null;
  if (config && !isModelExposed(config)) return null;
  return config;
}

export function listModels(): Array<{
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  taskTypes: string[];
  editCapabilities?: ModelConfig["editCapabilities"];
  // Full parameter table + limits so the frontend can hide unsupported
  // controls and clamp sliders per model without hardcoding (#50).
  parameters: ModelConfig["parameters"];
  limits: ModelConfig["limits"];
  // Superset fields for service-side consumers (C3): the generator
  // projects its list from this registry instead of hand-writing one.
  provider: string;
  supportedSizes: string[];
}> {
  // R0: disabled models are absent from every listing surface.
  return Object.values(MODEL_CONFIGS)
    .filter(isModelExposed)
    .map((config) => ({
      id: config.id,
      name: config.name,
      description: config.description,
      capabilities: Object.keys(config.parameters),
      taskTypes: config.supportedTasks,
      editCapabilities: config.editCapabilities,
      parameters: config.parameters,
      limits: config.limits,
      provider: config.provider,
      supportedSizes: config.limits.supportedSizes,
    }));
}
