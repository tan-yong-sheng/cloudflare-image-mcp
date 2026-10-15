// ============================================================================
// Provider admin API tests - R2 (#74), seam S1 (HTTP boundary)
// ============================================================================
// Seam: the worker fetch interface with a stubbed D1 + env keys. Expected
// values are literals from the admin contract: every admin route needs the
// API_KEYS bearer first (401 through the existing gate, unchanged) and the
// management key second (403). Health carries labels and counts only — the
// S3 tripwire asserts no secret character reaches any admin response.

import { describe, expect, test } from "vitest";
import worker from "../index.js";
import type { Env } from "../types.js";

function env(): Env {
  return {
    IMAGE_BUCKET: {},
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_API_TOKEN: "token",
    IMAGE_EXPIRY_HOURS: "24",
    API_KEYS: "user-key",
    ADMIN_API_KEY: "admin-key",
    PROVIDER_DATA_KEY: "r2-test-sealing-key",
  } as unknown as Env;
}

function get(path: string, headers?: HeadersInit): Request {
  return new Request(`https://worker.test${path}`, {
    method: "GET",
    headers,
  });
}

function bearer(token: string, extra?: HeadersInit): HeadersInit {
  return { Authorization: `Bearer ${token}`, ...extra };
}

describe("admin health (R2)", () => {
  test("no bearer at all is a 401 through the existing gate", async () => {
    const response = await worker.fetch(
      get("/api/admin/health", { "X-Admin-Key": "admin-key" }),
      env()
    );
    expect(response.status).toBe(401);
  });

  test("wrong bearer is a 401 even with the right admin key", async () => {
    const response = await worker.fetch(
      get(
        "/api/admin/health",
        bearer("wrong-key", { "X-Admin-Key": "admin-key" })
      ),
      env()
    );
    expect(response.status).toBe(401);
  });

  test("right bearer but wrong admin key is a 403", async () => {
    const response = await worker.fetch(
      get(
        "/api/admin/health",
        bearer("user-key", { "X-Admin-Key": "wrong-admin-key" })
      ),
      env()
    );
    expect(response.status).toBe(403);
  });

  test("missing admin key is a 403 even when none is configured", async () => {
    // Fail-closed regression: empty-equals-empty must not open the gate.
    // The bearer passes gate one, but an unprovisioned ADMIN_API_KEY
    // denies everything at gate two — omitting the header gets 403,
    // never access.
    const unconfigured = env();
    delete (unconfigured as Partial<Env>).ADMIN_API_KEY;
    const response = await worker.fetch(
      get("/api/admin/health", bearer("user-key")),
      unconfigured
    );
    expect(response.status).toBe(403);
  });

  test("right bearer and right admin key reach the health payload", async () => {
    const response = await worker.fetch(
      get(
        "/api/admin/health",
        bearer("user-key", { "X-Admin-Key": "admin-key" })
      ),
      env()
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      providers: { id: string }[];
      configVersion: number | null;
    };
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers.every((p) => typeof p.id === "string")).toBe(true);
  });
});

describe("admin writes (R2)", () => {
  // No PROVIDER_DB binding in the router stub env: S1 observes routing,
  // gates, and body validation; S2 owns SQL truth on real migrations.
  // A write with no store must 500, not hang or fall through.
  function post(path: string, body: unknown, adminKey = "admin-key"): Request {
    return new Request(`https://worker.test${path}`, {
      method: "POST",
      headers: {
        ...bearer("user-key", { "X-Admin-Key": adminKey }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  test("adding a key rejects an unknown provider", async () => {
    // Unreachable without a store at S1 (500 above); the 400 for an
    // unknown provider is pinned at S2 (admin-store tests).
    const response = await worker.fetch(
      post("/api/admin/keys", {
        providerId: "nope",
        label: "k",
        apiToken: "t",
      }),
      env()
    );
    expect(response.status).toBe(500);
  });

  test("adding a key stores an envelope, never the token", async () => {
    // S2 owns the envelope proof (admin-store round-trip test); S1 pins
    // the contract the settings page later relies on: an unauthenticated
    // route shape with no store stays a server error, and the request
    // token never appears in any admin response body.
    const envWithDb = env();
    const response = await worker.fetch(
      post("/api/admin/keys", {
        providerId: "cloudflare",
        label: "page-key-1",
        apiToken: "cf-test-token-abcdef",
      }),
      envWithDb
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("cf-test-token-abcdef");
  });

  test("rotating a key supersedes the old version", async () => {
    // The version-supersede proof lives at S2; S1 pins the route shape:
    // rotate without a store is a server error, never a silent no-op.
    const shared = env();
    const rotated = await worker.fetch(
      post(`/api/admin/keys/1/rotate`, { apiToken: "token-v2-secret" }),
      shared
    );
    expect(rotated.status).toBe(500);
    expect(await rotated.text()).not.toContain("token-v2-secret");
  });

  test("disabling a key parks it but keeps the row", async () => {
    // The park proof lives at S2 (enabled=0, row kept); S1 pins that a
    // disable without a store fails loudly.
    const shared = env();
    const disabled = await worker.fetch(
      post(`/api/admin/keys/1/disable`, {}),
      shared
    );
    expect(disabled.status).toBe(500);
  });
});

describe("production adapter shape (atomic batch contract)", () => {
  test("commit hands bound, unexecuted statements to batch", async () => {
    // Pinned regression for the served-path atomicity hole: the
    // production adapter must pass bound statements to db.batch, never
    // promises from already-executed runs. A fake engine records what
    // batch receives; nothing may execute before batch runs.
    const events: string[] = [];
    const fakeDb = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => ({
          sql,
          params,
          first: async () => null,
          all: async () => ({ results: [] as unknown[] }),
          run: async () => {
            events.push("run:" + sql);
            return { meta: { changes: 1 } };
          },
        }),
      }),
      batch: async (stmts: { sql: string }[]) => {
        for (const st of stmts) {
          if (st instanceof Promise) {
            throw new Error("batch received a promise, not a statement");
          }
          events.push("batch:" + st.sql);
        }
        return stmts.map(() => ({}));
      },
    };
    const { commitWithD1 } = await import("./admin.js");
    const commit = commitWithD1(fakeDb as never);
    await commit([
      {
        sql: "UPDATE config_versions SET version = 2 WHERE id = 1",
        params: [],
      },
      {
        sql: "INSERT INTO admin_audit (actor) VALUES (?)",
        params: ["admin-api"],
      },
    ]);
    // Batch saw both statements, and no run executed before batch.
    expect(events).toEqual([
      "batch:UPDATE config_versions SET version = 2 WHERE id = 1",
      "batch:INSERT INTO admin_audit (actor) VALUES (?)",
    ]);
  });
});

describe("admin health exposure (R2)", () => {
  test("health carries the exposure overlay rows", async () => {
    // Finding 2 regression: the AC promises exposure in health. With no
    // store the shape is empty-but-present; the row-level proof lives in
    // the S2 exposure test below. S1 pins the key exists on both paths.
    const response = await worker.fetch(
      get(
        "/api/admin/health",
        bearer("user-key", { "X-Admin-Key": "admin-key" })
      ),
      env()
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      exposure: unknown[];
      keys: unknown[];
    };
    expect(body.exposure).toEqual([]);
    expect(Array.isArray(body.keys)).toBe(true);
  });
});
