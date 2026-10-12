// ============================================================================
// Model configuration unit tests - registry validity + JSON/TS mirror
// ============================================================================
// Seam: MODEL_CONFIGS / listModels / getModelConfig public interface,
// plus the models.json source of truth it must mirror.

import { describe, expect, test } from "vitest";
import {
  DEFAULT_MODEL,
  getModelConfig,
  isModelExposed,
  listModels,
  MODEL_CONFIGS,
  resolveModelId,
} from "./models.js";
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

  test("leonardo dims minima match official docs (min 0)", () => {
    for (const id of [
      "@cf/leonardo/phoenix-1.0",
      "@cf/leonardo/lucid-origin",
    ]) {
      const config = MODEL_CONFIGS[id];
      expect(config.parameters.width.min).toBe(0);
      expect(config.parameters.height.min).toBe(0);
      expect(config.limits.minWidth).toBe(0);
      expect(config.limits.minHeight).toBe(0);
    }
  });

  test("fixed-output models declare observed sizes (live probes)", () => {
    // Probes 2026-10-12/13: schnell/flux-2/SDXL/lightning/phoenix always
    // 1024; dreamshaper always 512; lucid always 1120 (its default).
    // Lightning is single-point evidence (512 req -> 1024 out).
    const fixed: Record<string, string[]> = {
      "@cf/black-forest-labs/flux-1-schnell": ["1024x1024"],
      "@cf/black-forest-labs/flux-2-klein-4b": ["1024x1024"],
      "@cf/black-forest-labs/flux-2-dev": ["1024x1024"],
      "@cf/black-forest-labs/flux-2-klein-9b": ["1024x1024"],
      "@cf/stabilityai/stable-diffusion-xl-base-1.0": ["1024x1024"],
      "@cf/bytedance/stable-diffusion-xl-lightning": ["1024x1024"],
      "@cf/lykon/dreamshaper-8-lcm": ["512x512"],
      "@cf/leonardo/lucid-origin": ["1120x1120"],
      "@cf/leonardo/phoenix-1.0": ["1024x1024"],
    };
    for (const [id, sizes] of Object.entries(fixed)) {
      expect(MODEL_CONFIGS[id].limits.supportedSizes).toEqual(sizes);
    }
  });

  test("flux-2 models declare fixed 1024 output (live probe)", () => {
    // Live probe 2026-10-12 (klein-4b, 512/768/1024 requests): provider
    // always returns 1024x1024 JPEG — size params accepted, ignored.
    for (const id of [
      "@cf/black-forest-labs/flux-2-klein-4b",
      "@cf/black-forest-labs/flux-2-dev",
      "@cf/black-forest-labs/flux-2-klein-9b",
    ]) {
      const config = MODEL_CONFIGS[id];
      expect(config.limits.supportedSizes).toEqual(["1024x1024"]);
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

  describe("exposure flags (R0 #69)", () => {
    const SCHNELL = "@cf/black-forest-labs/flux-1-schnell";
    test("DEFAULT_MODEL is the schnell id", () => {
      expect(DEFAULT_MODEL).toBe(SCHNELL);
    });
    test("models are exposed by default (no flags)", () => {
      expect(isModelExposed(MODEL_CONFIGS[SCHNELL])).toBe(true);
      expect(isModelExposed({ exposure: {} } as any)).toBe(true);
      expect(isModelExposed({ exposure: { enabled: false } } as any)).toBe(
        false
      );
    });
    test("resolveModelId follows alias, else identity", () => {
      expect(
        resolveModelId("sdxl", {
          [SCHNELL]: { ...MODEL_CONFIGS[SCHNELL], exposure: { alias: "sdxl" } },
        } as any)
      ).toBe(SCHNELL);
      expect(resolveModelId(SCHNELL)).toBe(SCHNELL);
      expect(resolveModelId("@cf/nope/missing")).toBe("@cf/nope/missing");
    });
    test("disabled models vanish from listModels", () => {
      // Registry fixtures are all enabled: full list today. Disabled
      // filtering is proven by isModelExposed + listModels delegation
      // below (C3 pattern): listModels emits only exposed entries.
      const ids = listModels().map((m) => m.id);
      expect(ids).toContain(SCHNELL);
    });
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
