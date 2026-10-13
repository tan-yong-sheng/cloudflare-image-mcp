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
  const envWithBlob = {
    CLOUDFLARE_ACCOUNT_ID: "deploy-account",
    CLOUDFLARE_API_TOKEN: "deploy-token",
    PROVIDER_DATA_KEY: "data-key",
    AI_ACCOUNTS: JSON.stringify([
      { account_id: "blob-account", api_token: "blob-token" },
    ]),
  } as any;
  const bareEnv = {
    CLOUDFLARE_ACCOUNT_ID: "deploy-account",
    CLOUDFLARE_API_TOKEN: "deploy-token",
  } as any;
  const deps = {
    openEnvelope: async (e: string) => `open(${e})`,
  };

  test("the pool records which source actually serves it", async () => {
    const fromD1 = await loadProviderPool(ENV, {
      ...deps,
      readRows: async () => [row("k1")],
    });
    expect(fromD1.source).toBe("d1");

    const fromBlob = await loadProviderPool(envWithBlob, {
      ...deps,
      readRows: async () => [],
    });
    expect(fromBlob.source).toBe("AI_ACCOUNTS");

    const fromBare = await loadProviderPool(bareEnv, {
      ...deps,
      readRows: async () => [],
    });
    expect(fromBare.source).toBe("fallback");
  });

  test("a missing data key keeps the working AI_ACCOUNTS blob", async () => {
    const noKey = { ...envWithBlob, PROVIDER_DATA_KEY: undefined };
    const pool = await loadProviderPool(noKey, {
      ...deps,
      readRows: async () => [row("k1")],
    });
    expect(pool.source).toBe("AI_ACCOUNTS");
    expect(pool.pick()?.accountId).toBe("blob-account");
  });

  test("all D1 rows unservable falls back to env loudly, labels only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pool = await loadProviderPool(envWithBlob, {
        ...deps,
        readRows: async () => [
          row("k1", { enabled: false }),
          row("k2", { weight: 0 }),
        ],
      });
      expect(pool.source).toBe("AI_ACCOUNTS");
      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/none servable/i);
      expect(said).not.toContain("blob-token");
    } finally {
      warn.mockRestore();
    }
  });
});
