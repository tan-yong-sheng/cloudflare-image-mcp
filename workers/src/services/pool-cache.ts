// ============================================================================
// Config snapshot cache - isolate-scoped boot-load + version-poll (R1b, #72)
// ============================================================================
// The hot path must stay off D1: the provider pool and the exposure overlay
// load once per isolate, then a single-row config_versions poll (cheap)
// decides whether to reload both payloads together. A TTL window collapses
// bursts; a failed version query or a failed reload serves the stale
// snapshot; a failed overlay load drops the overlay — a D1 blip must never
// take inference down. Without a version source the snapshot reloads
// after each TTL window. Clock, version source, and loaders are injected
// for deterministic tests; production deps read PROVIDER_DB and open
// envelopes with PROVIDER_DATA_KEY via loadProviderPool.

import type { Env } from "../types.js";
import type { ProviderPool } from "./provider-pool.js";
import { loadProviderPool } from "./pool-loader.js";
import { openEnvelope } from "./provider-crypto.js";
import type { ExposureOverlay } from "../config/exposure-overlay.js";

export interface PoolCacheDeps {
  loadPool: () => Promise<ProviderPool>;
  loadOverlay?: () => Promise<ExposureOverlay>;
  readVersion: () => Promise<number | null>;
  now?: () => number;
  ttlMs?: number;
}

interface Snapshot {
  pool: ProviderPool;
  overlay: ExposureOverlay;
  version: number | null;
  checkedAt: number;
}

const DEFAULT_TTL_MS = 5_000;

let snapshot: Snapshot | null = null;

/** Test hook: drop the isolate cache so each test boot-loads. */
export function resetPoolCache(): void {
  snapshot = null;
}

export async function getProviderPool(
  env: Env,
  deps?: PoolCacheDeps
): Promise<ProviderPool> {
  return (await getSnapshot(env, deps)).pool;
}

export async function getExposureOverlay(
  env: Env,
  deps?: PoolCacheDeps
): Promise<ExposureOverlay> {
  return (await getSnapshot(env, deps)).overlay;
}

async function getSnapshot(env: Env, deps?: PoolCacheDeps): Promise<Snapshot> {
  const d = deps ?? productionDeps(env);
  const now = (d.now ?? Date.now)();
  const ttl = d.ttlMs ?? DEFAULT_TTL_MS;

  if (!snapshot) {
    const { pool, overlay } = await loadBoth(d);
    snapshot = {
      pool,
      overlay,
      version: await readVersionOrNull(d),
      checkedAt: now,
    };
    return snapshot;
  }

  if (now - snapshot.checkedAt < ttl) return snapshot;

  let version: number | null;
  try {
    version = await d.readVersion();
  } catch {
    snapshot.checkedAt = now;
    console.warn("config snapshot cache: version poll failed, serving stale");
    return snapshot;
  }

  if (version !== null && version === snapshot.version) {
    snapshot.checkedAt = now;
    return snapshot;
  }

  const previous = snapshot;
  let reloaded: { pool: ProviderPool; overlay: ExposureOverlay };
  try {
    reloaded = await loadBoth(d);
  } catch {
    // Never replace a good snapshot with an error: inference keeps
    // serving the previous pool until a later reload succeeds.
    previous.checkedAt = now;
    console.warn("config snapshot cache: reload failed, serving stale");
    return previous;
  }
  snapshot = { ...reloaded, version, checkedAt: now };
  return snapshot;
}

async function loadBoth(
  d: PoolCacheDeps
): Promise<{ pool: ProviderPool; overlay: ExposureOverlay }> {
  const [pool, overlay] = await Promise.all([
    d.loadPool(),
    (d.loadOverlay ? d.loadOverlay() : Promise.resolve(new Map())).catch(() => {
      // The overlay only refines the base registry; losing it must
      // never fail the pool load beside it.
      console.warn(
        "config snapshot cache: exposure overlay load failed, serving without it"
      );
      return new Map();
    }),
  ]);
  return { pool, overlay };
}

async function readVersionOrNull(d: PoolCacheDeps): Promise<number | null> {
  try {
    return await d.readVersion();
  } catch {
    return null;
  }
}

/**
 * The production D1-backed deps. Exported for the S5 harness test, which
 * executes these exact queries against the real migration — the injected
 * cache tests alone would never catch a query/schema drift.
 */
export function productionDeps(env: Env): PoolCacheDeps {
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
    loadOverlay: async () => {
      if (!db) return new Map();
      const res = await db
        .prepare(
          `SELECT e.model_id AS modelId,
                  e.enabled AS enabled,
                  e.alias AS alias,
                  e.is_default AS isDefault,
                  s.scope AS scope
             FROM exposure_overrides e
             LEFT JOIN excluded_scopes s ON s.model_id = e.model_id`
        )
        .all<{
          modelId: string;
          enabled: number;
          alias: string | null;
          isDefault: number;
          scope: string | null;
        }>();
      const grouped = new Map<
        string,
        {
          enabled: boolean;
          alias: string | null;
          isDefault: boolean;
          excludedScopes: string[];
        }
      >();
      for (const r of res.results ?? []) {
        let row = grouped.get(r.modelId);
        if (!row) {
          row = {
            enabled: r.enabled === 1,
            alias: r.alias,
            isDefault: r.isDefault === 1,
            excludedScopes: [],
          };
          grouped.set(r.modelId, row);
        }
        if (r.scope !== null) row.excludedScopes.push(r.scope);
      }
      return grouped as ExposureOverlay;
    },
  };
}
