// ============================================================================
// Provider admin store tests - R2 (#74), seam S2 (local-D1 harness)
// ============================================================================
// Seam: addProviderKey / rotateProviderKey / disableProviderKey against
// the REAL migrations (freshDb) through a D1-shaped adapter. Expected
// values are literals from the store contract: version numbers,
// audit rows, bumped config. Tokens are synthetic; the crypto round-trip
// (seal here, openEnvelope read-back) proves the stored envelope is
// sealed with the request's key, not just any non-empty string.

import { describe, expect, test } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { freshDb } from "../test-utils/migration-fixtures.js";
import {
  addProviderKey,
  AdminStoreError,
  disableProviderKey,
  rotateProviderKey,
  type AdminD1,
} from "./admin-store.js";
import { openEnvelope, sealToken } from "./provider-crypto.js";

const DATA_KEY = "r2-harness-data-key";
const seal = (token: string) => sealToken(token, DATA_KEY);

/** D1-shaped adapter over node:sqlite (prepare/bind + atomic batch). */
function asD1(db: DatabaseSync): AdminD1 {
  return {
    prepare: (sql: string) => {
      const native = db.prepare(sql);
      const unbound = {
        first: async <T>() => (native.get() ?? null) as T | null,
        all: async <T>() => ({ results: native.all() as T[] }),
        run: async () => {
          const info = native.run();
          return { meta: { changes: Number(info.changes) } };
        },
      };
      return {
        ...unbound,
        bind: (...params: (string | number | bigint | null)[]) => {
          // node:sqlite binds at call time (get/run/all take params),
          // not at prepare time like D1 — capture them here.
          const native = db.prepare(sql);
          return {
            first: async <T>() => (native.get(...params) ?? null) as T | null,
            all: async <T>() => ({ results: native.all(...params) as T[] }),
            run: async () => {
              const info = native.run(...params);
              return { meta: { changes: Number(info.changes) } };
            },
          };
        },
      };
    },
    batch: async (statements) => {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function versionOf(db: DatabaseSync): number {
  return (
    db.prepare("SELECT version FROM config_versions WHERE id = 1").get() as {
      version: number;
    }
  ).version;
}

function auditRows(db: DatabaseSync): {
  actor: string;
  action: string;
  key_label: string;
}[] {
  return db
    .prepare("SELECT actor, action, key_label FROM admin_audit ORDER BY id")
    .all() as { actor: string; action: string; key_label: string }[];
}

describe("admin store against the real migrations (S2)", () => {
  test("add stores a sealed version-1 envelope, bumps config, audits", async () => {
    const db = freshDb();
    const summary = await addProviderKey(asD1(db), seal, {
      providerId: "cloudflare",
      label: "page-key-1",
      apiToken: "cf-token-aaa",
    });
    expect(summary).toEqual({
      id: expect.any(Number),
      label: "page-key-1",
      providerId: "cloudflare",
      activeVersion: 1,
    });

    // The stored envelope opens with the data key to the exact token —
    // sealing happened against THIS request, not a fixture.
    const stored = db
      .prepare("SELECT envelope FROM credential_versions")
      .get() as { envelope: string };
    expect(await openEnvelope(stored.envelope, DATA_KEY)).toBe("cf-token-aaa");

    expect(versionOf(db)).toBe(2);
    expect(auditRows(db)).toEqual([
      { actor: "admin-api", action: "add", key_label: "page-key-1" },
    ]);
  });

  test("add rejects an unknown provider without writing", async () => {
    const db = freshDb();
    await expect(
      addProviderKey(asD1(db), seal, {
        providerId: "nope",
        label: "k",
        apiToken: "t",
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(versionOf(db)).toBe(1);
    expect(auditRows(db)).toEqual([]);
  });

  test("add rejects a duplicate label without bumping", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "dup",
      apiToken: "t1",
    });
    await expect(
      addProviderKey(d1, seal, {
        providerId: "cloudflare",
        label: "dup",
        apiToken: "t2",
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(versionOf(db)).toBe(2);
  });

  test("rotate supersedes: old version revoked, new active, audited", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "rot",
      apiToken: "token-v1",
    });
    const rotated = await rotateProviderKey(d1, seal, added.id, "token-v2");
    expect(rotated.activeVersion).toBe(2);

    const versions = db
      .prepare(
        "SELECT version, revoked_at FROM credential_versions ORDER BY version"
      )
      .all() as { version: number; revoked_at: number | null }[];
    expect(versions).toEqual([
      { version: 1, revoked_at: expect.any(Number) },
      { version: 2, revoked_at: null },
    ]);
    const live = db
      .prepare(
        "SELECT envelope FROM credential_versions WHERE revoked_at IS NULL"
      )
      .get() as { envelope: string };
    expect(await openEnvelope(live.envelope, DATA_KEY)).toBe("token-v2");

    expect(auditRows(db).map((r) => r.action)).toEqual(["add", "rotate"]);
  });

  test("rotate of an unknown key is a 404 with no writes", async () => {
    const db = freshDb();
    await expect(
      rotateProviderKey(asD1(db), seal, 999, "t")
    ).rejects.toMatchObject({ status: 404 });
    expect(versionOf(db)).toBe(1);
  });

  test("disable parks the key, keeps the row, bumps, audits", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "off",
      apiToken: "t",
    });
    const out = await disableProviderKey(d1, added.id);
    expect(out).toEqual({ id: added.id, enabled: false });

    const row = db
      .prepare("SELECT enabled FROM provider_keys WHERE id = ?")
      .get(added.id) as { enabled: number };
    expect(row.enabled).toBe(0);
    expect(auditRows(db).map((r) => r.action)).toEqual(["add", "disable"]);
  });
});
