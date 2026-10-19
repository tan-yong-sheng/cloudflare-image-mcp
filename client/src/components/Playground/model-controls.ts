import type { ModelConfig } from "../../api/types";

/**
 * The controls a model exposes, derived from its declared parameters.
 *
 * The legacy page read the same registry and hid any control the model
 * does not declare, so the UI could never offer a parameter the request
 * path would silently drop. The derivation lives here, apart from the
 * components, so it can be tested without a DOM.
 */

export interface SliderBounds {
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface ModelControls {
  showSize: boolean;
  showSteps: boolean;
  showGuidance: boolean;
  showNegativePrompt: boolean;
  /** The sizes the model accepts, from the registry's supported list. */
  sizes: string[];
  size: string;
  steps: SliderBounds;
  guidance: SliderBounds;
}

/** The operator's per-model choices, remembered per model id. */
export type ModelOverrides = Record<
  string,
  { size?: string; steps?: number; guidance?: number }
>;

const DEFAULT_STEPS = { min: 1, max: 20, step: 1, value: 4 };
const DEFAULT_GUIDANCE = { min: 1, max: 30, step: 0.5, value: 7.5 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sliderBounds(
  parameter:
    | { min?: number; max?: number; step?: number; default?: unknown }
    | undefined,
  fallback: SliderBounds,
  limit?: { max?: number; default?: number }
): SliderBounds {
  const min = parameter?.min ?? fallback.min;
  const max = parameter?.max ?? limit?.max ?? fallback.max;
  const step = parameter?.step ?? fallback.step;
  const declared =
    typeof parameter?.default === "number" ? parameter.default : undefined;
  const def = declared ?? limit?.default ?? fallback.value;
  return { min, max, step, value: clamp(def, min, max) };
}

export function deriveModelControls(
  model: ModelConfig | null,
  overrides: ModelOverrides
): ModelControls {
  const params = model?.parameters ?? {};
  const has = (key: string) => params[key] !== undefined;

  // Size: width+height models drive it from their bounds, and models that
  // declare a single size parameter (Agnes) declare it instead. The same
  // select serves both shapes.
  const showSize = (has("width") && has("height")) || has("size");
  const showSteps = has("steps") || has("num_steps");
  const showGuidance = has("guidance");
  const showNegativePrompt = has("negative_prompt");

  const sizes = model?.limits?.supportedSizes ?? [];
  const defaultSize = sizes.includes("1024x1024")
    ? "1024x1024"
    : (sizes[0] ?? "");
  const chosenSize = model ? overrides[model.id]?.size : undefined;
  const size =
    chosenSize && sizes.includes(chosenSize) ? chosenSize : defaultSize;

  const steps = sliderBounds(params.steps ?? params.num_steps, DEFAULT_STEPS, {
    max: model?.limits?.maxSteps,
    default: model?.limits?.defaultSteps,
  });
  const chosenSteps = model ? overrides[model.id]?.steps : undefined;
  if (chosenSteps !== undefined) {
    steps.value = clamp(chosenSteps, steps.min, steps.max);
  }

  const guidance = sliderBounds(params.guidance, DEFAULT_GUIDANCE);
  const chosenGuidance = model ? overrides[model.id]?.guidance : undefined;
  if (chosenGuidance !== undefined) {
    guidance.value = clamp(chosenGuidance, guidance.min, guidance.max);
  }

  return {
    showSize,
    showSteps,
    showGuidance,
    showNegativePrompt,
    sizes,
    size,
    steps,
    guidance,
  };
}

export interface GenerationInput {
  modelId: string;
  prompt: string;
  negativePrompt: string;
  size: string;
  steps: number;
  guidance: number;
  seed: string;
  count: number;
}

/**
 * The request body.
 *
 * Only the parameters the model declares are sent: anything else would be
 * dropped by the payload mapper, so the operator would believe a control
 * took effect when it did not.
 */
export function buildGenerationBody(
  input: GenerationInput,
  model: ModelConfig | null
): Record<string, unknown> {
  const params = model?.parameters ?? {};
  const has = (key: string) => params[key] !== undefined;

  const body: Record<string, unknown> = {
    model: input.modelId,
    prompt: input.prompt,
    n: input.count,
  };
  if ((has("width") && has("height")) || has("size")) {
    body.size = input.size;
  }
  // The backend reads params[num_steps] for num_steps models, so the
  // declared key is sent, not the UI's alias.
  if (has("num_steps")) {
    body.num_steps = input.steps;
  } else if (has("steps")) {
    body.steps = input.steps;
  }
  if (has("guidance")) {
    body.guidance = input.guidance;
  }
  if (has("negative_prompt")) {
    body.negative_prompt = input.negativePrompt;
  }
  if (input.seed) {
    const seed = Number.parseInt(input.seed, 10);
    if (Number.isFinite(seed)) body.seed = seed;
  }
  return body;
}
