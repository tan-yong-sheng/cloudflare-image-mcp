// ============================================================================
// Model configuration unit tests - registry validity + JSON/TS mirror
// ============================================================================
// Seam: MODEL_CONFIGS / listModels / getModelConfig public interface,
// plus the models.json source of truth it must mirror.

import { describe, expect, test } from "vitest";
import { getModelConfig, listModels, MODEL_CONFIGS } from "./models.js";
import modelsJson from "./models.json" with { type: "json" };

describe("model registry validity", () => {
  test("every model id matches its @cf/provider/name key", () => {
    for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
      expect(config.id).toBe(key);
      expect(key.startsWith("@cf/")).toBe(true);
    }
  });

  test("every model declares prompt, tasks, and width/height limits", () => {
    for (const config of Object.values(MODEL_CONFIGS)) {
      expect(config.parameters.prompt.required).toBe(true);
      expect(config.supportedTasks.length).toBeGreaterThan(0);
      expect(config.limits.minWidth).toBeLessThanOrEqual(
        config.limits.maxWidth
      );
      expect(config.limits.minHeight).toBeLessThanOrEqual(
        config.limits.maxHeight
      );
    }
  });

  test("inpainting model requires a mask", () => {
    const config = getModelConfig(
      "@cf/runwayml/stable-diffusion-v1-5-inpainting"
    );
    expect(config?.editCapabilities).toEqual({ mask: "required" });
  });

  test("unknown model id returns null", () => {
    expect(getModelConfig("@cf/nope/missing")).toBeNull();
  });

  test("listModels exposes one entry per config", () => {
    const listed = listModels();
    expect(listed).toHaveLength(Object.keys(MODEL_CONFIGS).length);
    for (const entry of listed) {
      expect(entry.id).toBeDefined();
      expect(entry.capabilities).toContain("prompt");
    }
  });
});

describe("models.json mirror", () => {
  test("TypeScript registry matches the JSON source of truth", () => {
    const jsonIds = Object.keys(
      (modelsJson as { models: Record<string, unknown> }).models
    ).sort();
    expect(Object.keys(MODEL_CONFIGS).sort()).toEqual(jsonIds);
  });
});
