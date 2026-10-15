// ============================================================================
// Pool cache production-query tests - R1b (#72), seam S5 (local-D1 harness)
// ============================================================================
// The cache tests inject loaders; nothing here is injected. This file runs
// the REAL production queries (productionDeps in pool-cache.ts) against the
// actual 0001 migration applied by the local-D1 harness (node:sqlite, FK
// pragma on, matching D1), through a thin D1-shaped adapter. Tokens round-
// trip the whole vertical: sealed -> rotateKey ledger insert -> loadPool
// JOIN -> openEnvelope, with revoked versions excluded. Also pins the
// seconds-vs-ms conversion rule: every timestamp the ledger/schema writes
// is unixepoch() SECONDS, while pool cooldown clocks are milliseconds — a
// consumer mixing the two must convert explicitly.

import { describe, expect, test } from "vitest";
import { freshDb } from "../test-utils/migration-fixtures.js";
import { productionDeps } from "./pool-cache.js";
import { rotateKey } from "./ledger.js";
import { sealToken } from "./provider-crypto.js";
import type { Env } from "../types.js";
import type { DatabaseSync } from "node:sqlite";

const DATA_KEY = "s5-harness-data-key";
const TOKEN_V1 = "token-secret-v1";
const TOKEN_V2 = "token-secret-v2";

/** D1Database-shaped view over the harness DB (no-param queries only). */
function asD1(db: DatabaseSync): Env["PROVIDER_DB"] {
  return {
    prepare: (sql: string) => ({
      first: async () => db.prepare(sql).get() ?? null,
      all: async () => ({ results: db.prepare(sql).all() }),
    }),
  } as unknown as Env["PROVIDER_DB"];
}

function harnessEnv(db: DatabaseSync): Env {
  return {
    CLOUDFLARE_ACCOUNT_ID: "deploy-account",
    CLOUDFLARE_API_TOKEN: "deploy-token",
    PROVIDER_DATA_KEY: DATA_KEY,
    PROVIDER_DB: asD1(db),
  } as unknown as Env;
}

function seedKeyWithRotation(
  db: DatabaseSync,
  label: string,
  envelopes: string[]
): number {
  db.exec(
    `INSERT INTO provider_keys (provider_id, label) VALUES ('cloudflare', '${label}')`
  );
  const kid = (
    db.prepare("SELECT id FROM provider_keys WHERE label = ?").get(label) as {
      id: number;
    }
  ).id;
  for (const envelope of envelopes) {
    rotateKey(db, { keyId: kid, envelope, actor: "s5-test" });
  }
  return kid;
}

describe("production queries against the real migration (S5)", () => {
  test("readVersion returns the seeded singleton version", async () => {
    const deps = productionDeps(harnessEnv(freshDb()));
    expect(await deps.readVersion()).toBe(1);
  });

  test("loadPool serves only active versions and opens them end-to-end", async () => {
    const db = freshDb();
    const envV1 = await sealToken(TOKEN_V1, DATA_KEY);
    const envV2 = await sealToken(TOKEN_V2, DATA_KEY);
    seedKeyWithRotation(db, "k1", [envV1, envV2]);
    seedKeyWithRotation(db, "k2", [await sealToken("token-k2", DATA_KEY)]);

    const pool = await productionDeps(harnessEnv(db)).loadPool();
    const entries = pool.entries();
    expect(entries.map((e) => e.label).sort()).toEqual(["k1", "k2"]);

    const k1 = entries.find((e) => e.label === "k1")!;
    // The JOIN excludes revoked versions and loadPool opens envelopes:
    // k1 serves plaintext v2, never the revoked v1.
    expect(k1.apiToken).toBe(TOKEN_V2);
  });

  test("loadOverlay groups excluded scopes under their model rows", async () => {
    const db = freshDb();
    db.exec(
      `INSERT INTO exposure_overrides (model_id, enabled, alias, is_default, updated_by)
       VALUES ('@cf/model-a', 0, 'short-a', 1, 's5'),
              ('@cf/model-b', 1, NULL, 0, 's5')`
    );
    db.exec(
      `INSERT INTO excluded_scopes (model_id, scope)
       VALUES ('@cf/model-a', 's1'), ('@cf/model-a', 's2'), ('@cf/model-b', 's3')`
    );

    const overlay = await productionDeps(harnessEnv(db)).loadOverlay!();
    expect(overlay.get("@cf/model-a")).toEqual({
      enabled: false,
      alias: "short-a",
      isDefault: true,
      excludedScopes: ["s1", "s2"],
    });
    expect(overlay.get("@cf/model-b")).toEqual({
      enabled: true,
      alias: null,
      isDefault: false,
      excludedScopes: ["s3"],
    });
  });

  // Seconds-vs-ms conversion rule (arch-review note): schema defaults are
  // unixepoch() SECONDS. Pool cooldown clocks use milliseconds. Mixing the
  // scales silently corrupts comparisons (a ms timestamp reads as "far
  // future" against a seconds column), so the ledger surface is pinned to
  // seconds here; any consumer comparing it with Date.now() must divide.
  test("ledger timestamps are unixepoch() seconds, never ms", () => {
    const db = freshDb();
    const kid = seedKeyWithRotation(db, "k1", ["env-v1"]);
    const row = db
      .prepare(
        "SELECT created_at, revoked_at FROM credential_versions WHERE provider_key_id = ?"
      )
      .get(kid) as { created_at: number; revoked_at: number | null };

    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(row.created_at).toBeGreaterThan(nowSeconds - 60);
    expect(row.created_at).toBeLessThanOrEqual(nowSeconds);
    expect(row.revoked_at).toBeNull();
  });
});
