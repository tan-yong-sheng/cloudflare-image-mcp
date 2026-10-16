// ============================================================================
// Provider pool loader - D1 rows into a servable pool (ADR-001)
// ============================================================================
// Async because envelope opening is async. D1 rows open with PROVIDER_DATA_KEY
// into pool credentials. Database-only: no environment variable fallback.
// A missing key or unopenable envelope returns an empty pool (clear error path).
// Labels only in logs; envelopes and tokens never logged.

import type { Env } from "../types.js";
import { ProviderPool, type PoolKey } from "./provider-pool.js";
import { resolvePoolSource, type PoolRow } from "./pool-source.js";

export interface PoolLoaderDeps {
  readRows: () => Promise<PoolRow[]>;
  openEnvelope: (envelope: string, keyMaterial: string) => Promise<string>;
}

/**
 * Load the servable provider pool from D1 rows (envelopes opened with the
 * Database-only credential loading (ADR-001). Opens D1 envelopes with the
 * data key. Returns empty pool on any error (D1 outage, no data key).
 */
export async function loadProviderPool(
  env: Env,
  deps: PoolLoaderDeps
): Promise<ProviderPool> {
  let rows: PoolRow[];
  try {
    rows = await deps.readRows();
  } catch {
    console.error("provider pool: D1 read failed. Cannot load credentials.");
    return new ProviderPool([], { source: "d1" });
  }
  if (rows.length === 0) {
    console.warn(
      "provider pool: no credentials in database. Add via admin UI at /#admin"
    );
    return new ProviderPool([], { source: "d1" });
  }

  const dataKey = env.PROVIDER_DATA_KEY;
  if (!dataKey) {
    console.error(
      "D1 provider rows exist but PROVIDER_DATA_KEY is not set. Cannot decrypt credentials."
    );
    return new ProviderPool([], { source: "d1" });
  }

  const keys: PoolKey[] = [];
  for (const row of rows) {
    try {
      keys.push({
        label: row.label,
        accountId: row.accountId,
        apiToken: await deps.openEnvelope(row.envelope, dataKey),
        weight: row.weight,
        enabled: row.enabled,
      });
    } catch {
      // Unopenable envelope: park the key by disabling it — it stays
      // visible in labels(), never picked.
      console.warn(
        `provider pool: skipping unopenable credential "${row.label}"`
      );
      keys.push({
        label: row.label,
        accountId: row.accountId,
        apiToken: "",
        weight: 0,
        enabled: false,
      });
    }
  }

  const servable = keys.filter((k) => k.enabled && k.weight > 0);
  if (servable.length === 0) {
    console.warn(
      `provider pool: ${rows.length} D1 row(s) present, none servable. Add credentials via admin UI.`
    );
  }
  return new ProviderPool(keys, { source: "d1" });
}
