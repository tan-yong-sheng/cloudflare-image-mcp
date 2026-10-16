// ============================================================================
// Provider pool loading tests - ADR-001 (database-only), seam S4
// ============================================================================
// Seam: loadProviderPool(env, deps) — injected D1 row reader + envelope
// opener, no D1 wire, no crypto internals. Proves D1 envelopes open with
// the data key into a servable pool; empty D1 returns empty pool;
// a missing data key errors and returns empty pool; an unreadable store
// returns empty pool; nothing secret reaches the logs.

import { describe, expect, test, vi } from "vitest";
import { loadProviderPool } from "./pool-loader.js";
import type { PoolRow } from "./pool-source.js";

const ENV = {
  PROVIDER_DATA_KEY: "data-key",
} as any;

const ROWS: PoolRow[] = [
  { label: "k1", accountId: "a1", envelope: "env-1", weight: 2, enabled: true },
  { label: "k2", accountId: "a2", envelope: "env-2", weight: 1, enabled: true },
];

describe("pool loader (F1)", () => {
  test("D1 rows open into a servable pool", async () => {
    const pool = await loadProviderPool(ENV, {
      readRows: async () => ROWS,
      openEnvelope: async (envelope: string) => `open(${envelope})`,
    });
    expect(pool.labels()).toEqual(["k1", "k2"]);
    const pick = pool.pick();
    expect(pick?.apiToken).toMatch(/^open\(env-[12]\)$/);
  });

  test("empty D1 returns empty pool (ADR-001)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const opener = vi.fn();
      const pool = await loadProviderPool(
        { PROVIDER_DATA_KEY: "data-key" } as any,
        { readRows: async () => [], openEnvelope: opener }
      );
      expect(opener).not.toHaveBeenCalled();
      expect(pool.pick()).toBeNull();
      expect(pool.source).toBe("d1");
      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/no credentials/i);
    } finally {
      warn.mockRestore();
    }
  });

  test("D1 rows without a data key return empty pool with error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const pool = await loadProviderPool({} as any, {
        readRows: async () => ROWS,
        openEnvelope: async () => "x",
      });
      expect(pool.pick()).toBeNull();
      expect(pool.source).toBe("d1");
      const said = error.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/PROVIDER_DATA_KEY/i);
      expect(said).not.toContain("env-1");
    } finally {
      error.mockRestore();
    }
  });

  test("an unreadable D1 returns empty pool (ADR-001)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const opener = vi.fn();
      const pool = await loadProviderPool(ENV, {
        readRows: async () => {
          throw new Error("D1 unavailable");
        },
        openEnvelope: opener,
      });
      expect(opener).not.toHaveBeenCalled();
      expect(pool.pick()).toBeNull();
      expect(pool.source).toBe("d1");
      const said = error.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/D1 read failed/i);
    } finally {
      error.mockRestore();
    }
  });

  test("a failing envelope open parks that key via cooldown semantics", async () => {
    const pool = await loadProviderPool(ENV, {
      readRows: async () => ROWS,
      openEnvelope: async (envelope: string) => {
        if (envelope === "env-1") throw new Error("corrupt envelope");
        return "open-env-2";
      },
    });
    // k1 unopenable: only k2 servable.
    for (let i = 0; i < 10; i++) {
      expect(pool.pick()?.label).toBe("k2");
    }
  });
});

// Spec-review fixes (#72): the pool must report which source ACTUALLY
// serves it — index.ts always passes a pool, so a hardcoded "d1" tag would
// make the runbook's verification log positive even when the loader fell
// back to env credentials (false staging evidence).
describe("loader source truth", () => {
  const row = (label: string, over: Partial<PoolRow> = {}): PoolRow => ({
    label,
    accountId: `a-${label}`,
    envelope: `env-${label}`,
    weight: 1,
    enabled: true,
    ...over,
  });
  const minimalEnv = {
    PROVIDER_DATA_KEY: "data-key",
  } as any;
  const deps = {
    openEnvelope: async (e: string) => `open(${e})`,
  };

  test("the pool always has source 'd1' (ADR-001)", async () => {
    const fromD1 = await loadProviderPool(minimalEnv, {
      ...deps,
      readRows: async () => [row("k1")],
    });
    expect(fromD1.source).toBe("d1");

    const emptyD1 = await loadProviderPool(minimalEnv, {
      ...deps,
      readRows: async () => [],
    });
    expect(emptyD1.source).toBe("d1");
    expect(emptyD1.pick()).toBeNull();
  });

  test("a missing data key returns empty pool with error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const noKey = { ...minimalEnv, PROVIDER_DATA_KEY: undefined };
      const pool = await loadProviderPool(noKey, {
        ...deps,
        readRows: async () => [row("k1")],
      });
      expect(pool.source).toBe("d1");
      expect(pool.pick()).toBeNull();
      const said = error.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/PROVIDER_DATA_KEY is not set/i);
    } finally {
      error.mockRestore();
    }
  });

  test("all D1 rows unservable returns empty pool with warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pool = await loadProviderPool(minimalEnv, {
        ...deps,
        readRows: async () => [
          row("k1", { enabled: false }),
          row("k2", { weight: 0 }),
        ],
      });
      expect(pool.source).toBe("d1");
      expect(pool.pick()).toBeNull();
      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/none servable/i);
      expect(said).toMatch(/admin UI/i);
    } finally {
      warn.mockRestore();
    }
  });
});
