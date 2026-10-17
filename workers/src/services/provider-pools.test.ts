// ============================================================================
// Provider credential view tests (C4)
// ============================================================================
// Seam: ProviderPools — the per-provider split that readiness, the admin
// health map, and transport routing all read. The property under test is
// that "servable" and "routable" are the same predicate on the same object,
// so the UI warning can never disagree with what generation picks.

import { describe, expect, test } from "vitest";
import { ProviderPools } from "./provider-pools.js";
import { ProviderPool } from "./provider-pool.js";

function poolFor(...labels: string[]): ProviderPool {
  return new ProviderPool(
    labels.map((label) => ({
      label,
      accountId: `a-${label}`,
      apiToken: `t-${label}`,
      weight: 1,
      enabled: true,
    })),
    { source: "d1" }
  );
}

describe("provider pools", () => {
  test("readiness is reported per provider", () => {
    const pools = new ProviderPools([
      {
        providerId: "cloudflare",
        transport: "cloudflare-rest",
        pool: poolFor("k1"),
      },
      // A provider whose every row is parked: present, not servable. The
      // distinction matters — "no rows" and "rows that cannot be used" need
      // different operator actions.
      {
        providerId: "agnes",
        transport: "openai-compat",
        pool: new ProviderPool(
          [
            {
              label: "k2",
              accountId: "a",
              apiToken: "",
              weight: 0,
              enabled: false,
            },
          ],
          { source: "d1" }
        ),
      },
    ]);

    expect(pools.readiness()).toEqual({ cloudflare: true, agnes: false });
    expect(pools.hasAnyServable()).toBe(true);
    // Routing reads the same predicate: a provider whose keys are all parked
    // is present in readiness (the UI must show it) but not routable, so a
    // request can never reach a pool health calls unusable.
    expect(pools.forTransport("cloudflare-rest")).toBeDefined();
    expect(pools.forTransport("openai-compat")).toBeUndefined();
    expect(pools.forProvider("agnes")).toBeDefined();
  });

  test("no pools at all is not servable", () => {
    const pools = new ProviderPools([]);
    expect(pools.hasAnyServable()).toBe(false);
    expect(pools.forProvider("cloudflare")).toBeUndefined();
    expect(pools.forTransport("cloudflare-rest")).toBeUndefined();
  });

  test("a transport resolves to its provider's pool by identity", () => {
    const cf = poolFor("k1");
    const pools = new ProviderPools([
      { providerId: "cloudflare", transport: "cloudflare-rest", pool: cf },
    ]);
    // Identity, not a copy: cooldowns live on the isolate-cached instance,
    // so handing the transport a fresh pool would silently stop parking
    // keys that just failed.
    expect(pools.forTransport("cloudflare-rest")).toBe(cf);
    expect(pools.forProvider("cloudflare")).toBe(cf);
  });

  test("two providers on one transport are merged once and memoized", () => {
    const pools = new ProviderPools([
      { providerId: "cf-a", transport: "cloudflare-rest", pool: poolFor("k1") },
      { providerId: "cf-b", transport: "cloudflare-rest", pool: poolFor("k2") },
    ]);

    const merged = pools.forTransport("cloudflare-rest")!;
    expect(merged.labels().sort()).toEqual(["k1", "k2"]);
    expect(pools.forTransport("cloudflare-rest")).toBe(merged);
    // The per-provider split is untouched by the merge.
    expect(pools.forProvider("cf-a")!.labels()).toEqual(["k1"]);
    expect(pools.readiness()).toEqual({ "cf-a": true, "cf-b": true });
  });

  test("a transport naming only parked providers is not routable", () => {
    const parked = new ProviderPool(
      [
        {
          label: "k1",
          accountId: "a",
          apiToken: "",
          weight: 0,
          enabled: false,
        },
      ],
      { source: "d1" }
    );
    const pools = new ProviderPools([
      { providerId: "cf-a", transport: "cloudflare-rest", pool: parked },
      { providerId: "cf-b", transport: "cloudflare-rest", pool: poolFor("k2") },
    ]);
    // Merging must not resurrect a parked provider's key, and the servable
    // one must still resolve — by identity, since it is the only match.
    const resolved = pools.forTransport("cloudflare-rest")!;
    expect(resolved.labels()).toEqual(["k2"]);
    expect(pools.forProvider("cf-b")).toBe(resolved);
  });

  test("openedNoRow is the broken-key signature, not 'nothing servable'", () => {
    // The cache reads this to decide whether a reload may replace a working
    // snapshot, so it must fire on the one case nothing can be served
    // *because the key is wrong* and stay quiet when the operator meant it.
    const parked = (label: string) =>
      new ProviderPool(
        [{ label, accountId: "a", apiToken: "", weight: 0, enabled: false }],
        { source: "d1" }
      );

    // Every row failed to open: AES-GCM cannot tell a wrong data key from
    // corruption, and all rows failing at once is that signature.
    const nothingOpened = new ProviderPools([
      {
        providerId: "cloudflare",
        transport: "cloudflare-rest",
        pool: parked("k1"),
        unopenableRows: 1,
      },
    ]);
    expect(nothingOpened.openedNoRow()).toBe(true);

    // Same shape, different cause: these rows opened and the operator
    // parked them, so readiness must keep reporting the operator's intent.
    const parkedByOperator = new ProviderPools([
      {
        providerId: "cloudflare",
        transport: "cloudflare-rest",
        pool: parked("k1"),
      },
    ]);
    expect(parkedByOperator.openedNoRow()).toBe(false);

    // One row opened, one did not: a partial failure is not the all-at-once
    // signature, so the policy that emptied the servable set still lands.
    const partial = new ProviderPools([
      {
        providerId: "cloudflare",
        transport: "cloudflare-rest",
        pool: parked("k1"),
        unopenableRows: 1,
      },
      {
        providerId: "agnes",
        transport: "openai-compat",
        pool: parked("k2"),
      },
    ]);
    expect(partial.openedNoRow()).toBe(false);

    // No rows at all is an empty store, not a broken key.
    expect(new ProviderPools([]).openedNoRow()).toBe(false);
  });
});
