/**
 * E2E live-test tier map — single owner for tier → (grep, timeout).
 *
 * One tier change lands here; playwright.config.ts, package.json scripts,
 * and the workflow consume this module's interface instead of re-encoding
 * the same map. Title tags (@slow/@smoke/@drift) must stay in spec titles
 * (Playwright tags live in titles), and the workflow still sets plain
 * E2E_* env names (YAML cannot import TS) — this module removes the
 * *semantic* duplication, not those two mechanical copies.
 *
 * Tiers (live-call cost grows downward):
 * - contract (default): 0 live calls, 60s budget (tests finish in ms).
 * - smoke: contract + 2 @smoke canaries (~2 live calls), 180s for
 *   cold workers. Gated release-integration PRs.
 * - canary: smoke + 6 @drift (weekly schedule, ~8 live calls), 180s.
 * - slow: everything incl. skipped manifests (dispatch escape hatch).
 */

export type TierName = "contract" | "smoke" | "canary" | "slow";

export interface TierSpec {
  /** Playwright grepInvert: undefined means "exclude nothing". */
  grepInvert: RegExp | undefined;
  /** Per-test timeout budget in ms. */
  timeout: number;
  /** Human line for logs and docs. */
  description: string;
}

const CONTRACT: TierSpec = {
  grepInvert: /@slow/,
  timeout: 60000,
  description: "contract only (0 live calls)",
};

const SMOKE: TierSpec = {
  // Tag-order independent: a title containing @smoke anywhere is kept.
  grepInvert: /^(?!.*@smoke).*@slow/,
  timeout: 180000,
  description: "contract + 2 @smoke canaries (~2 live calls)",
};

const CANARY: TierSpec = {
  grepInvert: /^(?!.*(@smoke|@drift)).*@slow/,
  timeout: 180000,
  description: "contract + @smoke + @drift (~8 live calls)",
};

const SLOW: TierSpec = {
  grepInvert: undefined,
  timeout: 180000,
  description: "full @slow matrix (dispatch escape hatch)",
};

/**
 * Resolve the active tier. E2E_TIER (contract|smoke|canary|slow) wins
 * when non-empty; otherwise the legacy E2E_* flags apply (E2E_SLOW over
 * E2E_DRIFT over E2E_SMOKE); unset means contract-only.
 */
export function getTier(env: NodeJS.ProcessEnv = process.env): {
  name: TierName;
  spec: TierSpec;
} {
  const named = (env.E2E_TIER || "").trim();
  if (named) {
    const resolved = getTierFromName(named);
    if (resolved.name !== named) {
      console.warn(
        `Unknown E2E_TIER="${named}", falling back to contract tier.`
      );
    }
    return resolved;
  }
  if (env.E2E_SLOW === "1") return { name: "slow", spec: SLOW };
  if (env.E2E_DRIFT === "1") return { name: "canary", spec: CANARY };
  if (env.E2E_SMOKE === "1") return { name: "smoke", spec: SMOKE };
  return { name: "contract", spec: CONTRACT };
}

/**
 * Single env var for scripts/CI: E2E_TIER=smoke|canary|slow (unset =
 * contract). Maps onto the same tiers as the legacy E2E_* flags.
 */
export function getTierFromName(name: string | undefined): {
  name: TierName;
  spec: TierSpec;
} {
  switch (name) {
    case "smoke":
      return { name: "smoke", spec: SMOKE };
    case "canary":
      return { name: "canary", spec: CANARY };
    case "slow":
      return { name: "slow", spec: SLOW };
    default:
      return { name: "contract", spec: CONTRACT };
  }
}
