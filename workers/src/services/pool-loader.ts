// ============================================================================
// Provider pool loader - D1 rows into a servable pool (R1b, #72)
// ============================================================================
// Async because envelope opening is async. D1 rows open with PROVIDER_DATA_KEY
// into pool credentials; anything else falls through to the env paths from
// pool-source (AI_ACCOUNTS with warning, bootstrap fallback). A missing key
// or an unopenable envelope degrades to fallback/parked — never throws, so a
// half-migrated store cannot take inference down (no flag day). Labels only
// in logs; envelopes and tokens never logged.

import type { Env } from "../types.js";
import { ProviderPool, type PoolKey } from "./provider-pool.js";
import { resolvePoolSource, type PoolRow } from "./pool-source.js";

export interface PoolLoaderDeps {
  readRows: () => Promise<PoolRow[]>;
  openEnvelope: (envelope: string, keyMaterial: string) => Promise<string>;
}

export async function loadProviderPool(
  env: Env,
  deps: PoolLoaderDeps
): Promise<ProviderPool> {
  const rows = await deps.readRows();
  if (rows.length === 0) {
    const src = resolvePoolSource(env, () => []);
    return new ProviderPool(
      src.keys.map((k) => ({
        label: k.label,
        accountId: k.accountId,
        apiToken: k.apiToken ?? "",
        weight: k.weight,
        enabled: k.enabled,
      }))
    );
  }

  const dataKey = (env as Env & { PROVIDER_DATA_KEY?: string })
    .PROVIDER_DATA_KEY;
  if (!dataKey) {
    console.warn(
      "D1 provider rows exist but PROVIDER_DATA_KEY is not set; falling back to deploy credentials"
    );
    const src = resolvePoolSource({ ...env, AI_ACCOUNTS: undefined }, () => []);
    return new ProviderPool(
      src.keys.map((k) => ({
        label: k.label,
        accountId: k.accountId,
        apiToken: k.apiToken ?? "",
        weight: k.weight,
        enabled: k.enabled,
      }))
    );
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
      // Unopenable envelope: park the key via a pre-expired cooldown entry
      // by adding it disabled — it stays visible in labels(), never picked.
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
  return new ProviderPool(keys);
}
