// ============================================================================
// Provider pool loader - D1 rows into servable per-provider pools (ADR-001)
// ============================================================================
// Async because envelope opening is async. D1 rows open with PROVIDER_DATA_KEY
// into pool credentials. Database-only: no environment variable fallback.
// A missing key or unopenable envelope yields no servable pool (clear error
// path). Rows are grouped by provider_id, so each provider gets its own
// pool and its own cooldown state — one provider's parked keys can never
// absorb another's requests. Labels only in logs; envelopes and tokens never
// logged.

import type { Env } from "../types.js";
import { ProviderPool, type PoolKey } from "./provider-pool.js";
import type { ProviderPoolEntry } from "./provider-pools.js";
import { resolvePoolSource, type PoolRow } from "./pool-source.js";

export interface PoolLoaderDeps {
  readRows: () => Promise<PoolRow[]>;
  openEnvelope: (envelope: string, keyMaterial: string) => Promise<string>;
}

/**
 * Load the servable pools from D1 rows (envelopes opened with PROVIDER_DATA_KEY,
 * ADR-001). Returns an empty list on any error (D1 outage, no data key); a
 * provider with no rows is simply absent, which is the same shape readiness
 * and routing read. Providers are keyed by provider_id and tagged with the
 * transport their `providers` row declares.
 */
export async function loadProviderPools(
  env: Env,
  deps: PoolLoaderDeps
): Promise<ProviderPoolEntry[]> {
  let rows: PoolRow[];
  try {
    rows = await deps.readRows();
  } catch {
    console.error("provider pool: D1 read failed. Cannot load credentials.");
    return [];
  }
  if (rows.length === 0) {
    console.warn(
      "provider pool: no credentials in database. Add via admin UI at /#admin"
    );
    return [];
  }

  const dataKey = env.PROVIDER_DATA_KEY;
  if (!dataKey) {
    console.error(
      "D1 provider rows exist but PROVIDER_DATA_KEY is not set. Cannot decrypt credentials."
    );
    return [];
  }

  // Group rows by provider so each pool holds one provider's credentials.
  const grouped = new Map<string, { transport: string; keys: PoolKey[] }>();
  const totals = new Map<string, number>();
  for (const row of rows) {
    let group = grouped.get(row.providerId);
    if (!group) {
      group = { transport: row.transport, keys: [] };
      grouped.set(row.providerId, group);
    }
    totals.set(row.providerId, (totals.get(row.providerId) ?? 0) + 1);

    try {
      group.keys.push({
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
      group.keys.push({
        label: row.label,
        accountId: row.accountId,
        apiToken: "",
        weight: 0,
        enabled: false,
      });
    }
  }

  const entries: ProviderPoolEntry[] = [];
  for (const [providerId, group] of grouped) {
    const servable = group.keys.filter((k) => k.enabled && k.weight > 0);
    if (servable.length === 0) {
      console.warn(
        `provider pool: ${totals.get(providerId)} D1 row(s) for "${providerId}", none servable. Add credentials via admin UI.`
      );
    }
    entries.push({
      providerId,
      transport: group.transport,
      pool: new ProviderPool(group.keys, { source: "d1" }),
    });
  }
  return entries;
}
