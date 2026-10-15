// ============================================================================
// Dual-read pool resolution tests - R1b (#72), seam S1
// ============================================================================
// Seam: resolvePoolSource(env, db?) — pure precedence, no transport, no
// crypto. D1 wins when rows exist; AI_ACCOUNTS still works but warns
// (deprecation); bootstrap deploy credentials are the last fallback.
// The db parameter is structural (rows in, no D1 wire): production passes
// a D1 reader, tests pass an in-memory double.

import { describe, expect, test, vi } from "vitest";
import { resolvePoolSource } from "./pool-source.js";
import type { PoolRow } from "./pool-source.js";

const FALLBACK_ENV = {
  CLOUDFLARE_ACCOUNT_ID: "deploy-account",
  CLOUDFLARE_API_TOKEN: "deploy-token",
} as any;

const D1_ROWS: PoolRow[] = [
  {
    label: "d1-key",
    accountId: "d1-account",
    envelope: "sealed-envelope",
    weight: 2,
    enabled: true,
  },
];

describe("pool source precedence (S1)", () => {
  test("D1 rows win when present", () => {
    const src = resolvePoolSource(FALLBACK_ENV, () => D1_ROWS);
    expect(src.source).toBe("d1");
    expect(src.keys).toEqual([
      {
        label: "d1-key",
        accountId: "d1-account",
        envelope: "sealed-envelope",
        weight: 2,
        enabled: true,
      },
    ]);
  });

  test("empty D1 falls through to AI_ACCOUNTS with a deprecation warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const src = resolvePoolSource(
        {
          ...FALLBACK_ENV,
          AI_ACCOUNTS: JSON.stringify([
            { account_id: "blob-account", api_token: "blob-token" },
          ]),
        },
        () => []
      );
      expect(src.source).toBe("AI_ACCOUNTS");
      expect(src.keys).toEqual([
        {
          label: "AI_ACCOUNTS[0]",
          accountId: "blob-account",
          apiToken: "blob-token",
          weight: 1,
          enabled: true,
        },
      ]);
      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toMatch(/deprecat/i);
      expect(said).not.toContain("blob-token");
    } finally {
      warn.mockRestore();
    }
  });

  test("no D1 and no blob falls back to deploy credentials", () => {
    const src = resolvePoolSource(FALLBACK_ENV, () => []);
    expect(src.source).toBe("fallback");
    expect(src.keys).toEqual([
      {
        label: "fallback deploy credential",
        accountId: "deploy-account",
        apiToken: "deploy-token",
        weight: 1,
        enabled: true,
      },
    ]);
  });

  test("no db reader behaves like empty D1", () => {
    const src = resolvePoolSource(FALLBACK_ENV);
    expect(src.source).toBe("fallback");
  });

  test("disabled D1 rows are carried, not dropped", () => {
    const src = resolvePoolSource(FALLBACK_ENV, () => [
      { ...D1_ROWS[0], enabled: false },
    ]);
    expect(src.source).toBe("d1");
    expect(src.keys[0].enabled).toBe(false);
  });
});
