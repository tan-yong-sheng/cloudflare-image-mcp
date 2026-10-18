// ============================================================================
// Model registry access - lookup, exposure, and the listing projection
// ============================================================================
// The model table itself is generated: workers/src/config/models.json is the
// source of truth, projected by scripts/generate-models.mjs into
// ./models.generated.ts. Edit the JSON, then `cd workers && npm run
// models:gen`; `npm run check` (CI and the deploy workflow) fails when the
// two drift apart. This module is the hand-written surface over it.

import type { ModelConfig } from "../types.js";
import { MODEL_CONFIGS } from "./models.generated.js";

// Read-only at runtime: consumers iterate and serialize it, and the D1
// exposure overlay copies entries rather than mutating them.
export { MODEL_CONFIGS };

// R0 (#69): operator exposure flags, declared per model in models.json.
// enabled defaults true (absent = exposed); alias offers a short id;
// excludedScopes is stored for R1/D1 overrides (no scope evaluation exists
// yet). Later D1 exposure rows reuse these exact field names.
export const DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export function isModelExposed(config: ModelConfig): boolean {
  return config.exposure?.enabled ?? true;
}

export function resolveModelId(
  modelId: string,
  registry: Record<string, ModelConfig> = MODEL_CONFIGS
): string {
  if (registry[modelId]) return modelId;
  for (const [id, config] of Object.entries(registry)) {
    if (config.exposure?.alias === modelId) return id;
  }
  return modelId;
}

export function getModelConfig(modelId: string): ModelConfig | null {
  const config = MODEL_CONFIGS[resolveModelId(modelId)] || null;
  if (config && !isModelExposed(config)) return null;
  return config;
}

export function listModels(
  registry: Record<string, ModelConfig> = MODEL_CONFIGS
): Array<{
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  taskTypes: string[];
  editCapabilities?: ModelConfig["editCapabilities"];
  // Full parameter table + limits so the frontend can hide unsupported
  // controls and clamp sliders per model without hardcoding (#50).
  parameters: ModelConfig["parameters"];
  limits: ModelConfig["limits"];
  // Superset fields for service-side consumers (C3): the generator
  // projects its list from this registry instead of hand-writing one.
  provider: string;
  // The transport key (ADR-002). It, not `provider`, is what routing
  // resolves credentials by: `provider` names the model's author, so
  // several of them share one transport.
  inferenceProvider: string;
  supportedSizes: string[];
}> {
  // R0: disabled models are absent from every listing surface.
  return Object.values(registry)
    .filter(isModelExposed)
    .map((config) => ({
      id: config.id,
      name: config.name,
      description: config.description,
      capabilities: Object.keys(config.parameters),
      taskTypes: config.supportedTasks,
      editCapabilities: config.editCapabilities,
      parameters: config.parameters,
      limits: config.limits,
      provider: config.provider,
      inferenceProvider: config.inferenceProvider,
      supportedSizes: config.limits.supportedSizes,
    }));
}
