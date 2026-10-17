// ============================================================================
// Provider pool cache tests - R1b (#72), seam S4 slice F2
// ============================================================================
// Seam: getProviderPools(env, deps) — the isolate-scoped cache so the hot
// path stays off D1. Proves boot-load once, version-poll inside a TTL
// window, reload only on config_versions change, stale-serving when the
// version query fails, the reload fails, or the reload opens no envelope at
// all (a D1 blip or a wrong data key never takes inference down), and reload
// when no version source exists. Clock, version source,
// and loader are injected — no D1, no timers, no real crypto.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  getProviderPools,
  getExposureOverlay,
  resetPoolCache,
  type PoolCacheDeps,
} from "./pool-cache.js";
import { ProviderPool } from "./provider-pool.js";
import type { ProviderPools } from "./provider-pools.js";
import type { ProviderPoolEntry } from "./provider-pools.js";
import { loadProviderPools } from "./pool-loader.js";
import type { PoolRow } from "./pool-loader.js";
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

  // The two tests below cross the F2/S4 seam on purpose: the cache tests
  // above inject a loader that throws, so they passed while the production
  // loader swallowed a D1 failure and resolved to [] — a blip replaced good
  // credentials with none. These drive the real loader through the cache.
  const d1Row = {
    providerId: "cloudflare",
    transport: "cloudflare-rest",
    label: "k1",
    accountId: "a1",
    envelope: "env-1",
    weight: 1,
    enabled: true,
  } satisfies PoolRow;

  function loaderDeps(
    readRows: () => Promise<PoolRow[]>,
    openEnvelope: (
      envelope: string,
      keyMaterial: string
    ) => Promise<string> = async () => "token"
  ) {
    return (): Promise<ProviderPoolEntry[]> =>
      loadProviderPools({ ...ENV, PROVIDER_DATA_KEY: "data-key" } as Env, {
        readRows,
        openEnvelope,
      });
  }

  test("a real loader failure on refresh keeps the previous pools", async () => {
    let failing = false;
    const f = makeFakes();
    const deps: PoolCacheDeps = {
      ...f.deps,
      loadPools: loaderDeps(async () => {
        if (failing) throw new Error("D1 unavailable");
        return [d1Row];
      }),
    };

    const first = await getProviderPools(ENV, deps);
    expect(labelsOf(first)).toEqual(["k1"]);

    failing = true;
    f.advance(1_001);
    f.bump();
    const stale = await getProviderPools(ENV, deps);
    expect(stale).toBe(first);
    expect(labelsOf(stale)).toEqual(["k1"]);
  });

  test("a real loader failure at cold start serves no credentials, then recovers", async () => {
    let failing = true;
    const f = makeFakes();
    const deps: PoolCacheDeps = {
      ...f.deps,
      // Both halves go through the production loader, so this exercises the
      // real throw-on-D1-failure path rather than a synthetic rejection.
      loadPools: loaderDeps(async () => {
        if (failing) throw new Error("D1 unavailable");
        return [d1Row];
      }),
    };

    const cold = await getProviderPools(ENV, deps);
    expect(cold.hasAnyServable()).toBe(false);

    // Recovery must not need a config-version bump: the empty cold snapshot
    // records version null, so the version-match shortcut cannot pin it.
    failing = false;
    f.advance(1_001);
    const recovered = await getProviderPools(ENV, deps);
    expect(labelsOf(recovered)).toEqual(["k1"]);
  });

  test("a reload that opens no envelope keeps the previous pools", async () => {
    // A wrong PROVIDER_DATA_KEY parks every row and the loader resolves, so
    // the cache cannot lean on a rejection here: it has to read the
    // unopenable counts, or a bad secret trades working credentials for a
    // pool that can serve nothing.
    let keyBroken = false;
    const f = makeFakes();
    const deps: PoolCacheDeps = {
      ...f.deps,
      loadPools: loaderDeps(
        async () => [d1Row],
        async () => {
          if (keyBroken) throw new Error("cannot open envelope");
          return "token";
        }
      ),
    };

    const first = await getProviderPools(ENV, deps);
    expect(labelsOf(first)).toEqual(["k1"]);

    keyBroken = true;
    f.advance(1_001);
    f.bump();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const stale = await getProviderPools(ENV, deps);
      expect(stale).toBe(first);
      expect(labelsOf(stale)).toEqual(["k1"]);
      expect(stale.hasAnyServable()).toBe(true);
      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/serving stale/i);
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  test("a reload that parks every credential still replaces the snapshot", async () => {
    // The guard above must key on "no envelope opened", never on "nothing is
    // servable": rows the operator disabled do open, so dropping every
    // credential on purpose has to take effect.
    let parked = false;
    const f = makeFakes();
    const deps: PoolCacheDeps = {
      ...f.deps,
      loadPools: loaderDeps(async () => [
        parked ? { ...d1Row, enabled: false } : d1Row,
      ]),
    };

    const first = await getProviderPools(ENV, deps);
    expect(labelsOf(first)).toEqual(["k1"]);

    parked = true;
    f.advance(1_001);
    f.bump();
    const replaced = await getProviderPools(ENV, deps);
    expect(replaced).not.toBe(first);
    expect(replaced.hasAnyServable()).toBe(false);
    // Parked, not forgotten: the row stays visible to readiness.
    expect(labelsOf(replaced)).toEqual(["k1"]);
  });

  test("a cold start that opens no envelope retries instead of pinning", async () => {
    // No previous snapshot to keep, and fixing the secret bumps no
    // config_versions row (it is not D1 state), so an unversioned snapshot is
    // what lets recovery happen at the next window instead of waiting for an
    // unrelated write or an isolate recycle.
    let keyBroken = true;
    const f = makeFakes();
    const deps: PoolCacheDeps = {
      ...f.deps,
      loadPools: loaderDeps(
        async () => [d1Row],
        async () => {
          if (keyBroken) throw new Error("cannot open envelope");
          return "token";
        }
      ),
    };

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const cold = await getProviderPools(ENV, deps);
      // The rows are still named, so the health surface can say "present,
      // not usable" — the state a rejection could not report.
      expect(cold.forProvider("cloudflare")).toBeDefined();
      expect(cold.hasAnyServable()).toBe(false);

      keyBroken = false;
      f.advance(1_001);
      const recovered = await getProviderPools(ENV, deps);
      expect(labelsOf(recovered)).toEqual(["k1"]);
      expect(recovered.hasAnyServable()).toBe(true);
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  test("without an overlay loader the overlay is an empty map", async () => {
    const f = makeFakes();
    const overlay = await getExposureOverlay(ENV, f.deps);
    expect(overlay.size).toBe(0);
  });
});
