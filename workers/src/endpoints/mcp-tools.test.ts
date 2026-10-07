// ============================================================================
// MCP tool handler unit tests - validation branches, stubbed execution
// ============================================================================
// Seam: handleRunModel / handleListModels / handleDescribeModel with a
// stubbed ToolsContext. Validation errors return before any network call;
// the stub generator throws if execution is ever reached unexpectedly.

import { describe, expect, test } from "vitest";
import {
  handleDescribeModel,
  handleListModels,
  handleRunModel,
  type ToolsContext,
} from "./mcp-tools.js";
import type {
  BatchResult,
  GenerationRequest,
} from "../services/image-generator.js";
import { MODEL_CONFIGS } from "../config/models.js";
import type { ModelConfig } from "../types.js";

function stubContext(): ToolsContext {
  const generator = {
    getModelConfig: (id: string): ModelConfig | null =>
      MODEL_CONFIGS[id] ?? null,
    listModels: () =>
      Object.values(MODEL_CONFIGS).map((config) => ({
        id: config.id,
        name: config.name,
        description: config.description,
        provider: config.provider,
        supportedSizes: config.limits.supportedSizes,
        taskTypes: config.supportedTasks,
        editCapabilities: config.editCapabilities,
      })),
    runOnce: () => {
      throw new Error("must not reach network in validation tests");
    },
    runMany: () => {
      throw new Error("must not reach network in validation tests");
    },
  };
  return {
    generator: generator as unknown as ToolsContext["generator"],
    baseUrl: "https://worker.test",
  };
}

describe("handleRunModel validation", () => {
  const ctx = stubContext();

  test("missing taskType is rejected", async () => {
    const result = await handleRunModel(ctx, { prompt: "a cat" }, null);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("taskType is required");
  });

  test("unknown taskType is rejected", async () => {
    const result = await handleRunModel(
      ctx,
      { taskType: "upscale", prompt: "a cat" },
      null
    );
    expect(result.content[0].text).toContain("Invalid taskType 'upscale'");
  });

  test("missing prompt is rejected", async () => {
    const result = await handleRunModel(ctx, { taskType: "generations" }, null);
    expect(result.content[0].text).toContain("prompt is required");
  });

  test("edits without image is rejected", async () => {
    const result = await handleRunModel(
      ctx,
      { taskType: "edits", prompt: "hat" },
      null
    );
    expect(result.content[0].text).toContain(
      'image is required when taskType is "edits"'
    );
  });

  test("generations with image is rejected", async () => {
    const result = await handleRunModel(
      ctx,
      { taskType: "generations", prompt: "cat", image: "QUJD" },
      null
    );
    expect(result.content[0].text).toContain(
      'image cannot be used with taskType "generations"'
    );
  });

  test("generations with mask is rejected", async () => {
    const result = await handleRunModel(
      ctx,
      { taskType: "generations", prompt: "cat", mask: "QUJD" },
      null
    );
    expect(result.content[0].text).toContain(
      'mask cannot be used with taskType "generations"'
    );
  });

  test("missing model_id is rejected on multi-model endpoint", async () => {
    const result = await handleRunModel(
      ctx,
      { taskType: "generations", prompt: "cat" },
      null
    );
    expect(result.content[0].text).toContain("model_id is required");
  });

  test("unknown model_id is rejected", async () => {
    const result = await handleRunModel(
      ctx,
      {
        taskType: "generations",
        prompt: "cat",
        model_id: "@cf/nope/missing",
      },
      null
    );
    expect(result.content[0].text).toContain(
      "Unknown model_id: @cf/nope/missing"
    );
  });

  test("edits on text-only model is rejected", async () => {
    const result = await handleRunModel(
      ctx,
      {
        taskType: "edits",
        prompt: "hat",
        image: "QUJD",
        model_id: "@cf/black-forest-labs/flux-1-schnell",
      },
      null
    );
    expect(result.content[0].text).toContain("does not support image editing");
  });

  test("single-model endpoint pins the model", async () => {
    const pinned = "@cf/black-forest-labs/flux-1-schnell";
    const mismatch = await handleRunModel(
      ctx,
      {
        taskType: "generations",
        prompt: "cat",
        model_id: "@cf/leonardo/phoenix-1.0",
      },
      pinned
    );
    expect(mismatch.content[0].text).toContain(
      `pinned to model_id='${pinned}'`
    );
  });

  test("single-model endpoint rejects mask with image array", async () => {
    const result = await handleRunModel(
      ctx,
      {
        taskType: "edits",
        prompt: "hat",
        image: ["QUJD", "REVG"],
        mask: "TUFT",
        model_id: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
      },
      null
    );
    expect(result.content[0].text).toContain(
      "mask can only be used with a single image"
    );
  });

  test("strength with generations is rejected", async () => {
    const result = await handleRunModel(
      ctx,
      {
        taskType: "generations",
        prompt: "cat",
        model_id: "@cf/black-forest-labs/flux-1-schnell",
        cf_params: { strength: 0.7 },
      },
      null
    );
    expect(result.content[0].text).toContain(
      'cf_params.strength cannot be used with taskType "generations"'
    );
  });
});

describe("handleListModels", () => {
  test("lists every registered model with next_step pointer", async () => {
    const ctx = stubContext();
    const result = await handleListModels(ctx);
    expect(result.isError).toBeUndefined();
    const output = JSON.parse(result.content[0].text) as {
      models: Array<{ model_id: string }>;
      next_step: string;
    };
    expect(output.models).toHaveLength(Object.keys(MODEL_CONFIGS).length);
    expect(output.next_step).toContain("describe_model");
  });
});

describe("handleDescribeModel", () => {
  test("missing model_id is rejected", async () => {
    const result = await handleDescribeModel(stubContext(), {});
    expect(result.content[0].text).toContain("model_id parameter is required");
  });

  test("unknown model_id is rejected", async () => {
    const result = await handleDescribeModel(stubContext(), {
      model_id: "@cf/nope/missing",
    });
    expect(result.content[0].text).toContain("Unknown model_id");
  });

  test("known model returns schema with cf_params and runnable example", async () => {
    const result = await handleDescribeModel(stubContext(), {
      model_id: "@cf/black-forest-labs/flux-1-schnell",
    });
    expect(result.isError).toBeUndefined();
    const schema = JSON.parse(result.content[0].text) as {
      model_id: string;
      cf_params: { generations: Record<string, unknown> };
      next_step: string;
    };
    expect(schema.model_id).toBe("@cf/black-forest-labs/flux-1-schnell");
    expect(Object.keys(schema.cf_params.generations)).toContain("steps");
    expect(schema.next_step).toContain("run_model(taskType=");
  });
});

describe("run-model seam: resolve and execute shape", () => {
  const GEN_MODEL = "@cf/black-forest-labs/flux-1-schnell";
  const EDIT_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

  function execContext(result: BatchResult): {
    ctx: ToolsContext;
    seen: GenerationRequest[];
  } {
    const seen: GenerationRequest[] = [];
    const generator = {
      getModelConfig: (id: string): ModelConfig | null =>
        MODEL_CONFIGS[id] ?? null,
      listModels: () => [],
      runOnce: () => {
        throw new Error("runMany seam only: runOnce must not be called");
      },
      runMany: (request: GenerationRequest, _n: number): BatchResult => {
        seen.push(request);
        return result;
      },
    };
    return {
      ctx: {
        generator: generator as unknown as ToolsContext["generator"],
        baseUrl: "https://worker.test",
      },
      seen,
    };
  }

  const failure: BatchResult = { success: false, images: [], error: "boom" };

  test("generations request reaches runOnce with only explicit params merged", async () => {
    const { ctx, seen } = execContext(failure);
    await handleRunModel(
      ctx,
      {
        taskType: "generations",
        prompt: "cat",
        model_id: GEN_MODEL,
        size: "512x512",
        cf_params: { steps: 4 },
      },
      null
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      modelId: GEN_MODEL,
      prompt: "cat",
      explicitParams: { size: "512x512", steps: 4 },
    });
    expect(seen[0]).not.toHaveProperty("images");
    expect(seen[0]).not.toHaveProperty("mask");
  });

  test("edits request reaches runOnce with images and mask preserved", async () => {
    const { ctx, seen } = execContext(failure);
    await handleRunModel(
      ctx,
      {
        taskType: "edits",
        prompt: "hat",
        model_id: EDIT_MODEL,
        image: "QUJD",
        mask: "TUFT",
      },
      null
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      modelId: EDIT_MODEL,
      prompt: "hat",
      explicitParams: {},
      images: "QUJD",
      mask: "TUFT",
    });
  });

  test("n clamps to at most 8 executions", async () => {
    let capturedN = 0;
    const generator = {
      getModelConfig: (id: string): ModelConfig | null =>
        MODEL_CONFIGS[id] ?? null,
      listModels: () => [],
      runOnce: () => {
        throw new Error("resolve seam test: runOnce must not be called");
      },
      runMany: (_request: GenerationRequest, n: number): BatchResult => {
        capturedN = n;
        return failure;
      },
    };
    const ctx: ToolsContext = {
      generator: generator as unknown as ToolsContext["generator"],
      baseUrl: "https://worker.test",
    };
    await handleRunModel(
      ctx,
      { taskType: "generations", prompt: "cat", model_id: GEN_MODEL, n: 99 },
      null
    );
    expect(capturedN).toBe(8);
  });
});

describe("run-model seam: single + multi endpoint task parity", () => {
  const EDIT_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";
  const TEXT_MODEL = "@cf/black-forest-labs/flux-1-schnell";

  const cases: Array<{ name: string; args: Record<string, unknown> }> = [
    {
      name: "missing taskType",
      args: { prompt: "cat", model_id: TEXT_MODEL },
    },
    { name: "unknown taskType", args: { taskType: "upscale", prompt: "cat" } },
    { name: "missing prompt", args: { taskType: "generations" } },
    { name: "edits without image", args: { taskType: "edits", prompt: "hat" } },
    {
      name: "generations with image",
      args: { taskType: "generations", prompt: "cat", image: "QUJD" },
    },
    {
      name: "generations with mask",
      args: { taskType: "generations", prompt: "cat", mask: "QUJD" },
    },
    {
      name: "unknown model",
      args: {
        taskType: "generations",
        prompt: "cat",
        model_id: "@cf/nope/missing",
      },
    },
    {
      name: "edits on text-only model",
      args: {
        taskType: "edits",
        prompt: "hat",
        image: "QUJD",
        model_id: TEXT_MODEL,
      },
    },
    {
      name: "mask with image array",
      args: {
        taskType: "edits",
        prompt: "hat",
        image: ["QUJD", "REVG"],
        mask: "TUFT",
        model_id: EDIT_MODEL,
      },
    },
    {
      name: "strength with generations",
      args: {
        taskType: "generations",
        prompt: "cat",
        model_id: TEXT_MODEL,
        cf_params: { strength: 0.7 },
      },
    },
  ];

  for (const c of cases) {
    test(`${c.name}: identical error on single + multi`, async () => {
      const multi = await handleRunModel(
        stubContext(),
        { ...c.args, model_id: (c.args.model_id as string) ?? EDIT_MODEL },
        null
      );
      // Single-model endpoint: pin to the same model the multi call used,
      // unless the case pins a conflicting model (then it stays an error,
      // compared by shape rather than exact text below).
      const pin = (c.args.model_id as string) ?? EDIT_MODEL;
      const { model_id: _drop, ...singleArgs } = c.args;
      const single = await handleRunModel(
        stubContext(),
        singleArgs as Parameters<typeof handleRunModel>[1],
        pin
      );
      expect(multi.isError).toBe(true);
      expect(single.isError).toBe(true);
      expect(single.content[0].text).toBe(multi.content[0].text);
    });
  }

  test("single-model pin mismatch keeps its own pin error", async () => {
    const result = await handleRunModel(
      stubContext(),
      {
        taskType: "generations",
        prompt: "cat",
        model_id: "@cf/leonardo/phoenix-1.0",
      },
      TEXT_MODEL
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      `pinned to model_id='${TEXT_MODEL}'`
    );
  });
});

describe("run-model seam: result formatting", () => {
  const GEN_MODEL = "@cf/black-forest-labs/flux-1-schnell";
  const EDIT_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

  function okContext(images: BatchResult["images"]): ToolsContext {
    const generator = {
      getModelConfig: (id: string): ModelConfig | null =>
        MODEL_CONFIGS[id] ?? null,
      listModels: () => [],
      runOnce: () => {
        throw new Error("format seam test: runOnce must not be called");
      },
      runMany: (): BatchResult => ({ success: true, images }),
    };
    return {
      generator: generator as unknown as ToolsContext["generator"],
      baseUrl: "https://worker.test",
    };
  }

  test("single generations image renders one markdown image", async () => {
    const result = await handleRunModel(
      okContext([{ url: "/img/1", id: "1" }]),
      { taskType: "generations", prompt: "cat", model_id: GEN_MODEL },
      null
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(
      "![Generated Image](https://worker.test/img/1)"
    );
  });

  test("multi-image edits result lists every image", async () => {
    const result = await handleRunModel(
      okContext([
        { url: "/img/1", id: "1" },
        { url: "/img/2", id: "2" },
      ]),
      {
        taskType: "edits",
        prompt: "hat",
        model_id: EDIT_MODEL,
        image: ["QUJD", "REVG"],
      },
      null
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Edited 2 images");
    expect(result.content[0].text).toContain("https://worker.test/img/2");
  });

  test("execution failure maps to a tool error naming the cause", async () => {
    const generator = {
      getModelConfig: (id: string): ModelConfig | null =>
        MODEL_CONFIGS[id] ?? null,
      listModels: () => [],
      runOnce: () => {
        throw new Error("must not be called");
      },
      runMany: (): BatchResult => ({
        success: false,
        images: [],
        error: "No image in model response",
      }),
    };
    const ctx: ToolsContext = {
      generator: generator as unknown as ToolsContext["generator"],
      baseUrl: "https://worker.test",
    };
    const result = await handleRunModel(
      ctx,
      { taskType: "generations", prompt: "cat", model_id: GEN_MODEL },
      null
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: No image in model response");
  });
});
