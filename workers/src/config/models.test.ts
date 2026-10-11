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

  test("listModels exposes parameters and limits for UI control mapping (#50)", () => {
    // The frontend populates per-model controls from this endpoint, so
    // each entry must carry the parameter table and limits: without
    // them the UI cannot hide unsupported controls or clamp sliders.
    for (const entry of listModels()) {
      expect(Object.keys(entry.parameters).length).toBeGreaterThan(0);
      expect(entry.parameters.prompt.required).toBe(true);
      expect(entry.limits.maxSteps).toBeGreaterThanOrEqual(1);
      expect(entry.limits.minWidth).toBeLessThanOrEqual(entry.limits.maxWidth);
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

  test("parameter metadata mirrors the JSON source of truth (#53)", () => {
    // listModels() exposes the parameter table to drive UI controls,
    // so descriptions, defaults, and key names must match the JSON:
    // invisible drift here becomes silent UI misbehavior.
    const json = modelsJson as {
      models: Record<string, { parameters: Record<string, any> }>;
    };
    for (const [id, jcfg] of Object.entries(json.models)) {
      const tcfg = MODEL_CONFIGS[id];
      expect(Object.keys(tcfg.parameters).sort()).toEqual(
        Object.keys(jcfg.parameters).sort()
      );
      for (const [key, jp] of Object.entries(jcfg.parameters)) {
        const tp = tcfg.parameters[key] as any;
        if (jp.description) expect(tp.description).toBe(jp.description);
        if ("default" in jp)
          expect(tp.default ?? null).toBe(jp.default ?? null);
        if ("required" in jp) expect(tp.required ?? false).toBe(jp.required);
      }
    }
  });
});
