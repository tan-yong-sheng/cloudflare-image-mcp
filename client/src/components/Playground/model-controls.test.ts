import { describe, expect, it } from "vitest";
import type { ModelConfig } from "../../api/types";
import { buildGenerationBody, deriveModelControls } from "./model-controls";

/**
 * The derivation and the request body.
 *
 * These are the rules the legacy page kept in its inline script, and the
 * rules the Worker's payload mapper depends on: a control the model does
 * not declare is not shown, and a parameter the model does not declare
 * is not sent. A request that carried an undeclared parameter would be
 * silently dropped server-side, so the operator would believe a control
 * had an effect when it had none.
 */

function model(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: "test-model",
    name: "Test Model",
    description: "A model for the tests.",
    taskTypes: ["text-to-image"],
    parameters: {},
    limits: {
      maxPromptLength: 1024,
      defaultSteps: 4,
      maxSteps: 20,
      minWidth: 512,
      maxWidth: 4096,
      minHeight: 512,
      maxHeight: 4096,
      supportedSizes: ["1024x1024", "512x512"],
    },
    provider: "cloudflare",
    inferenceProvider: "cloudflare",
    available: true,
    ...overrides,
  };
}

const BASE_INPUT = {
  modelId: "test-model",
  prompt: "a cat",
  negativePrompt: "blurry",
  size: "1024x1024",
  steps: 8,
  guidance: 9.5,
  seed: "",
  count: 1,
};

describe("deriveModelControls", () => {
  it("offers no control for a model that is not selected", () => {
    const controls = deriveModelControls(null, {});

    expect(controls.showSize).toBe(false);
    expect(controls.showSteps).toBe(false);
    expect(controls.showGuidance).toBe(false);
    expect(controls.showNegativePrompt).toBe(false);
  });

  it("offers size for a model that declares width and height", () => {
    const controls = deriveModelControls(
      model({
        parameters: {
          width: { cfParam: "width", type: "integer" },
          height: { cfParam: "height", type: "integer" },
        },
      }),
      {}
    );

    expect(controls.showSize).toBe(true);
  });

  it("offers size for a model that declares only a size parameter", () => {
    // Agnes models declare a single size parameter, not width/height.
    const controls = deriveModelControls(
      model({
        parameters: { size: { cfParam: "size", type: "string" } },
      }),
      {}
    );

    expect(controls.showSize).toBe(true);
  });

  it("offers no size for a model that declares neither shape", () => {
    const controls = deriveModelControls(
      model({
        parameters: { steps: { cfParam: "steps", type: "integer" } },
      }),
      {}
    );

    expect(controls.showSize).toBe(false);
  });

  it("offers steps for either the steps or the num_steps parameter", () => {
    const withSteps = deriveModelControls(
      model({ parameters: { steps: { cfParam: "steps", type: "integer" } } }),
      {}
    );
    const withNumSteps = deriveModelControls(
      model({
        parameters: { num_steps: { cfParam: "num_steps", type: "integer" } },
      }),
      {}
    );

    expect(withSteps.showSteps).toBe(true);
    expect(withNumSteps.showSteps).toBe(true);
  });

  it("offers guidance and the negative prompt only when declared", () => {
    const declared = deriveModelControls(
      model({
        parameters: {
          guidance: { cfParam: "guidance", type: "number" },
          negative_prompt: { cfParam: "negative_prompt", type: "string" },
        },
      }),
      {}
    );
    const undeclared = deriveModelControls(model(), {});

    expect(declared.showGuidance).toBe(true);
    expect(declared.showNegativePrompt).toBe(true);
    expect(undeclared.showGuidance).toBe(false);
    expect(undeclared.showNegativePrompt).toBe(false);
  });

  it("defaults to the square size when the registry lists it", () => {
    const controls = deriveModelControls(
      model({
        parameters: { size: { cfParam: "size", type: "string" } },
      }),
      {}
    );

    expect(controls.size).toBe("1024x1024");
  });

  it("falls back to the first listed size when the square is absent", () => {
    const controls = deriveModelControls(
      model({
        parameters: { size: { cfParam: "size", type: "string" } },
        limits: {
          ...model().limits,
          supportedSizes: ["512x512", "768x768"],
        },
      }),
      {}
    );

    expect(controls.size).toBe("512x512");
  });

  it("keeps the operator's size choice for that model", () => {
    const controls = deriveModelControls(
      model({
        id: "size-model",
        parameters: { size: { cfParam: "size", type: "string" } },
      }),
      { "size-model": { size: "512x512" } }
    );

    expect(controls.size).toBe("512x512");
  });

  it("ignores a size choice the registry does not list", () => {
    const controls = deriveModelControls(
      model({
        id: "size-model",
        parameters: { size: { cfParam: "size", type: "string" } },
      }),
      { "size-model": { size: "9999x9999" } }
    );

    expect(controls.size).toBe("1024x1024");
  });

  it("keeps the operator's steps choice, clamped to the model's bounds", () => {
    const controls = deriveModelControls(
      model({
        id: "steps-model",
        parameters: { steps: { cfParam: "steps", type: "integer" } },
      }),
      { "steps-model": { steps: 99 } }
    );

    expect(controls.steps.value).toBe(controls.steps.max);
  });

  it("does not leak one model's choice into another", () => {
    const chosen = deriveModelControls(
      model({
        id: "model-a",
        parameters: { size: { cfParam: "size", type: "string" } },
      }),
      { "model-a": { size: "512x512" } }
    );
    const other = deriveModelControls(
      model({
        id: "model-b",
        parameters: { size: { cfParam: "size", type: "string" } },
      }),
      { "model-a": { size: "512x512" } }
    );

    expect(chosen.size).toBe("512x512");
    expect(other.size).toBe("1024x1024");
  });
});

describe("buildGenerationBody", () => {
  it("sends the model, the prompt and the count", () => {
    const body = buildGenerationBody(BASE_INPUT, model());

    expect(body).toEqual({ model: "test-model", prompt: "a cat", n: 1 });
  });

  it("sends only the parameters the model declares", () => {
    const body = buildGenerationBody(
      BASE_INPUT,
      model({
        parameters: { steps: { cfParam: "steps", type: "integer" } },
      })
    );

    expect(body).toEqual({
      model: "test-model",
      prompt: "a cat",
      n: 1,
      steps: 8,
    });
  });

  it("omits the size of a model that declares no size", () => {
    const body = buildGenerationBody(BASE_INPUT, model());

    expect(body).not.toHaveProperty("size");
  });

  it("sends the size of a model that declares width and height", () => {
    const body = buildGenerationBody(
      BASE_INPUT,
      model({
        parameters: {
          width: { cfParam: "width", type: "integer" },
          height: { cfParam: "height", type: "integer" },
        },
      })
    );

    expect(body.size).toBe("1024x1024");
  });

  it("sends the size of a model that declares only a size parameter", () => {
    const body = buildGenerationBody(
      BASE_INPUT,
      model({
        parameters: { size: { cfParam: "size", type: "string" } },
      })
    );

    expect(body.size).toBe("1024x1024");
  });

  it("sends num_steps under the declared key, not the steps alias", () => {
    // The Worker's payload mapper reads params[num_steps] for num_steps
    // models, so sending "steps" there would be dropped.
    const body = buildGenerationBody(
      BASE_INPUT,
      model({
        parameters: { num_steps: { cfParam: "num_steps", type: "integer" } },
      })
    );

    expect(body.num_steps).toBe(8);
    expect(body).not.toHaveProperty("steps");
  });

  it("sends steps under the declared key when the model declares steps", () => {
    const body = buildGenerationBody(
      BASE_INPUT,
      model({
        parameters: { steps: { cfParam: "steps", type: "integer" } },
      })
    );

    expect(body.steps).toBe(8);
    expect(body).not.toHaveProperty("num_steps");
  });

  it("sends guidance and the negative prompt only when declared", () => {
    const declared = buildGenerationBody(
      BASE_INPUT,
      model({
        parameters: {
          guidance: { cfParam: "guidance", type: "number" },
          negative_prompt: { cfParam: "negative_prompt", type: "string" },
        },
      })
    );
    const undeclared = buildGenerationBody(BASE_INPUT, model());

    expect(declared.guidance).toBe(9.5);
    expect(declared.negative_prompt).toBe("blurry");
    expect(undeclared).not.toHaveProperty("guidance");
    expect(undeclared).not.toHaveProperty("negative_prompt");
  });

  it("omits the seed when the field is empty", () => {
    const body = buildGenerationBody(BASE_INPUT, model());

    expect(body).not.toHaveProperty("seed");
  });

  it("sends a numeric seed", () => {
    const body = buildGenerationBody({ ...BASE_INPUT, seed: "42" }, model());

    expect(body.seed).toBe(42);
  });

  it("omits a seed that is not a number", () => {
    const body = buildGenerationBody(
      { ...BASE_INPUT, seed: "not-a-number" },
      model()
    );

    expect(body).not.toHaveProperty("seed");
  });

  it("sends the count the operator asked for", () => {
    const body = buildGenerationBody({ ...BASE_INPUT, count: 3 }, model());

    expect(body.n).toBe(3);
  });

  it("sends nothing beyond the declared parameters for a null model", () => {
    const body = buildGenerationBody(BASE_INPUT, null);

    expect(body).toEqual({ model: "test-model", prompt: "a cat", n: 1 });
  });
});
