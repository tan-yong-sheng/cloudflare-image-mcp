// ============================================================================
// Provider pool cache - isolate-scoped boot-load + version-poll (R1b, #72)
// ============================================================================
// The hot path must stay off D1: the pool loads once per isolate, then a
// single-row config_versions poll (cheap) decides whether to reload. A TTL
// window collapses bursts; a failed version query serves the stale pool —
// a D1 blip must never take inference down. Without a version source the
// pool reloads after each TTL window. Clock, version source, and loader
// are injected for deterministic tests; production deps read PROVIDER_DB
// and open envelopes with PROVIDER_DATA_KEY via loadProviderPool.

import type { Env } from "../types.js";
import { ProviderPool } from "./provider-pool.js";
import { loadProviderPool } from "./pool-loader.js";
import { openEnvelope } from "./provider-crypto.js";

export interface PoolCacheDeps {
  loadPool: () => Promise<ProviderPool>;
  readVersion: () => Promise<number | null>;
  now?: () => number;
  ttlMs?: number;
}

interface CacheEntry {
  pool: ProviderPool;
  version: number | null;
  checkedAt: number;
}

const DEFAULT_TTL_MS = 5_000;

let cache: CacheEntry | null = null;

/** Test hook: drop the isolate cache so each test boot-loads. */
export function resetPoolCache(): void {
  cache = null;
}

export async function getProviderPool(
  env: Env,
  deps?: PoolCacheDeps
): Promise<ProviderPool> {
  const d = deps ?? productionDeps(env);
  const now = (d.now ?? Date.now)();
  const ttl = d.ttlMs ?? DEFAULT_TTL_MS;

  if (!cache) {
    const pool = await d.loadPool();
    cache = { pool, version: await readVersionOrNull(d), checkedAt: now };
    return pool;
  }

  if (now - cache.checkedAt < ttl) return cache.pool;

  let version: number | null;
  try {
    version = await d.readVersion();
  } catch {
    cache.checkedAt = now;
    console.warn("provider pool cache: version poll failed, serving stale");
    return cache.pool;
  }

  if (version !== null && version === cache.version) {
    cache.checkedAt = now;
    return cache.pool;
  }

  const pool = await d.loadPool();
  cache = { pool, version, checkedAt: now };
  return pool;
}

async function readVersionOrNull(d: PoolCacheDeps): Promise<number | null> {
  try {
    return await d.readVersion();
  } catch {
    return null;
  }
}

function productionDeps(env: Env): PoolCacheDeps {
  const db = env.PROVIDER_DB;
  return {
    readVersion: async () => {
      if (!db) return null;
      const row = await db
        .prepare("SELECT version FROM config_versions WHERE id = 1")
        .first<{ version: number }>();
      return row?.version ?? null;
    },
    loadPool: () =>
      loadProviderPool(env, {
        readRows: async () => {
          if (!db) return [];
          const res = await db
            .prepare(
              `SELECT k.label AS label,
                      k.external_account_id AS accountId,
                      v.envelope AS envelope,
                      k.weight AS weight,
                      k.enabled AS enabled
                 FROM provider_keys k
                 JOIN credential_versions v
                   ON v.provider_key_id = k.id AND v.revoked_at IS NULL`
            )
            .all<{
              label: string;
              accountId: string;
              envelope: string;
              weight: number;
              enabled: number;
            }>();
          return (res.results ?? []).map((r) => ({
            label: r.label,
            accountId: r.accountId,
            envelope: r.envelope,
            weight: r.weight,
            enabled: r.enabled === 1,
          }));
        },
        openEnvelope,
      }),
  };
}
