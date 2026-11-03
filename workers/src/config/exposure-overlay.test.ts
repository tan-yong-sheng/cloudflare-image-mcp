// ============================================================================
// Exposure overlay tests - R1b (#72), seam S6 (pure half)
// ============================================================================
// Seam: overlayRegistry — D1-wins over the R0 registry, per the spec
// sentence "D1 wins when rows exist": a model with an exposure_overrides
// row gets its enabled/alias/excludedScopes wholesale from D1 (row-wins,
// field-null clears), models without rows keep their registry defaults.
// Overlay rows for unknown model ids are ignored (label-only warn). Pure —
// no D1, no cache, no service. is_default remains a stored field for
// operator visibility but no longer rewrites any API default.

import { describe, expect, test, vi } from "vitest";
import {
  overlayRegistry,
  type ExposureOverlay,
  type ExposureOverride,
} from "./exposure-overlay.js";
import {
  MODEL_CONFIGS,
  isModelExposed,
  listModels,
  resolveModelId,
} from "./models.js";
import type { ModelConfig } from "../types.js";

const TEXT_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const IMG2IMG_MODEL = "@cf/lykon/dreamshaper-8-lcm";

function overlay(rows: Array<[string, ExposureOverride]>): ExposureOverlay {
  return new Map(rows);
}

describe("exposure overlay (S6, pure)", () => {
  test("no overlay leaves the registry projection unchanged", () => {
    const merged = overlayRegistry(MODEL_CONFIGS, null);
    expect(Object.keys(merged).sort()).toEqual(
      Object.keys(MODEL_CONFIGS).sort()
    );
    expect(
      listModels(merged)
        .map((m) => m.id)
        .sort()
    ).toEqual(
      listModels(MODEL_CONFIGS)
        .map((m) => m.id)
        .sort()
    );
  });

  test("a D1 row with enabled=0 hides the model everywhere", () => {
    const merged = overlayRegistry(
      MODEL_CONFIGS,
      overlay([
        [
          IMG2IMG_MODEL,
          { enabled: false, alias: null, isDefault: false, excludedScopes: [] },
        ],
      ])
    );
    expect(isModelExposed(merged[IMG2IMG_MODEL])).toBe(false);
    expect(listModels(merged).map((m) => m.id)).not.toContain(IMG2IMG_MODEL);
    expect(merged[TEXT_MODEL]).toEqual(MODEL_CONFIGS[TEXT_MODEL]);
  });

  test("a D1 alias wins and clears the registry alias (row-wins wholesale)", () => {
    const withRegistryAlias: Record<string, ModelConfig> = {
      ...MODEL_CONFIGS,
      [TEXT_MODEL]: {
        ...MODEL_CONFIGS[TEXT_MODEL],
        exposure: { alias: "reg-alias" },
      },
    };
    const merged = overlayRegistry(
      withRegistryAlias,
      overlay([
        [
          TEXT_MODEL,
          {
            enabled: true,
            alias: "d1-alias",
            isDefault: false,
            excludedScopes: [],
          },
        ],
      ])
    );
    expect(resolveModelId("d1-alias", merged)).toBe(TEXT_MODEL);
    expect(resolveModelId("reg-alias", merged)).toBe("reg-alias");
  });

  test("D1 excludedScopes replace the registry list for that model", () => {
    const withScopes: Record<string, ModelConfig> = {
      ...MODEL_CONFIGS,
      [TEXT_MODEL]: {
        ...MODEL_CONFIGS[TEXT_MODEL],
        exposure: { excludedScopes: ["registry-scope"] },
      },
    };
    const merged = overlayRegistry(
      withScopes,
      overlay([
        [
          TEXT_MODEL,
          {
            enabled: true,
            alias: null,
            isDefault: false,
            excludedScopes: ["d1-scope"],
          },
        ],
      ])
    );
    expect(merged[TEXT_MODEL].exposure?.excludedScopes).toEqual(["d1-scope"]);
  });

  test("is_default is preserved on the overlay row without choosing a model", () => {
    const ov = overlay([
      [
        IMG2IMG_MODEL,
        { enabled: true, alias: null, isDefault: true, excludedScopes: [] },
      ],
    ]);
    const merged = overlayRegistry(MODEL_CONFIGS, ov);
    expect(merged[IMG2IMG_MODEL]).toBeDefined();
    expect(ov.get(IMG2IMG_MODEL)?.isDefault).toBe(true);
    expect(merged[IMG2IMG_MODEL]).toEqual({
      ...MODEL_CONFIGS[IMG2IMG_MODEL],
      exposure: {
        enabled: true,
        alias: undefined,
        excludedScopes: [],
      },
    });
  });

  test("overlay rows for unknown model ids are ignored, labels only in logs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const merged = overlayRegistry(
        MODEL_CONFIGS,
        overlay([
          [
            "@cf/nonexistent/model",
            {
              enabled: false,
              alias: null,
              isDefault: false,
              excludedScopes: [],
            },
          ],
        ])
      );
      expect(Object.keys(merged).sort()).toEqual(
        Object.keys(MODEL_CONFIGS).sort()
      );
      const said = warn.mock.calls.map((c) => String(c[0])).join(" ");
      expect(said).toContain("@cf/nonexistent/model");
    } finally {
      warn.mockRestore();
    }
  });

  // Scope-existence IOU (#72 Lavish): excluded_scopes rows may reference
  // scopes that exist nowhere in a model's control mapping. Scope
  // EVALUATION is deferred past R1 (R0 stores, never enforces). This test
  // pins the current contract so the IOU is explicit: the overlay stores
  // such rows unchanged and nothing filters or validates them yet.
  test("IOU: excludedScopes pass through unevaluated — scope existence is not validated", () => {
    const merged = overlayRegistry(
      MODEL_CONFIGS,
      overlay([
        [
          TEXT_MODEL,
          {
            enabled: true,
            alias: null,
            isDefault: false,
            excludedScopes: ["scope-that-exists-nowhere"],
          },
        ],
      ])
    );
    expect(merged[TEXT_MODEL].exposure?.excludedScopes).toEqual([
      "scope-that-exists-nowhere",
    ]);
    const paramNames = Object.keys(merged[TEXT_MODEL].parameters);
    expect(paramNames).not.toContain("scope-that-exists-nowhere");
  });
});
