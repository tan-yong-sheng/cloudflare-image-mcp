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
    generateImages: () => {
      throw new Error("must not reach network in validation tests");
    },
    generateImageToImages: () => {
      throw new Error("must not reach network in validation tests");
    },
    generateInpaints: () => {
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
