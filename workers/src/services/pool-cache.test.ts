// ============================================================================
// Provider pool cache tests - R1b (#72), seam S4 slice F2
// ============================================================================
// Seam: getProviderPools(env, deps) — the isolate-scoped cache so the hot
// path stays off D1. Proves boot-load once, version-poll inside a TTL
// window, reload only on config_versions change, stale-serving when the
// version query or the reload fails (a D1 blip never takes inference
// down), and reload when no version source exists. Clock, version source,
// and loader are injected — no D1, no timers, no real crypto.

import { beforeEach, describe, expect, test } from "vitest";
import {
  getProviderPools,
  getExposureOverlay,
  resetPoolCache,
  type PoolCacheDeps,
} from "./pool-cache.js";
import { ProviderPool } from "./provider-pool.js";
import type { ProviderPools } from "./provider-pools.js";
import type { Env } from "../types.js";

const ENV = { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t" } as Env;

/** The labels of the one provider the cache fakes carry. */
function labelsOf(pools: ProviderPools): string[] {
  return pools.forProvider("cloudflare")?.labels() ?? [];
}

function makeFakes(ttlMs = 1_000) {
  let version = 1;
  let loads = 0;
  let reads = 0;
  let nowMs = 0;
  const deps: PoolCacheDeps = {
    loadPools: async () => {
      loads++;
      const label = `v${version}`;
      return [
        {
          providerId: "cloudflare",
          transport: "cloudflare-rest",
          pool: new ProviderPool([
            { label, accountId: "a", apiToken: "t", weight: 1, enabled: true },
          ]),
        },
      ];
    },
    readVersion: async () => {
      reads++;
      return version;
    },
    now: () => nowMs,
    ttlMs,
  };
  return {
    bump: () => ++version,
    advance: (ms: number) => {
      nowMs += ms;
    },
    counts: () => ({ loads, reads }),
    deps,
  };
}

beforeEach(() => resetPoolCache());

describe("pool cache (F2)", () => {
  test("boot-loads once and serves the cached pool inside the TTL window", async () => {
    const f = makeFakes();
    const first = await getProviderPools(ENV, f.deps);
    const second = await getProviderPools(ENV, f.deps);
    expect(f.counts()).toEqual({ loads: 1, reads: 1 });
    expect(second).toBe(first);
    expect(labelsOf(first)).toEqual(["v1"]);
  });

  test("after the TTL, an unchanged version keeps the cached pool", async () => {
    const f = makeFakes();
    const first = await getProviderPools(ENV, f.deps);
    f.advance(1_001);
    const again = await getProviderPools(ENV, f.deps);
    expect(f.counts()).toEqual({ loads: 1, reads: 2 });
    expect(again).toBe(first);
  });

  test("a version bump after the TTL reloads the pool", async () => {
    const f = makeFakes();
    await getProviderPools(ENV, f.deps);
    f.bump();
    f.advance(1_001);
    const reloaded = await getProviderPools(ENV, f.deps);
    expect(f.counts()).toEqual({ loads: 2, reads: 2 });
    expect(labelsOf(reloaded)).toEqual(["v2"]);
  });

  test("a failing version query serves the stale pool, never throws", async () => {
    const f = makeFakes();
    const first = await getProviderPools(ENV, f.deps);
    f.advance(1_001);
    f.deps.readVersion = async () => {
      throw new Error("D1 unavailable");
    };
    const stale = await getProviderPools(ENV, f.deps);
    expect(stale).toBe(first);
    expect(f.counts().loads).toBe(1);
  });

  test("with no version source, the pool reloads after each TTL window", async () => {
    const f = makeFakes();
    f.deps.readVersion = async () => null;
    const first = await getProviderPools(ENV, f.deps);
    f.advance(1_001);
    const second = await getProviderPools(ENV, f.deps);
    expect(f.counts().loads).toBe(2);
    expect(second).not.toBe(first);
  });

  test("the exposure overlay rides the same cache and version poll", async () => {
    let overlayLoads = 0;
    let row = "first";
    const f = makeFakes();
    f.deps.loadOverlay = async () => {
      overlayLoads++;
      return new Map([
        [
          "@cf/model-a",
          { enabled: true, alias: row, isDefault: false, excludedScopes: [] },
        ],
      ]);
    };
    const first = await getExposureOverlay(ENV, f.deps);
    expect(first.get("@cf/model-a")?.alias).toBe("first");
    // Within the TTL: served from cache, no reload, no version query.
    row = "second";
    expect(
      (await getExposureOverlay(ENV, f.deps)).get("@cf/model-a")?.alias
    ).toBe("first");
    expect(overlayLoads).toBe(1);
    // Version bump: both payloads reload on the shared poll.
    f.bump();
    f.advance(1_001);
    const reloaded = await getExposureOverlay(ENV, f.deps);
    expect(reloaded.get("@cf/model-a")?.alias).toBe("second");
    expect(overlayLoads).toBe(2);
    expect(f.counts().loads).toBe(2);
  });

  test("an overlay load failure at boot serves the pool without it", async () => {
    const f = makeFakes();
    f.deps.loadOverlay = async () => {
      throw new Error("D1 unavailable");
    };
    const pool = await getProviderPools(ENV, f.deps);
    expect(labelsOf(pool)).toEqual(["v1"]);
    expect((await getExposureOverlay(ENV, f.deps)).size).toBe(0);
  });

  test("a failed reload keeps serving the previous snapshot", async () => {
    const f = makeFakes();
    const first = await getProviderPools(ENV, f.deps);
    f.advance(1_001);
    f.bump();
    f.deps.loadPools = async () => {
      throw new Error("D1 unavailable");
    };
    const stale = await getProviderPools(ENV, f.deps);
    expect(stale).toBe(first);
    expect(f.counts().loads).toBe(1);
  });

  test("without an overlay loader the overlay is an empty map", async () => {
    const f = makeFakes();
    const overlay = await getExposureOverlay(ENV, f.deps);
    expect(overlay.size).toBe(0);
  });
});
