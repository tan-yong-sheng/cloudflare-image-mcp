// ============================================================================
// Pool source resolution - database-only (ADR-001)
// ============================================================================
// Single source of truth: credentials come from D1 database rows only.
// Envelopes stay sealed — opening them is the pool's job, not this module's.
// The db reader is injected (production D1 vs in-memory double).
// When D1 is empty, returns empty pool (clear error path).

import type { Env } from "../types.js";

/** One D1 credential row as the resolver sees it (envelope still sealed). */
export interface PoolRow {
  label: string;
  accountId: string;
  envelope: string;
  weight: number;
  enabled: boolean;
}

/** One resolved credential from D1 (envelope still sealed). */
export interface ResolvedKey {
  label: string;
  accountId: string;
  /** Sealed credential envelope from D1. */
  envelope: string;
  weight: number;
  enabled: boolean;
}

export interface PoolSource {
  source: "d1";
  keys: ResolvedKey[];
}

/**
 * Resolve provider credentials from D1 database only (ADR-001).
 * Returns empty pool when no credentials exist (clear error path).
 */
export function resolvePoolSource(
  env: Env,
  readD1?: () => PoolRow[]
): PoolSource {
  const d1Rows = readD1?.() ?? [];

  if (d1Rows.length === 0) {
    console.warn(
      "No credentials configured in database. Add credentials via admin UI at /#admin"
    );
  }

  return {
    source: "d1",
    keys: d1Rows.map((r) => ({
      label: r.label,
      accountId: r.accountId,
      envelope: r.envelope,
      weight: r.weight,
      enabled: r.enabled,
    })),
  };
}
