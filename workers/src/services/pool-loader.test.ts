// ============================================================================
// Provider pool loading tests - ADR-001 (database-only), seam S4
// ============================================================================
// Seam: loadProviderPools(env, deps) — injected D1 row reader + envelope
// opener, no D1 wire, no crypto internals. Proves D1 envelopes open with
// the data key into servable per-provider pools; empty D1 returns no pools;
// an unreadable store or a missing data key rejects (so the cache can keep
// serving the previous pools); legacy environment variables have no effect;
// nothing secret reaches the logs.

import { describe, expect, test, vi } from "vitest";
import { loadProviderPools } from "./pool-loader.js";
import type { ProviderPoolEntry } from "./provider-pools.js";
import type { PoolRow } from "./pool-loader.js";

const ENV = {
  PROVIDER_DATA_KEY: "data-key",
} as any;

const ROWS: PoolRow[] = [
  {
    providerId: "cloudflare",
    transport: "cloudflare-rest",
    label: "k1",
    accountId: "a1",
    envelope: "env-1",
    weight: 2,
    enabled: true,
  },
  {
    providerId: "cloudflare",
    transport: "cloudflare-rest",
    label: "k2",
    accountId: "a2",
    envelope: "env-2",
    weight: 1,
    enabled: true,
  },
];

function onlyPools(entries: ProviderPoolEntry[]) {
  expect(entries).toHaveLength(1);
  return entries[0].pool;
}

describe("pool loader (F1)", () => {
  test("D1 rows open into a servable pool", async () => {
    const entries = await loadProviderPools(ENV, {
      readRows: async () => ROWS,
      openEnvelope: async (envelope: string) => `open(${envelope})`,
    });
    const pool = onlyPools(entries);
    expect(pool.labels()).toEqual(["k1", "k2"]);
    const pick = pool.pick();
    expect(pick?.apiToken).toMatch(/^open\(env-[12]\)$/);
  });

  test("each provider gets its own pool and its own transport tag (C4)", async () => {
    // Two providers, two transports: credentials must not share a pool,
    // because cooldown state is per pool and a parked Agnes key must not
    // absorb a Workers AI request.
    const entries = await loadProviderPools(ENV, {
      readRows: async () => [
        ...ROWS,
        {
          providerId: "agnes",
          transport: "openai-compat",
          label: "agnes-1",
          accountId: "",
          envelope: "env-ag",
          weight: 1,
          enabled: true,
        },
      ],
      openEnvelope: async (envelope: string) => `open(${envelope})`,
    });

    expect(entries.map((e) => e.providerId).sort()).toEqual([
      "agnes",
      "cloudflare",
    ]);
    const byId = new Map(entries.map((e) => [e.providerId, e]));
    expect(byId.get("cloudflare")!.transport).toBe("cloudflare-rest");
    expect(byId.get("agnes")!.transport).toBe("openai-compat");
    expect(byId.get("cloudflare")!.pool.labels()).toEqual(["k1", "k2"]);
    expect(byId.get("agnes")!.pool.labels()).toEqual(["agnes-1"]);
  });

  test("empty D1 returns no pools (ADR-001)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const opener = vi.fn();
      const entries = await loadProviderPools(
        { PROVIDER_DATA_KEY: "data-key" } as any,
        { readRows: async () => [], openEnvelope: opener }
      );
      expect(opener).not.toHaveBeenCalled();
      expect(entries).toEqual([]);
      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/no credentials/i);
    } finally {
      warn.mockRestore();
    }
  });

  test("D1 rows without a data key reject with error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const loading = loadProviderPools({} as any, {
        readRows: async () => ROWS,
        openEnvelope: async () => "x",
      });
      // Rejects rather than resolving to no pools: the cache distinguishes
      // "cannot read credentials" from "there are none".
      await expect(loading).rejects.toThrow(/PROVIDER_DATA_KEY/);
      const said = error.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/PROVIDER_DATA_KEY/i);
      expect(said).not.toContain("env-1");
    } finally {
      error.mockRestore();
    }
  });

  test("an unreadable D1 rejects (ADR-001)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const opener = vi.fn();
      const loading = loadProviderPools(ENV, {
        readRows: async () => {
          throw new Error("D1 unavailable");
        },
        openEnvelope: opener,
      });
      await expect(loading).rejects.toThrow(/D1 unavailable/);
      expect(opener).not.toHaveBeenCalled();
      const said = error.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/D1 read failed/i);
    } finally {
      error.mockRestore();
    }
  });

  test("legacy environment variables have no effect (ADR-001)", async () => {
    // The resolver that used to read these is gone. This pins the guarantee
    // on the production path: only D1 rows can produce credentials, so a
    // deployment with old env vars and an empty store stays empty.
    const envWithLegacyVars = {
      PROVIDER_DATA_KEY: "data-key",
      CLOUDFLARE_ACCOUNT_ID: "ignored-account",
      CLOUDFLARE_API_TOKEN: "ignored-token",
      AI_ACCOUNTS: JSON.stringify([
        { account_id: "ignored", api_token: "ignored" },
      ]),
    } as any;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const opener = vi.fn();
      const entries = await loadProviderPools(envWithLegacyVars, {
        readRows: async () => [],
        openEnvelope: opener,
      });
      expect(entries).toEqual([]);
      expect(opener).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("a failing envelope open parks that key via cooldown semantics", async () => {
    const entries = await loadProviderPools(ENV, {
      readRows: async () => ROWS,
      openEnvelope: async (envelope: string) => {
        if (envelope === "env-1") throw new Error("corrupt envelope");
        return "open-env-2";
      },
    });
    // k1 unopenable: only k2 servable.
    const pool = onlyPools(entries);
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
    providerId: "cloudflare",
    transport: "cloudflare-rest",
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

  test("the pools always have source 'd1' (ADR-001)", async () => {
    const fromD1 = await loadProviderPools(minimalEnv, {
      ...deps,
      readRows: async () => [row("k1")],
    });
    expect(onlyPools(fromD1).source).toBe("d1");

    const emptyD1 = await loadProviderPools(minimalEnv, {
      ...deps,
      readRows: async () => [],
    });
    expect(emptyD1).toEqual([]);
  });

  test("a missing data key rejects", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const noKey = { ...minimalEnv, PROVIDER_DATA_KEY: undefined };
      const loading = loadProviderPools(noKey, {
        ...deps,
        readRows: async () => [row("k1")],
      });
      await expect(loading).rejects.toThrow(/PROVIDER_DATA_KEY is not set/i);
      const said = error.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/PROVIDER_DATA_KEY is not set/i);
    } finally {
      error.mockRestore();
    }
  });

  test("all D1 rows unservable returns a pooled provider with warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const entries = await loadProviderPools(minimalEnv, {
        ...deps,
        readRows: async () => [
          row("k1", { enabled: false }),
          row("k2", { weight: 0 }),
        ],
      });
      const pool = onlyPools(entries);
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
