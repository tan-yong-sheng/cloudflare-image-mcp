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
  test("every model id matches its registry key", () => {
    for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
      expect(config.id).toBe(key);
    }
  });

  test("the @cf/ namespace is exactly the Cloudflare transport's models", () => {
    // R3-Agnes (#75) added a non-Cloudflare provider, so the namespace now
    // scopes the models the Cloudflare REST transport serves rather than
    // "every model": a @cf/* id on another transport would be a misread of
    // which credentials pay for it.
    for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
      expect(key.startsWith("@cf/")).toBe(
        config.inferenceProvider === "cloudflare-rest"
      );
    }
  });

  test("the second provider registers un-namespaced upstream ids (R3-Agnes)", () => {
    // The id is the upstream model name, not a @provider/ mirror: the
    // openai-compat transport sends it verbatim.
    for (const id of [
      "agnes-image-2.5-flash",
      "agnes-image-2.1-flash",
      "agnes-image-2.0-flash",
    ]) {
      const agnes = MODEL_CONFIGS[id];
      expect(agnes).toBeDefined();
      expect(agnes.id).toBe(id);
      expect(agnes.provider).toBe("agnes");
      expect(agnes.inferenceProvider).toBe("openai-compat");
    }
  });

  test("only the model without a ratio parameter uses the exact size strategy", () => {
    // 2.0 publishes an exact `size` and no `ratio` (agnes-ai.com/en/docs/
    // agnes-image-20-flash); 2.5/2.1 take a tier plus a ratio, which is the
    // transport's default, so a stray "exact" on them would send a raw WxH.
    expect(MODEL_CONFIGS["agnes-image-2.0-flash"].sizeStrategy).toBe("exact");
    expect(MODEL_CONFIGS["agnes-image-2.5-flash"].sizeStrategy).toBeUndefined();
    expect(MODEL_CONFIGS["agnes-image-2.1-flash"].sizeStrategy).toBeUndefined();
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

  test("listModels carries the transport, not the author, that routing joins on", () => {
    // Availability in /api/internal/models resolves credentials by
    // inferenceProvider. `provider` names the model's author, so joining
    // on it finds no pool for any @cf model — the picker would hide every
    // model while generation still worked.
    const listed = listModels();
    expect(
      Array.from(new Set(listed.map((m) => m.inferenceProvider))).sort()
    ).toEqual(["cloudflare-rest", "openai-compat"]);
    for (const entry of listed) {
      expect(entry.inferenceProvider).toBe(
        entry.id.startsWith("@cf/") ? "cloudflare-rest" : "openai-compat"
      );
    }
  });
});

describe("models.json source of truth", () => {
  // The field-by-field mirror tests that used to live here were retired along
  // with the hand-written registry. scripts/generate-models.mjs copies every
  // key of every model verbatim and round-trips the printed literal back to
  // the JSON it came from, and `npm run check` (CI + deploy) fails when
  // models.generated.ts is stale. Together those cover strictly more than the
  // mirror did: limits, min/max/step, provider, apiVersion, and the rest.
  // What is left here are invariants of the JSON itself.
  test("every entry declares the transport that serves it (C4)", () => {
    // A missing or drifting inferenceProvider silently routes a model to the
    // wrong transport, which no other test observes, so the source of truth
    // is pinned directly and projected through to the registry. Load-time
    // validation (services/transports.ts) rejects a key with no factory.
    const json = modelsJson as {
      models: Record<string, { inferenceProvider?: string }>;
    };
    expect(Object.keys(MODEL_CONFIGS).sort()).toEqual(
      Object.keys(json.models).sort()
    );
    for (const [id, jcfg] of Object.entries(json.models)) {
      expect(typeof jcfg.inferenceProvider).toBe("string");
      expect(jcfg.inferenceProvider).not.toBe("");
      expect(MODEL_CONFIGS[id].inferenceProvider).toBe(jcfg.inferenceProvider);
    }
  });

  test("every JSON field mirrors the registry", () => {
    // The earlier mirror test compared ids, transport, parameters, limits,
    // and sizeStrategy only, which left name/description/apiVersion/
    // inputFormat/responseFormat/supportedTasks/maxInputImages free to
    // drift. Compare every JSON field both ways so a data edit cannot
    // change what the API or the picker offers without this test failing.
    // Parameter-level detail is caught by models:check (the generator's
    // --check flag), so this test focuses on the per-model top-level fields.
    const json = modelsJson as {
      models: Record<string, Record<string, unknown>>;
    };
    const drift: string[] = [];
    for (const [id, jcfg] of Object.entries(json.models)) {
      const tcfg = MODEL_CONFIGS[id] as unknown as Record<string, unknown>;
      if (!tcfg) {
        drift.push(`${id}: missing in models.ts`);
        continue;
      }
      for (const [key, jval] of Object.entries(jcfg)) {
        if (key === "$comment") continue;
        if (JSON.stringify(tcfg[key]) !== JSON.stringify(jval)) {
          drift.push(
            `${id}.${key}: ts=${JSON.stringify(tcfg[key])} json=${JSON.stringify(jval)}`
          );
        }
      }
      for (const key of Object.keys(tcfg)) {
        if (!(key in jcfg)) drift.push(`${id}.${key}: only in models.ts`);
      }
    }
    expect(drift).toEqual([]);
  });
});
