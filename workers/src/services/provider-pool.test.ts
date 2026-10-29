// ============================================================================
// Provider pool tests - R1b (#72), seam S3
// ============================================================================
// Seam: pick/reportFailure on the pool. Proves weighted selection, cooldown
// exclusion + recovery, and label-only observability — without transport,
// timers, or D1. Time is injected (a number), so exclusion and recovery
// assert deterministically; randomness is stubbed per-test.

import { describe, expect, test, vi } from "vitest";
import { ProviderPool } from "./provider-pool.js";
import type { PoolKey } from "./provider-pool.js";

const KEYS: PoolKey[] = [
  { label: "heavy", accountId: "a1", apiToken: "t1", weight: 3, enabled: true },
  { label: "light", accountId: "a2", apiToken: "t2", weight: 1, enabled: true },
];

describe("provider pool selection (S3)", () => {
  test("picks proportionally to weight", () => {
    const pool = new ProviderPool(KEYS, { random: () => 0.0 });
    expect(pool.pick()?.label).toBe("heavy");
    const poolHigh = new ProviderPool(KEYS, { random: () => 0.99 });
    expect(poolHigh.pick()?.label).toBe("light");
  });

  test("disabled keys are never picked", () => {
    const pool = new ProviderPool(
      KEYS.map((k) => ({ ...k, enabled: false })),
      { random: () => 0.0 }
    );
    expect(pool.pick()).toBeNull();
  });

  test("zero-weight keys are never picked while others live", () => {
    const pool = new ProviderPool(
      [
        { ...KEYS[0], weight: 0 },
        { ...KEYS[1], weight: 1 },
      ],
      { random: () => 0.0 }
    );
    expect(pool.pick()?.label).toBe("light");
  });

  test("a reported failure parks the key until cooldown ends", () => {
    const pool = new ProviderPool(KEYS, { random: () => 0.0 });
    pool.reportFailure("heavy", 1_000, 1_000);
    expect(pool.pick(1_500)?.label).toBe("light");
    expect(pool.pick(2_000)?.label).toBe("heavy");
  });

  test("timeUntilServable is null when no key is cooling", () => {
    const pool = new ProviderPool(KEYS);
    expect(pool.timeUntilServable(1_000)).toBeNull();
  });

  test("timeUntilServable returns ms until the earliest cooling key recovers", () => {
    const pool = new ProviderPool(KEYS, { random: () => 0.0 });
    pool.reportFailure("heavy", 1_000, 1_000); // cooled until 2_000
    pool.reportFailure("light", 1_000, 2_000); // cooled until 3_000
    // At 1_500: heavy recovers at 2_000 (500ms away), light at 3_000.
    expect(pool.timeUntilServable(1_500)).toBe(500);
    // At 2_500: heavy is back, light recovers at 3_000 (500ms away).
    expect(pool.timeUntilServable(2_500)).toBe(500);
    // At 3_500: both recovered.
    expect(pool.timeUntilServable(3_500)).toBeNull();
  });

  test("timeUntilServable ignores disabled and zero-weight keys", () => {
    const pool = new ProviderPool([
      { ...KEYS[0], enabled: false },
      { ...KEYS[1], weight: 0 },
    ]);
    expect(pool.timeUntilServable(1_000)).toBeNull();
  });

  test("labels() exposes labels only, never secret values", () => {
    const pool = new ProviderPool(KEYS);
    const seen = JSON.stringify(pool.labels());
    expect(seen).not.toContain("t1");
    expect(seen).not.toContain("t2");
    expect(seen).not.toContain("a1");
    expect(seen).not.toContain("a2");
    expect(pool.labels()).toEqual(["heavy", "light"]);
  });

  test("failure of an unknown label warns with the label only", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      new ProviderPool(KEYS).reportFailure("ghost", 0, 1_000);
      const said = warn.mock.calls.map((c) => String(c[0])).join(" ");
      expect(said).toContain("ghost");
      expect(said).not.toContain("t1");
    } finally {
      warn.mockRestore();
    }
  });

  test("entries() returns the enabled servable list for transport wiring", () => {
    const pool = new ProviderPool([
      ...KEYS,
      {
        label: "off",
        accountId: "a3",
        apiToken: "t3",
        weight: 1,
        enabled: false,
      },
      {
        label: "zero",
        accountId: "a4",
        apiToken: "t4",
        weight: 0,
        enabled: true,
      },
    ]);
    expect(pool.entries()).toEqual([
      {
        label: "heavy",
        accountId: "a1",
        apiToken: "t1",
        weight: 3,
        enabled: true,
      },
      {
        label: "light",
        accountId: "a2",
        apiToken: "t2",
        weight: 1,
        enabled: true,
      },
    ]);
  });
});
