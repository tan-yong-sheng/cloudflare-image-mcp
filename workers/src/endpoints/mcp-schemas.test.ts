// ============================================================================
// MCP schema unit tests - zod accept/reject contract, no bindings
// ============================================================================
// Seam: exported zod schemas (safeParse success/failure shapes).

import { describe, expect, test } from "vitest";
import {
  DescribeModelSchema,
  EmptySchema,
  RunModelMultiSchema,
  RunModelSingleSchema,
} from "./mcp-schemas.js";

describe("RunModelMultiSchema", () => {
  test("accepts a minimal generations call", () => {
    const result = RunModelMultiSchema.safeParse({
      taskType: "generations",
      prompt: "a cat",
      model_id: "@cf/black-forest-labs/flux-1-schnell",
    });
    expect(result.success).toBe(true);
  });

  test("rejects unknown taskType", () => {
    const result = RunModelMultiSchema.safeParse({
      taskType: "upscale",
      prompt: "a cat",
      model_id: "@cf/black-forest-labs/flux-1-schnell",
    });
    expect(result.success).toBe(false);
  });

  test("rejects n above 8", () => {
    const result = RunModelMultiSchema.safeParse({
      taskType: "generations",
      prompt: "a cat",
      model_id: "@cf/black-forest-labs/flux-1-schnell",
      n: 9,
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty image array", () => {
    const result = RunModelMultiSchema.safeParse({
      taskType: "edits",
      prompt: "add a hat",
      model_id: "@cf/black-forest-labs/flux-2-klein-4b",
      image: [],
    });
    expect(result.success).toBe(false);
  });

  test("accepts edits with image array and cf_params", () => {
    const result = RunModelMultiSchema.safeParse({
      taskType: "edits",
      prompt: "add a hat",
      model_id: "@cf/black-forest-labs/flux-2-klein-4b",
      image: ["QUJD", "REVG"],
      cf_params: { steps: 4 },
    });
    expect(result.success).toBe(true);
  });
});

describe("RunModelSingleSchema", () => {
  test("accepts generations without model_id", () => {
    const result = RunModelSingleSchema.safeParse({
      taskType: "generations",
      prompt: "a cat",
    });
    expect(result.success).toBe(true);
  });
});

describe("DescribeModelSchema", () => {
  test("requires model_id", () => {
    expect(DescribeModelSchema.safeParse({}).success).toBe(false);
    expect(
      DescribeModelSchema.safeParse({
        model_id: "@cf/black-forest-labs/flux-1-schnell",
      }).success
    ).toBe(true);
  });
});

describe("EmptySchema", () => {
  test("accepts empty args for list_models", () => {
    expect(EmptySchema.safeParse({}).success).toBe(true);
  });
});
