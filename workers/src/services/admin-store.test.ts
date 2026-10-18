// ============================================================================
// Provider admin store tests - R2 (#74), seam S2 (local-D1 harness)
// ============================================================================
// Seam: addProviderKey / rotateProviderKey / disableProviderKey against
// the REAL migrations (freshDb) through a D1-shaped adapter. Expected
// values are literals from the store contract: version numbers,
// audit rows, bumped config. Tokens are synthetic; the crypto round-trip
// (seal here, openEnvelope read-back) proves the stored envelope is
// sealed with the request's key, not just any non-empty string.

import type { AdminWrite } from "./admin-store.js";
import { describe, expect, test } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { freshDb } from "../test-utils/migration-fixtures.js";
import {
  addProviderKey,
  AdminStoreError,
  deleteProviderKey,
  disableProviderKey,
  getAdminHealth,
  MAX_WEIGHT,
  rotateProviderKey,
  updateProviderKey,
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
    commit: async (rawWrites) => {
      const writes = rawWrites as { sql: string; params: readonly unknown[] }[];
      db.exec("BEGIN");
      let keyId: number | null = null;
      try {
        for (let i = 0; i < writes.length; i++) {
          const info = db
            .prepare(writes[i].sql)
            .run(...(writes[i].params as (string | number | bigint | null)[]));
          if (i === 0) {
            const lri = info.lastInsertRowid;
            keyId = typeof lri === "bigint" ? Number(lri) : lri;
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return { keyId };
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
  key_id: number | null;
}[] {
  return db
    .prepare(
      "SELECT actor, action, key_label, key_id FROM admin_audit ORDER BY id"
    )
    .all() as {
    actor: string;
    action: string;
    key_label: string;
    key_id: number | null;
  }[];
}

describe("admin store against the real migrations (S2)", () => {
  test("add stores a sealed version-1 envelope, bumps config, audits", async () => {
    const db = freshDb();
    const summary = await addProviderKey(asD1(db), seal, {
      providerId: "cloudflare",
      label: "page-key-1",
      apiToken: "cf-token-aaa",
      accountId: "acct-1",
    });
    expect(summary).toEqual({
      id: expect.any(Number),
      label: "page-key-1",
      providerId: "cloudflare",
      activeVersion: 1,
    });
    // The id is resolved inside the atomic commit (no post-commit read):
    // it must equal the actual provider_keys row id.
    const keyRow = db
      .prepare("SELECT id FROM provider_keys WHERE label = 'page-key-1'")
      .get() as { id: number };
    expect(summary.id).toBe(keyRow.id);

    // The stored envelope opens with the data key to the exact token —
    // sealing happened against THIS request, not a fixture.
    // Atomic batch binds the subselected id: the audit row names the key it created.
    const stored = db
      .prepare("SELECT envelope FROM credential_versions")
      .get() as { envelope: string };
    expect(await openEnvelope(stored.envelope, DATA_KEY)).toBe("cf-token-aaa");

    expect(versionOf(db)).toBe(2);
    expect(auditRows(db)).toEqual([
      {
        actor: "admin-api",
        action: "add",
        key_label: "page-key-1",
        key_id: summary.id,
      },
    ]);
  });

  test("add rejects a token over the seal bound without writing", async () => {
    const db = freshDb();
    await expect(
      addProviderKey(asD1(db), seal, {
        providerId: "cloudflare",
        label: "big",
        apiToken: "x".repeat(4097),
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(versionOf(db)).toBe(1);
    expect(auditRows(db)).toEqual([]);
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
      accountId: "acct-1",
    });
    await expect(
      addProviderKey(d1, seal, {
        providerId: "cloudflare",
        label: "dup",
        apiToken: "t2",
        accountId: "acct-1",
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
      accountId: "acct-1",
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

  test("add requires an account id for cloudflare keys", async () => {
    // Inference addresses /accounts/{account_id}/ai/run — the account id
    // is load-bearing, so add refuses a cloudflare key without one.
    const db = freshDb();
    await expect(
      addProviderKey(asD1(db), seal, {
        providerId: "cloudflare",
        label: "no-acct",
        apiToken: "t",
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(versionOf(db)).toBe(1);
  });

  test("disable parks the key, keeps the row, bumps, audits", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "off",
      apiToken: "t",
      accountId: "acct-1",
    });
    const out = await disableProviderKey(d1, added.id);
    expect(out).toEqual({ id: added.id, enabled: false });

    const row = db
      .prepare("SELECT enabled FROM provider_keys WHERE id = ?")
      .get(added.id) as { enabled: number };
    expect(row.enabled).toBe(0);
    expect(auditRows(db).map((r) => r.action)).toEqual(["add", "disable"]);
  });

  test("update edits fields without a token: no new version, bump, audit", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "edit",
      apiToken: "token-v1",
      accountId: "acct-1",
    });
    const before = versionOf(db);
    const out = await updateProviderKey(d1, seal, {
      keyId: added.id,
      accountId: "acct-2",
      weight: 5,
      enabled: false,
    });
    expect(out).toEqual({
      id: added.id,
      label: "edit",
      providerId: "cloudflare",
      activeVersion: 1,
      weight: 5,
      enabled: false,
      accountId: "acct-2",
    });
    const row = db
      .prepare(
        "SELECT external_account_id, weight, enabled FROM provider_keys WHERE id = ?"
      )
      .get(added.id) as {
      external_account_id: string;
      weight: number;
      enabled: number;
    };
    expect(row).toEqual({
      external_account_id: "acct-2",
      weight: 5,
      enabled: 0,
    });
    expect(versionOf(db)).toBe(before + 1);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM credential_versions").get() as {
        n: number;
      }
    ).toEqual({ n: 1 });
    expect(auditRows(db).map((r) => r.action)).toEqual(["add", "update"]);
  });

  test("update echoes the stored row, not the pre-commit snapshot", async () => {
    // A concurrent save can commit between this call's pre-read and its own
    // commit (the seal is the await point). The response must report what is
    // stored, not the snapshot this caller started from.
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "race",
      apiToken: "token-v1",
      accountId: "acct-1",
    });
    const concurrentSeal = async (token: string) => {
      db.prepare("UPDATE provider_keys SET enabled = 0 WHERE id = ?").run(
        added.id
      );
      return seal(token);
    };
    const out = await updateProviderKey(d1, concurrentSeal, {
      keyId: added.id,
      weight: 9,
      apiToken: "token-v2",
    });
    expect(out.weight).toBe(9);
    expect(out.enabled).toBe(false); // the pre-read still saw enabled = 1
    expect(out.activeVersion).toBe(2);
  });

  test("update with a token rotates in the same batch: revoke + insert", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "rot-on-save",
      apiToken: "token-v1",
      accountId: "acct-1",
    });
    const out = await updateProviderKey(d1, seal, {
      keyId: added.id,
      accountId: "acct-1",
      weight: 2,
      apiToken: "token-v2",
    });
    expect(out.activeVersion).toBe(2);
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
    expect(auditRows(db).map((r) => r.action)).toEqual(["add", "update"]);
  });

  test("weight is bounded by the store, not only by the route", async () => {
    // The ceiling lives with the domain: a store caller that skips the
    // route's validation must not be able to write a weight the UI cannot
    // represent, and the UI reads the same bound.
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "bounded",
      apiToken: "token-v1",
      accountId: "acct-1",
    });
    const before = versionOf(db);
    await expect(
      addProviderKey(d1, seal, {
        providerId: "cloudflare",
        label: "bounded-2",
        apiToken: "token-v1",
        accountId: "acct-1",
        weight: MAX_WEIGHT + 1,
      })
    ).rejects.toThrow(/weight must be an integer/);
    for (const weight of [MAX_WEIGHT + 1, 1.5, -1, "2"] as unknown[]) {
      await expect(
        updateProviderKey(d1, seal, {
          keyId: added.id,
          weight: weight as number,
        })
      ).rejects.toThrow(/weight must be an integer/);
    }
    expect(versionOf(db)).toBe(before);
    const row = db
      .prepare("SELECT weight FROM provider_keys WHERE id = ?")
      .get(added.id) as { weight: number };
    expect(row.weight).toBe(1);
  });

  test("update of an unknown key is a 404 with no writes", async () => {
    const db = freshDb();
    await expect(
      updateProviderKey(asD1(db), seal, { keyId: 999, weight: 2 })
    ).rejects.toMatchObject({ status: 404 });
    expect(versionOf(db)).toBe(1);
  });

  test("update rejects a cloudflare key left without an account id", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "acct-guard",
      apiToken: "token-v1",
      accountId: "acct-1",
    });
    const before = versionOf(db);
    await expect(
      updateProviderKey(d1, seal, {
        keyId: added.id,
        accountId: "",
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(versionOf(db)).toBe(before);
  });

  test("update rejects a body that changes nothing", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "noop",
      apiToken: "token-v1",
      accountId: "acct-1",
    });
    await expect(
      updateProviderKey(d1, seal, { keyId: added.id })
    ).rejects.toMatchObject({ status: 400 });
  });

  test("update rejects an oversized token before sealing", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "oversize",
      apiToken: "token-v1",
      accountId: "acct-1",
    });
    const before = versionOf(db);
    await expect(
      updateProviderKey(d1, seal, {
        keyId: added.id,
        apiToken: "x".repeat(4097),
      })
    ).rejects.toMatchObject({ status: 400, message: "apiToken is too long" });
    expect(versionOf(db)).toBe(before);
  });

  test("update writes only supplied fields, leaving omitted columns untouched", async () => {
    const db = freshDb();
    const base = asD1(db);
    const statements: string[] = [];
    const recording: AdminD1 = {
      ...base,
      commit: (writes) => {
        for (const w of writes) statements.push(w.sql);
        return base.commit(writes);
      },
    };
    const added = await addProviderKey(base, seal, {
      providerId: "cloudflare",
      label: "partial",
      apiToken: "token-v1",
      accountId: "acct-1",
    });
    await updateProviderKey(recording, seal, {
      keyId: added.id,
      enabled: false,
    });
    expect(
      statements.filter((s) => s.startsWith("UPDATE provider_keys"))
    ).toEqual(["UPDATE provider_keys SET enabled = ? WHERE id = ?"]);
    const row = db
      .prepare(
        "SELECT external_account_id, weight FROM provider_keys WHERE id = ?"
      )
      .get(added.id) as { external_account_id: string; weight: number };
    expect(row).toEqual({ external_account_id: "acct-1", weight: 1 });
  });
});

describe("admin health exposure rows (S2)", () => {
  test("getAdminHealth returns providers, keys, exposure overrides, and configVersion", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    db.exec(
      "INSERT INTO exposure_overrides (model_id, enabled, alias, is_default, updated_by) VALUES ('@cf/model-a', 0, 'short-a', 1, 'r2-test')"
    );
    db.exec(
      "INSERT INTO excluded_scopes (model_id, scope) VALUES ('@cf/model-a', 's1')"
    );
    await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "health-key",
      apiToken: "cf-token-123",
      accountId: "acct-1",
    });

    const health = await getAdminHealth(d1, {
      any: true,
      byProvider: { cloudflare: true },
    });
    expect(health.providers).toEqual([
      { id: "cloudflare", displayName: "Cloudflare Workers AI" },
      { id: "agnes", displayName: "Agnes AI" },
    ]);
    expect(health.keys).toEqual([
      {
        id: expect.any(Number),
        providerId: "cloudflare",
        label: "health-key",
        weight: 1,
        enabled: true,
        activeVersion: 1,
        accountId: "acct-1",
      },
    ]);
    expect(health.configVersion).toBe(2);
    expect(health.hasServableCredential).toBe(true);
    expect(health.hasServableCredentialByProvider).toEqual({
      cloudflare: true,
    });
    expect(health.exposure).toContainEqual({
      modelId: "@cf/model-a",
      enabled: false,
      alias: "short-a",
      isDefault: true,
      scopes: ["s1"],
    });
  });

  test("exposure rows serialize model flags with scopes", async () => {
    const db = freshDb();
    db.exec(
      "INSERT INTO exposure_overrides (model_id, enabled, alias, is_default, updated_by) VALUES ('@cf/model-a', 0, 'short-a', 1, 'r2-test'), ('@cf/model-b', 1, NULL, 0, 'r2-test')"
    );
    db.exec(
      "INSERT INTO excluded_scopes (model_id, scope) VALUES ('@cf/model-a', 's1'), ('@cf/model-a', 's2')"
    );
    // Same SELECT the health handler runs: grouped per model, scopes
    // nested, labels only — no secret-adjacent column exists here.
    const rows = db
      .prepare(
        "SELECT e.model_id AS modelId, e.enabled AS enabled, e.alias AS alias, e.is_default AS isDefault, s.scope AS scope FROM exposure_overrides e LEFT JOIN excluded_scopes s ON s.model_id = e.model_id"
      )
      .all() as {
      modelId: string;
      enabled: number;
      alias: string | null;
      isDefault: number;
      scope: string | null;
    }[];
    const byModel = new Map<
      string,
      { enabled: boolean; scopes: (string | null)[] }
    >();
    for (const r of rows) {
      const row = byModel.get(r.modelId) ?? {
        enabled: r.enabled === 1,
        scopes: [],
      };
      row.scopes.push(r.scope);
      byModel.set(r.modelId, row);
    }
    expect(byModel.get("@cf/model-a")).toEqual({
      enabled: false,
      scopes: ["s1", "s2"],
    });
    expect(byModel.get("@cf/model-b")?.scopes).toEqual([null]);
  });
});

describe("deleteProviderKey (hard delete)", () => {
  test("delete removes key and credential versions atomically", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "delete-me",
      apiToken: "token-to-delete",
      accountId: "acct-delete",
    });

    const result = await deleteProviderKey(d1, added.id);
    expect(result).toEqual({ id: added.id, deleted: true });

    // Key row is gone
    const keyRow = db
      .prepare("SELECT * FROM provider_keys WHERE id = ?")
      .get(added.id);
    expect(keyRow).toBeUndefined();

    // Credential versions are gone
    const credRows = db
      .prepare("SELECT * FROM credential_versions WHERE provider_key_id = ?")
      .all(added.id) as unknown[];
    expect(credRows).toEqual([]);

    // Config version was bumped (add + delete = 2 bumps)
    expect(versionOf(db)).toBe(3);

    // Audit log has delete action
    expect(auditRows(db).map((r) => r.action)).toEqual(["add", "delete"]);
  });

  test("delete of unknown key returns 404", async () => {
    const db = freshDb();
    await expect(deleteProviderKey(asD1(db), 999)).rejects.toMatchObject({
      status: 404,
    });
    expect(versionOf(db)).toBe(1);
  });

  test("delete is idempotent-safe: second call returns 404", async () => {
    const db = freshDb();
    const d1 = asD1(db);
    const added = await addProviderKey(d1, seal, {
      providerId: "cloudflare",
      label: "once",
      apiToken: "t",
      accountId: "acct-once",
    });

    await deleteProviderKey(d1, added.id);

    // Second delete should fail with 404
    await expect(deleteProviderKey(d1, added.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});
