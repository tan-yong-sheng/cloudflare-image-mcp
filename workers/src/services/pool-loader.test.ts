// ============================================================================
// Provider pool loading tests - R1b (#72), seam S4 slice F1
// ============================================================================
// Seam: loadProviderPool(env, deps) — injected D1 row reader + envelope
// opener, no D1 wire, no crypto internals. Proves D1 envelopes open with
// the data key into a servable pool; empty D1 falls through to env paths;
// a missing data key warns and falls back instead of throwing (no flag
// day); nothing secret reaches the logs.

import { describe, expect, test, vi } from "vitest";
import { loadProviderPool } from "./pool-loader.js";
import type { PoolRow } from "./pool-source.js";

const ENV = {
  CLOUDFLARE_ACCOUNT_ID: "deploy-account",
  CLOUDFLARE_API_TOKEN: "deploy-token",
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

  test("empty D1 falls through to env paths without needing the data key", async () => {
    const opener = vi.fn();
    const pool = await loadProviderPool(
      {
        CLOUDFLARE_ACCOUNT_ID: "deploy-account",
        CLOUDFLARE_API_TOKEN: "deploy-token",
      } as any,
      { readRows: async () => [], openEnvelope: opener }
    );
    expect(opener).not.toHaveBeenCalled();
    expect(pool.pick()?.accountId).toBe("deploy-account");
  });

  test("D1 rows without a data key warn and fall back, never throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pool = await loadProviderPool(
        {
          CLOUDFLARE_ACCOUNT_ID: "deploy-account",
          CLOUDFLARE_API_TOKEN: "deploy-token",
        } as any,
        { readRows: async () => ROWS, openEnvelope: async () => "x" }
      );
      expect(pool.pick()?.accountId).toBe("deploy-account");
      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/PROVIDER_DATA_KEY/i);
      expect(said).not.toContain("env-1");
    } finally {
      warn.mockRestore();
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
