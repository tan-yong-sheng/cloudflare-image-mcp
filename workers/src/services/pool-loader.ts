// ============================================================================
// Provider pool loader - D1 rows into a servable pool (R1b, #72)
// ============================================================================
// Async because envelope opening is async. D1 rows open with PROVIDER_DATA_KEY
// into pool credentials; anything else falls through to the env paths from
// pool-source (AI_ACCOUNTS with warning, bootstrap fallback). A missing key,
// an unopenable envelope, or zero servable rows degrades to the env path —
// never throws, so a half-migrated store cannot take inference down (no flag
// day). Every returned pool carries the source that ACTUALLY serves it:
// index.ts always passes a pool downstream, so a pool that silently fell
// back must not later be reported as "d1". Labels only in logs; envelopes
// and tokens never logged.

import type { Env } from "../types.js";
import { ProviderPool, type PoolKey } from "./provider-pool.js";
import { resolvePoolSource, type PoolRow } from "./pool-source.js";

export interface PoolLoaderDeps {
  readRows: () => Promise<PoolRow[]>;
  openEnvelope: (envelope: string, keyMaterial: string) => Promise<string>;
}

/**
 * Load the servable provider pool from D1 rows (envelopes opened with the
 * data key), degrading to env credentials on any gap — never throws.
 */
export async function loadProviderPool(
  env: Env,
  deps: PoolLoaderDeps
): Promise<ProviderPool> {
  const rows = await deps.readRows();
  if (rows.length === 0) {
    return envPool(env);
  }

  const dataKey = env.PROVIDER_DATA_KEY;
  if (!dataKey) {
    console.warn(
      "D1 provider rows exist but PROVIDER_DATA_KEY is not set; falling back to env credentials"
    );
    return envPool(env);
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
      `provider pool: ${rows.length} D1 row(s) present, none servable; ` +
        "falling back to env credentials"
    );
    return envPool(env);
  }
  return new ProviderPool(keys, { source: "d1" });
}

/** The env side of the dual-read: AI_ACCOUNTS (warned) or bootstrap. */
function envPool(env: Env): ProviderPool {
  const src = resolvePoolSource(env, () => []);
  return new ProviderPool(
    src.keys.map((k) => ({
      label: k.label,
      accountId: k.accountId,
      apiToken: k.apiToken ?? "",
      weight: k.weight,
      enabled: k.enabled,
    })),
    { source: src.source }
  );
}
