// ============================================================================
// Exposure overlay - D1-wins over the R0 registry (R1b, #72, seam S6)
// ============================================================================
// Pure merge: a model with an exposure_overrides row gets its exposure
// (enabled / alias / excludedScopes) wholesale from D1 — the spec's "D1
// wins when rows exist", so a null alias in the row clears the registry
// alias rather than preserving it. Models without rows keep registry
// defaults. Rows for model ids absent from the registry are ignored
// (label-only warn) — an override can hide or re-alias a model, never
// invent one. excludedScopes merge into the same field names the R0
// registry uses; scope EVALUATION remains a deferred IOU (stored, not
// yet enforced — see exposure-overlay.test.ts scope-existence IOU).

import type { ModelConfig } from "../types.js";

export interface ExposureOverride {
  enabled: boolean;
  alias: string | null;
  isDefault: boolean;
  excludedScopes: string[];
}

export type ExposureOverlay = ReadonlyMap<string, ExposureOverride>;

/**
 * Apply the D1-wins exposure overlay to the base model registry, returning
 * the effective registry.
 */
export function overlayRegistry(
  base: Record<string, ModelConfig>,
  overlay: ExposureOverlay | null
): Record<string, ModelConfig> {
  if (!overlay || overlay.size === 0) return base;

  const merged: Record<string, ModelConfig> = {};
  for (const [id, config] of Object.entries(base)) {
    const row = overlay.get(id);
    if (!row) {
      merged[id] = config;
      continue;
    }
    merged[id] = {
      ...config,
      exposure: {
        enabled: row.enabled,
        alias: row.alias ?? undefined,
        excludedScopes: row.excludedScopes,
      },
    };
  }

  for (const id of overlay.keys()) {
    if (!(id in base)) {
      console.warn(`exposure overlay: ignoring row for unknown model "${id}"`);
    }
  }
  return merged;
}

// resolveDefaultModel was deleted by #158 / ADR-004: image routes require
// an explicit model, so is_default no longer rewrites any API default.
// The ExposureOverride.isDefault field and the DB column remain for admin
// health visibility until a later migration drops them.
