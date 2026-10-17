// ============================================================================
// Provider pool loader - D1 rows into servable per-provider pools (ADR-001)
// ============================================================================
// Async because envelope opening is async. D1 rows open with PROVIDER_DATA_KEY
// into pool credentials. Database-only: no environment variable fallback.
// A load that cannot happen — unreadable store, no data key — throws, so the
// snapshot cache keeps serving the previous pools instead of replacing them
// with none; a store that legitimately has no rows returns no pools. A row
// whose envelope will not open is parked and counted instead, which the cache
// reads as "no envelope opened" to keep the previous pools while readiness
// still names the rows it cannot serve. Rows are
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
 * depends on that distinction. A row that will not open does not reject —
 * readiness has to report the rows it cannot serve — so it is parked with
 * unopenableRows counted, which lets the cache tell a broken key from rows the
 * operator parked. A provider with no rows is simply absent, which is the same
 * shape readiness and routing read. Providers are keyed by provider_id and
 * tagged with the transport their `providers` row declares.
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
  const grouped = new Map<
    string,
    { transport: string; keys: PoolKey[]; unopenable: number }
  >();
  const totals = new Map<string, number>();
  for (const row of rows) {
    let group = grouped.get(row.providerId);
    if (!group) {
      group = { transport: row.transport, keys: [], unopenable: 0 };
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
      // visible in labels(), never picked, and never counted servable — and
      // count it, so a load that opened nothing is distinguishable from one
      // whose rows the operator parked.
      group.unopenable += 1;
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

  // Nothing opened at all: AES-GCM cannot tell a wrong key from row
  // corruption, so this is the wrong-key case, not "the operator disabled
  // everything" (those rows open). Say so once, naming the likely cause;
  // the cache keeps the previous pools on the unopenableRows count below,
  // because resolving would otherwise replace working pools with nothing.
  const unopenableRows = [...grouped.values()].reduce(
    (n, g) => n + g.unopenable,
    0
  );
  if (unopenableRows === rows.length) {
    console.error(
      `provider pool: PROVIDER_DATA_KEY opened none of ${rows.length} D1 credential row(s). Cannot decrypt credentials.`
    );
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
      unopenableRows: group.unopenable,
    });
  }
  return entries;
}
