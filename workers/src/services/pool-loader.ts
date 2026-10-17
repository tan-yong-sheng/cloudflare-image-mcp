// ============================================================================
// Provider pool loader - D1 rows into servable per-provider pools (ADR-001)
// ============================================================================
// Async because envelope opening is async. D1 rows open with PROVIDER_DATA_KEY
// into pool credentials. Database-only: no environment variable fallback.
// A load that cannot happen — unreadable store, no data key — throws, so the
// snapshot cache keeps serving the previous pools instead of replacing them
// with none; a store that legitimately has no rows returns no pools. Rows are
// grouped by provider_id, so each provider gets its own pool and its own
// cooldown state — one provider's parked keys can never absorb another's
// requests. Labels only in logs; envelopes and tokens never logged.

import type { Env } from "../types.js";
import { ProviderPool, type PoolKey } from "./provider-pool.js";
import type { ProviderPoolEntry } from "./provider-pools.js";

/** One D1 credential row as the loader sees it (envelope still sealed). */
export interface PoolRow {
  /** Owning providers row; groups credentials into per-provider pools. */
  providerId: string;
  /** The owning provider's transport key (providers.transport). */
  transport: string;
  label: string;
  accountId: string;
  envelope: string;
  weight: number;
  enabled: boolean;
}

export interface PoolLoaderDeps {
  readRows: () => Promise<PoolRow[]>;
  openEnvelope: (envelope: string, keyMaterial: string) => Promise<string>;
}

/**
 * Load the servable pools from D1 rows (envelopes opened with
 * PROVIDER_DATA_KEY, ADR-001). Rejects when the store cannot be read or the
 * data key is missing: both are failures the caller must distinguish from
 * "no credentials configured", and the snapshot cache's stale-serving path
 * depends on that distinction. A provider with no rows is simply absent,
 * which is the same shape readiness and routing read. Providers are keyed by
 * provider_id and tagged with the transport their `providers` row declares.
 */
export async function loadProviderPools(
  env: Env,
  deps: PoolLoaderDeps
): Promise<ProviderPoolEntry[]> {
  let rows: PoolRow[];
  try {
    rows = await deps.readRows();
  } catch (error) {
    // Propagate, never resolve to []: the cache keeps the previous pools
    // only when this rejects, so swallowing a D1 blip here would replace
    // working credentials with none until the next successful load.
    console.error("provider pool: D1 read failed. Cannot load credentials.");
    throw error;
  }
  if (rows.length === 0) {
    console.warn(
      "provider pool: no credentials in database. Add via admin UI at /#admin"
    );
    return [];
  }

  const dataKey = env.PROVIDER_DATA_KEY;
  if (!dataKey) {
    // Rows exist but cannot be opened: a configuration failure, not an
    // empty store, so it must not resolve to "no credentials" either.
    console.error(
      "D1 provider rows exist but PROVIDER_DATA_KEY is not set. Cannot decrypt credentials."
    );
    throw new Error(
      "PROVIDER_DATA_KEY is not set; cannot decrypt provider credentials"
    );
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
      // visible in labels(), never picked, and never counted servable.
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
