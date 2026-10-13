// ============================================================================
// Provider pool cache tests - R1b (#72), seam S4 slice F2
// ============================================================================
// Seam: getProviderPool(env, deps) — the isolate-scoped cache so the hot
// path stays off D1. Proves boot-load once, version-poll inside a TTL
// window, reload only on config_versions change, stale-serving when the
// version query fails (a D1 blip never takes inference down), and reload
// when no version source exists. Clock, version source, and loader are
// injected — no D1, no timers, no real crypto.

import { beforeEach, describe, expect, test } from "vitest";
import {
  getProviderPool,
  resetPoolCache,
  type PoolCacheDeps,
} from "./pool-cache.js";
import { ProviderPool } from "./provider-pool.js";
import type { Env } from "../types.js";

const ENV = { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t" } as Env;

function makeFakes(ttlMs = 1_000) {
  let version = 1;
  let loads = 0;
  let reads = 0;
  let nowMs = 0;
  return {
    bump: () => ++version,
    advance: (ms: number) => {
      nowMs += ms;
    },
    counts: () => ({ loads, reads }),
    deps: {
      loadPool: async () => {
        loads++;
        const label = `v${version}`;
        return new ProviderPool([
          { label, accountId: "a", apiToken: "t", weight: 1, enabled: true },
        ]);
      },
      readVersion: async (): Promise<number | null> => {
        reads++;
        return version;
      },
      now: () => nowMs,
      ttlMs,
    } satisfies PoolCacheDeps,
  };
}

beforeEach(() => resetPoolCache());

describe("pool cache (F2)", () => {
  test("boot-loads once and serves the cached pool inside the TTL window", async () => {
    const f = makeFakes();
    const first = await getProviderPool(ENV, f.deps);
    const second = await getProviderPool(ENV, f.deps);
    expect(f.counts()).toEqual({ loads: 1, reads: 1 });
    expect(second).toBe(first);
    expect(first.labels()).toEqual(["v1"]);
  });

  test("after the TTL, an unchanged version keeps the cached pool", async () => {
    const f = makeFakes();
    const first = await getProviderPool(ENV, f.deps);
    f.advance(1_001);
    const again = await getProviderPool(ENV, f.deps);
    expect(f.counts()).toEqual({ loads: 1, reads: 2 });
    expect(again).toBe(first);
  });

  test("a version bump after the TTL reloads the pool", async () => {
    const f = makeFakes();
    await getProviderPool(ENV, f.deps);
    f.bump();
    f.advance(1_001);
    const reloaded = await getProviderPool(ENV, f.deps);
    expect(f.counts()).toEqual({ loads: 2, reads: 2 });
    expect(reloaded.labels()).toEqual(["v2"]);
  });

  test("a failing version query serves the stale pool, never throws", async () => {
    const f = makeFakes();
    const first = await getProviderPool(ENV, f.deps);
    f.advance(1_001);
    f.deps.readVersion = async () => {
      throw new Error("D1 unavailable");
    };
    const stale = await getProviderPool(ENV, f.deps);
    expect(stale).toBe(first);
    expect(f.counts().loads).toBe(1);
  });

  test("with no version source, the pool reloads after each TTL window", async () => {
    const f = makeFakes();
    f.deps.readVersion = async () => null;
    const first = await getProviderPool(ENV, f.deps);
    f.advance(1_001);
    const second = await getProviderPool(ENV, f.deps);
    expect(f.counts().loads).toBe(2);
    expect(second).not.toBe(first);
  });
});
