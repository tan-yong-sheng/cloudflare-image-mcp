// ============================================================================
// Database-only pool resolution tests - ADR-001
// ============================================================================
// Seam: resolvePoolSource(env, db?) — database-only, no fallback.
// D1 rows are the single source of truth. Empty D1 returns empty pool.
// The db parameter is structural (rows in, no D1 wire): production passes
// a D1 reader, tests pass an in-memory double.

import { describe, expect, test, vi } from "vitest";
import { resolvePoolSource } from "./pool-source.js";
import type { PoolRow } from "./pool-source.js";

const MINIMAL_ENV = {} as any;

const D1_ROWS: PoolRow[] = [
  {
    providerId: "cloudflare",
    transport: "cloudflare-rest",
    label: "d1-key",
    accountId: "d1-account",
    envelope: "sealed-envelope",
    weight: 2,
    enabled: true,
  },
];

describe("database-only pool resolution (ADR-001)", () => {
  test("D1 rows return pool with source 'd1'", () => {
    const src = resolvePoolSource(MINIMAL_ENV, () => D1_ROWS);
    expect(src.source).toBe("d1");
    expect(src.keys).toEqual([
      {
        providerId: "cloudflare",
        transport: "cloudflare-rest",
        label: "d1-key",
        accountId: "d1-account",
        envelope: "sealed-envelope",
        weight: 2,
        enabled: true,
      },
    ]);
  });

  test("empty D1 returns empty pool with warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const src = resolvePoolSource(MINIMAL_ENV, () => []);
      expect(src.source).toBe("d1");
      expect(src.keys).toEqual([]);
      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/no credentials configured/i);
      expect(said).toMatch(/admin UI/i);
    } finally {
      warn.mockRestore();
    }
  });

  test("no db reader returns empty pool with warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const src = resolvePoolSource(MINIMAL_ENV);
      expect(src.source).toBe("d1");
      expect(src.keys).toEqual([]);
      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/no credentials configured/i);
    } finally {
      warn.mockRestore();
    }
  });

  test("disabled D1 rows are carried, not dropped", () => {
    const src = resolvePoolSource(MINIMAL_ENV, () => [
      { ...D1_ROWS[0], enabled: false },
    ]);
    expect(src.source).toBe("d1");
    expect(src.keys[0].enabled).toBe(false);
  });

  test("environment variables have no effect (ADR-001)", () => {
    const envWithLegacyVars = {
      CLOUDFLARE_ACCOUNT_ID: "ignored-account",
      CLOUDFLARE_API_TOKEN: "ignored-token",
      AI_ACCOUNTS: JSON.stringify([
        { account_id: "ignored", api_token: "ignored" },
      ]),
    } as any;
    const src = resolvePoolSource(envWithLegacyVars, () => []);
    expect(src.source).toBe("d1");
    expect(src.keys).toEqual([]);
  });
});
