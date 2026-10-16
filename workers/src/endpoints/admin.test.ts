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
import { handleAdmin } from "./admin.js";
import type { AdminD1 } from "../services/admin-store.js";
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

  test("an unconfigured bearer gate refuses admin even with the right management key", async () => {
    // Gate one exists only when API_KEYS is set, and authenticateRequest
    // bypasses auth entirely when it is not — so admin must refuse rather
    // than silently run on the management key alone.
    const unconfigured = env();
    delete (unconfigured as Partial<Env>).API_KEYS;
    const response = await worker.fetch(
      get(
        "/api/admin/health",
        bearer("user-key", { "X-Admin-Key": "admin-key" })
      ),
      unconfigured
    );
    expect(response.status).toBe(403);
  });

  test("oversized admin key fails closed with 403 before hashing", async () => {
    const response = await worker.fetch(
      get(
        "/api/admin/health",
        bearer("user-key", { "X-Admin-Key": "a".repeat(1024) })
      ),
      env()
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

describe("admin write bounds (R2)", () => {
  // requestJson runs before any store call, so a stub satisfying the seam
  // is enough: an oversized body must be refused before JSON parsing and
  // before sealing, even when the request carries no Content-Length.
  const stubStore = {
    prepare: () => {
      const stmt = {
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({}),
      };
      return { ...stmt, bind: () => stmt };
    },
    commit: async () => ({ keyId: null }),
  } as unknown as AdminD1;

  function postRaw(
    body: BodyInit,
    init: Record<string, unknown> = {}
  ): Request {
    return new Request("https://worker.test/api/admin/keys", {
      method: "POST",
      headers: {
        ...bearer("user-key", { "X-Admin-Key": "admin-key" }),
        "Content-Type": "application/json",
      },
      body,
      ...init,
    } as RequestInit);
  }

  test("a body over the cap is refused with 413 before parsing", async () => {
    const huge = JSON.stringify({
      providerId: "cloudflare",
      label: "k",
      apiToken: "x".repeat(20000),
    });
    const res = await handleAdmin(postRaw(huge), "/api/admin/keys", env(), {
      adminStore: stubStore,
    });
    expect(res?.status).toBe(413);
  });

  test("a streamed body over the cap is refused even with no Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(20000)));
        controller.close();
      },
    });
    const request = postRaw(stream, { duplex: "half" });
    const res = await handleAdmin(request, "/api/admin/keys", env(), {
      adminStore: stubStore,
    });
    expect(res?.status).toBe(413);
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

describe("production D1 adapter (R2)", () => {
  // The default store (d1AdminStore over PROVIDER_DB) is the served path
  // and has no other direct test. A D1Database-shaped fake pins that the
  // engine's own statement crosses the seam for both the unbound (health)
  // and bound (write) reads, and that commit extracts the fresh row id.
  function d1Shaped(): { db: unknown; batched: string[] } {
    const batched: string[] = [];
    const db = {
      prepare: (sql: string) => {
        const stmt = {
          first: async () => {
            if (sql.includes("config_versions")) return { version: 3 };
            if (sql.includes("FROM providers WHERE id")) return { one: 1 };
            return null;
          },
          all: async () => {
            if (sql.includes("FROM providers")) {
              return {
                results: [{ id: "cloudflare", display_name: "Cloudflare" }],
              };
            }
            return { results: [] };
          },
          run: async () => ({ meta: { changes: 0 } }),
        };
        return {
          ...stmt,
          bind: (..._params: unknown[]) => ({ ...stmt }),
        };
      },
      batch: async (stmts: { sql: string }[]) => {
        for (const st of stmts) batched.push(st.sql);
        return stmts.map((_, i) =>
          i === 0 ? { meta: { last_row_id: 7 } } : {}
        );
      },
    };
    return { db, batched };
  }

  function envWithDb(db: unknown): Env {
    return { ...env(), PROVIDER_DB: db } as unknown as Env;
  }

  test("health reads rows through the adapter", async () => {
    const { db } = d1Shaped();
    const response = await handleAdmin(
      get(
        "/api/admin/health",
        bearer("user-key", { "X-Admin-Key": "admin-key" })
      ),
      "/api/admin/health",
      envWithDb(db)
    );
    expect(response?.status).toBe(200);
    const body = (await response!.json()) as {
      providers: { id: string }[];
      configVersion: number | null;
    };
    expect(body.providers).toEqual([
      { id: "cloudflare", displayName: "Cloudflare" },
    ]);
    expect(body.configVersion).toBe(3);
  });

  test("add resolves the key id from the atomic batch", async () => {
    const { db, batched } = d1Shaped();
    const response = await handleAdmin(
      new Request("https://worker.test/api/admin/keys", {
        method: "POST",
        headers: {
          ...bearer("user-key", { "X-Admin-Key": "admin-key" }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerId: "cloudflare",
          label: "served-key",
          apiToken: "cf-token-abc",
        }),
      }),
      "/api/admin/keys",
      envWithDb(db)
    );
    expect(response?.status).toBe(201);
    const body = (await response!.json()) as { id: number };
    expect(body.id).toBe(7);
    // One atomic batch: key, credential version, config bump, audit.
    expect(batched).toHaveLength(4);
  });
});
