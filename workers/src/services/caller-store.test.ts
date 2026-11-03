// ============================================================================
// Caller-key store tests - #125, seam S2 (local-D1 harness)
// ============================================================================
// Seam: listCallerKeys against the REAL migrations (freshDb) through a
// D1-shaped adapter, the same harness the provider-key store tests use.
// Expected values are literals from the store contract: the list carries
// names, masked hints, and the enabled flag — and nothing that could be
// used as a key.
//
// The verifier is never returned, so the test asserts its absence rather
// than only its shape: a leak here would be a key the browser could use.

import { describe, expect, test } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { freshDb } from "../test-utils/migration-fixtures.js";
import type { AdminD1, AdminWrite } from "./admin-store.js";
import { AdminStoreError } from "./admin-store.js";
import { callerKeyVerifier, deriveCallerPepper } from "./caller-crypto.js";
import {
  createCallerKey,
  deleteCallerKey,
  GENERATED_CALLER_PREFIX,
  listCallerKeys,
  maskCallerKey,
  renameCallerKey,
  rotateCallerKey,
  toggleCallerKey,
} from "./caller-store.js";

/** D1-shaped adapter over node:sqlite (prepare/bind only — reads only). */
function asD1(db: DatabaseSync): AdminD1 {
  return {
    prepare: (sql: string) => {
      const unbound = {
        first: async <T>() => (db.prepare(sql).get() ?? null) as T | null,
        all: async <T>() => ({ results: db.prepare(sql).all() as T[] }),
        run: async () => ({ meta: { changes: 0 } }),
      };
      return {
        ...unbound,
        bind: (...params: (string | number | bigint | null)[]) => ({
          first: async <T>() =>
            (db.prepare(sql).get(...params) ?? null) as T | null,
          all: async <T>() => ({
            results: db.prepare(sql).all(...params) as T[],
          }),
          run: async () => ({
            meta: { changes: Number(db.prepare(sql).run(...params).changes) },
          }),
        }),
      };
    },
    commit: async () => ({ keyId: null }),
  };
}

/** One caller-key row. The verifier stands in for a secret. */
function insertKey(
  db: DatabaseSync,
  name: string,
  options: {
    prefix?: string;
    suffix?: string;
    enabled?: number;
    verifier?: string;
  } = {}
): void {
  db.prepare(
    "INSERT INTO caller_keys (name, secret_hash, prefix, suffix, enabled)" +
      " VALUES (?, ?, ?, ?, ?)"
  ).run(
    name,
    options.verifier ?? "verifier-" + name,
    options.prefix ?? "sk-mgmt-",
    options.suffix ?? "a1b2",
    options.enabled ?? 1
  );
}

describe("caller-key store against the real migrations (S2)", () => {
  test("an empty table lists no keys", async () => {
    expect(await listCallerKeys(asD1(freshDb()))).toEqual([]);
  });

  test("the list carries names, masked hints, and the enabled flag", async () => {
    const db = freshDb();
    insertKey(db, "Laptop");
    insertKey(db, "CI", { enabled: 0 });

    expect(await listCallerKeys(asD1(db))).toEqual([
      {
        id: 1,
        name: "Laptop",
        maskedKey: "sk-mgmt-…a1b2",
        enabled: true,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      },
      {
        id: 2,
        name: "CI",
        maskedKey: "sk-mgmt-…a1b2",
        enabled: false,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      },
    ]);
  });

  test("the list never carries the verifier", async () => {
    const db = freshDb();
    insertKey(db, "Laptop", { verifier: "verifier-Laptop" });

    const [key] = await listCallerKeys(asD1(db));
    expect(key).toBeDefined();
    // The whole serialized row is checked: a verifier smuggled in under
    // another name would be a leak too.
    expect(JSON.stringify(key)).not.toContain("verifier-Laptop");
    expect(Object.keys(key ?? {}).sort()).toEqual([
      "createdAt",
      "enabled",
      "id",
      "maskedKey",
      "name",
      "updatedAt",
    ]);
  });

  test("keys are listed oldest first", async () => {
    const db = freshDb();
    insertKey(db, "first");
    insertKey(db, "second");
    insertKey(db, "third");

    const names = (await listCallerKeys(asD1(db))).map((key) => key.name);
    expect(names).toEqual(["first", "second", "third"]);
  });
});

describe("the caller-key mask", () => {
  test("a generated key shows its prefix before the ellipsis", () => {
    expect(maskCallerKey("sk-mgmt-", "a1b2")).toBe("sk-mgmt-…a1b2");
  });

  test("a key the operator brought claims no prefix", () => {
    expect(maskCallerKey("", "a1b2")).toBe("…a1b2");
  });

  test("a secret too short for a hint shows the ellipsis alone", () => {
    // The suffix is empty when the secret was too short to hint safely.
    // Half a secret is worse than no hint, so the mask stops at the dots.
    expect(maskCallerKey("", "")).toBe("…");
    expect(maskCallerKey("sk-mgmt-", "")).toBe("sk-mgmt-…");
  });
});

// ============================================================================
// createCallerKey (#126) - the write path, against the real migrations
// ============================================================================
// The verifier callback is the seam under test: whatever the endpoint's
// pepper-derived callback produces is what the row must hold, and the
// plaintext must not. Uniqueness is the schema's job; the store maps the
// violation to a 409 naming which constraint fired.

/** D1-shaped adapter with a write-capable atomic commit (BEGIN/COMMIT). */
function writableD1(db: DatabaseSync): AdminD1 {
  const read = asD1(db);
  return {
    prepare: read.prepare,
    commit: async (rawWrites) => {
      const writes = rawWrites as readonly AdminWrite[];
      db.exec("BEGIN");
      let keyId: number | null = null;
      let changes: number | undefined = undefined;
      try {
        for (let i = 0; i < writes.length; i++) {
          const info = db
            .prepare(writes[i].sql)
            .run(...(writes[i].params as (string | number | null)[]));
          if (i === 0) {
            const lri = info.lastInsertRowid;
            keyId = typeof lri === "bigint" ? Number(lri) : lri;
            changes = Number(info.changes);
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return { keyId, changes };
    },
  };
}

function testVerifier(): (secret: string) => Promise<string> {
  return async (secret) =>
    callerKeyVerifier(await deriveCallerPepper("test-data-key"), secret);
}

describe("createCallerKey against the real migrations (S2)", () => {
  test("a blank secret is generated with the reserved prefix", async () => {
    const db = freshDb();
    const created = await createCallerKey(writableD1(db), testVerifier(), {
      name: "CI",
    });
    expect(created.secret).toMatch(
      new RegExp(`^${GENERATED_CALLER_PREFIX}[0-9a-f]{24}$`)
    );
    expect(created.key).toEqual({
      id: 1,
      name: "CI",
      prefix: GENERATED_CALLER_PREFIX,
      suffix: created.secret.slice(-4),
      enabled: true,
      created_at: expect.any(Number),
    });
  });

  test("the row holds the verifier, never the plaintext", async () => {
    const db = freshDb();
    const created = await createCallerKey(writableD1(db), testVerifier(), {
      name: "CI",
    });
    const row = db
      .prepare("SELECT * FROM caller_keys WHERE id = 1")
      .get() as Record<string, unknown>;
    // The whole row is checked: a plaintext stored under any column name
    // would be a leak too.
    expect(JSON.stringify(row)).not.toContain(created.secret);
    expect(row["secret_hash"]).toBe(await testVerifier()(created.secret));
    expect(row["secret_hash"]).not.toBe(created.secret);
  });

  test("an operator secret claims no prefix and keeps the given value", async () => {
    const db = freshDb();
    const created = await createCallerKey(writableD1(db), testVerifier(), {
      name: "brought",
      secret: "op-secret-1",
    });
    expect(created.secret).toBe("op-secret-1");
    expect(created.key.prefix).toBe("");
    expect(created.key.suffix).toBe("et-1");
  });

  test("a blank name defaults to Key N, counting existing rows", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const first = await createCallerKey(store, testVerifier(), {});
    const second = await createCallerKey(store, testVerifier(), { name: "" });
    const third = await createCallerKey(store, testVerifier(), {
      name: "   ",
    });
    expect([first.key.name, second.key.name, third.key.name]).toEqual([
      "Key 1",
      "Key 2",
      "Key 3",
    ]);
  });

  test("the created key shows up in the list with its masked hint", async () => {
    const db = freshDb();
    const created = await createCallerKey(writableD1(db), testVerifier(), {
      name: "CI",
    });
    const [key] = await listCallerKeys(asD1(db));
    expect(key?.maskedKey).toBe(
      maskCallerKey(created.key.prefix, created.key.suffix)
    );
    expect(key?.enabled).toBe(true);
  });

  test.each([
    ["name over 120 characters", { name: "x".repeat(121) }, "name"],
    ["secret too short", { name: "k", secret: "short1!" }, "secret"],
    [
      "secret over 256 characters",
      { name: "k", secret: "a".repeat(257) },
      "secret",
    ],
    ["secret with a space", { name: "k", secret: "has space in it" }, "secret"],
    [
      "secret with a control character",
      { name: "k", secret: "tab\tinside" },
      "secret",
    ],
    [
      "secret claiming the reserved prefix",
      { name: "k", secret: `${GENERATED_CALLER_PREFIX}abc` },
      "reserved prefix",
    ],
    ["non-string name", { name: 42 }, "name"],
    ["non-string secret", { secret: 42 }, "secret"],
  ])("rejects %s with 400", async (_label, input, fragment) => {
    const db = freshDb();
    // The non-string cases simulate a caller past the type system: the
    // guard is runtime defense at the store boundary, not something the
    // endpoint (which pre-validates) can produce.
    const failure = await createCallerKey(
      writableD1(db),
      testVerifier(),
      input as { name?: string; secret?: string }
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AdminStoreError);
    expect((failure as AdminStoreError).status).toBe(400);
    expect((failure as AdminStoreError).message).toContain(fragment);
    expect(db.prepare("SELECT COUNT(*) AS n FROM caller_keys").get()).toEqual({
      n: 0,
    });
  });

  test("a duplicate name is a 409", async () => {
    const db = freshDb();
    const store = writableD1(db);
    await createCallerKey(store, testVerifier(), { name: "CI" });
    const failure = await createCallerKey(store, testVerifier(), {
      name: "CI",
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AdminStoreError);
    expect((failure as AdminStoreError).status).toBe(409);
  });

  test("a duplicate secret is a 409, across enabled and disabled keys", async () => {
    const db = freshDb();
    const store = writableD1(db);
    await createCallerKey(store, testVerifier(), {
      name: "one",
      secret: "shared-secret-1",
    });
    const failure = await createCallerKey(store, testVerifier(), {
      name: "two",
      secret: "shared-secret-1",
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AdminStoreError);
    expect((failure as AdminStoreError).status).toBe(409);
    expect((failure as AdminStoreError).message).toContain("secret");
  });

  test("the response shape never carries the verifier", async () => {
    const db = freshDb();
    const created = await createCallerKey(writableD1(db), testVerifier(), {
      name: "CI",
    });
    const text = JSON.stringify(created);
    expect(text).not.toContain("secret_hash");
    expect(text).not.toContain("secretHash");
    expect(Object.keys(created.key).sort()).toEqual([
      "created_at",
      "enabled",
      "id",
      "name",
      "prefix",
      "suffix",
    ]);
  });
});

describe("rotateCallerKey against the real migrations (S2)", () => {
  test("rotation replaces the verifier; the old secret stops verifying", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
      secret: "op-secret-1",
    });
    const oldHash = await testVerifier()(created.secret);

    const rotated = await rotateCallerKey(
      store,
      created.key.id,
      testVerifier()
    );

    // The new plaintext is a fresh generated secret, returned once.
    expect(rotated.secret).toMatch(
      new RegExp(`^${GENERATED_CALLER_PREFIX}[0-9a-f]{24}$`)
    );
    expect(rotated.secret).not.toBe(created.secret);

    // The row now holds exactly one verifier — the new one. The old
    // secret's verifier is gone, not stored beside the new one.
    const row = db
      .prepare(
        "SELECT secret_hash, prefix, suffix, updated_at FROM caller_keys WHERE id = ?"
      )
      .get(created.key.id) as Record<string, unknown>;
    expect(row["secret_hash"]).toBe(await testVerifier()(rotated.secret));
    expect(row["secret_hash"]).not.toBe(oldHash);
    // Identity survives; only the secret material moved.
    expect(rotated.key).toEqual({
      id: created.key.id,
      name: "CI",
      prefix: GENERATED_CALLER_PREFIX,
      suffix: rotated.secret.slice(-4),
      enabled: true,
      created_at: created.key.created_at,
    });
    expect(Number(row["updated_at"])).toBeGreaterThanOrEqual(
      created.key.created_at
    );
  });

  test("a rotated operator key becomes a generated key", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "brought",
      secret: "op-secret-1",
    });
    expect(created.key.prefix).toBe("");

    const rotated = await rotateCallerKey(
      store,
      created.key.id,
      testVerifier()
    );

    // The old phrasing is gone with the secret it described: the hint
    // now belongs to the family the server generated.
    expect(rotated.key.prefix).toBe(GENERATED_CALLER_PREFIX);
    expect(rotated.key.suffix).toBe(rotated.secret.slice(-4));
  });

  test("a disabled key rotates in place and stays disabled", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
    });
    db.prepare("UPDATE caller_keys SET enabled = 0 WHERE id = ?").run(
      created.key.id
    );

    const rotated = await rotateCallerKey(
      store,
      created.key.id,
      testVerifier()
    );

    expect(rotated.key.enabled).toBe(false);
    expect(rotated.key.name).toBe("CI");
  });

  test("an unknown id is a 404 and writes nothing", async () => {
    const db = freshDb();
    const failure = await rotateCallerKey(
      writableD1(db),
      999,
      testVerifier()
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AdminStoreError);
    expect((failure as AdminStoreError).status).toBe(404);
    // No row appeared, no row changed: 404 is a read answer, not a write.
    expect(db.prepare("SELECT COUNT(*) AS n FROM caller_keys").get()).toEqual({
      n: 0,
    });
  });

  test("the rotated key still shows in the list under its new mask", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
      secret: "op-secret-1",
    });
    const rotated = await rotateCallerKey(
      store,
      created.key.id,
      testVerifier()
    );

    const [key] = await listCallerKeys(asD1(db));
    expect(key?.maskedKey).toBe(
      maskCallerKey(rotated.key.prefix, rotated.key.suffix)
    );
  });

  test("the response shape never carries the verifier", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
    });
    const rotated = await rotateCallerKey(
      store,
      created.key.id,
      testVerifier()
    );
    const text = JSON.stringify(rotated);
    expect(text).not.toContain("secret_hash");
    expect(text).not.toContain("secretHash");
    expect(Object.keys(rotated.key).sort()).toEqual([
      "created_at",
      "enabled",
      "id",
      "name",
      "prefix",
      "suffix",
    ]);
  });
});

describe("caller-key mutations (#128) against the real migrations", () => {
  // Toggle, rename, delete: the three row mutations. What the tests pin:
  // each is one atomic batch with its audit row and config bump, the
  // env-mirror warning fires exactly where a disable/delete does NOT
  // revoke the credential (the legacy mirror), delete keeps its audit
  // trail after the row is gone, and the last-enabled-key delete says so.

  function version(db: DatabaseSync): number {
    return Number(
      (
        db
          .prepare("SELECT version FROM config_versions WHERE id = 1")
          .get() as {
          version: number;
        }
      ).version
    );
  }

  function auditRows(db: DatabaseSync, action: string): unknown[] {
    return db
      .prepare("SELECT * FROM admin_audit WHERE action = ? ORDER BY id")
      .all(action);
  }

  test("create and rotate write audit rows and bump config_versions", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const before = version(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
    });
    const afterCreate = version(db);
    expect(afterCreate).toBe(before + 1);
    const creates = auditRows(db, "caller_key_create");
    expect(creates).toHaveLength(1);
    expect((creates[0] as { key_label: string }).key_label).toBe("CI");

    await rotateCallerKey(store, created.key.id, testVerifier());
    expect(version(db)).toBe(afterCreate + 1);
    expect(auditRows(db, "caller_key_rotate")).toHaveLength(1);
  });

  test("toggle flips enabled and audits, both directions", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
    });

    const off = await toggleCallerKey(store, created.key.id);
    expect(off.key.enabled).toBe(false);
    expect(off.warning).toBeUndefined();
    const on = await toggleCallerKey(store, created.key.id);
    expect(on.key.enabled).toBe(true);
    expect(auditRows(db, "caller_key_toggle")).toHaveLength(2);

    const row = db
      .prepare("SELECT enabled FROM caller_keys WHERE id = ?")
      .get(created.key.id) as { enabled: number };
    expect(row.enabled).toBe(1);
  });

  test("disabling a key whose secret also lives in env warns; enabling does not", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "mirrored",
    });
    // The predicate stands in for the endpoint's env check: this row's
    // verifier also matches an API_KEYS value.
    const mirror = async () => true;

    const off = await toggleCallerKey(store, created.key.id, mirror);
    expect(off.warning).toContain("API_KEYS");
    expect(off.warning).toContain("remove it from the deploy");

    const on = await toggleCallerKey(store, created.key.id, mirror);
    expect(on.warning).toBeUndefined();

    const plain = await toggleCallerKey(store, created.key.id);
    expect(plain.warning).toBeUndefined();
  });

  test("rename moves the name, keeps the credential, audits once", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
    });

    const renamed = await renameCallerKey(store, created.key.id, "deploy-ci");
    expect(renamed.key.name).toBe("deploy-ci");
    expect(renamed.key.prefix).toBe(created.key.prefix);
    expect(renamed.key.suffix).toBe(created.key.suffix);
    expect(renamed.key.enabled).toBe(true);
    expect(renamed.warning).toBeUndefined();
    expect(auditRows(db, "caller_key_rename")).toHaveLength(1);
    expect(version(db)).toBeGreaterThan(0);

    // The row really moved.
    const row = db
      .prepare("SELECT name FROM caller_keys WHERE id = ?")
      .get(created.key.id) as { name: string };
    expect(row.name).toBe("deploy-ci");
  });

  test("rename to an existing name is a 409 and changes nothing", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const first = await createCallerKey(store, testVerifier(), { name: "one" });
    await createCallerKey(store, testVerifier(), { name: "two" });

    const failure = await renameCallerKey(store, first.key.id, "two").catch(
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(AdminStoreError);
    expect((failure as AdminStoreError).status).toBe(409);
    expect(
      (
        db
          .prepare("SELECT name FROM caller_keys WHERE id = ?")
          .get(first.key.id) as { name: string }
      ).name
    ).toBe("one");
  });

  test.each([
    ["an empty name", ""],
    ["a blank name", "   "],
    ["a 121-character name", "x".repeat(121)],
  ])("rename rejects %s with 400", async (_label, name) => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
    });
    const failure = await renameCallerKey(store, created.key.id, name).catch(
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(AdminStoreError);
    expect((failure as AdminStoreError).status).toBe(400);
  });

  test("delete removes the row, keeps the audit trail, warns on the mirror", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
    });
    const mirror = async () => true;

    const result = await deleteCallerKey(store, created.key.id, mirror);
    expect(result.deleted).toBe(true);
    expect(result.id).toBe(created.key.id);
    expect(result.warning).toContain("API_KEYS");
    // Another enabled key remains in this store? No — create was the only
    // one, so the lockout warning rides along too.
    expect(result.warning).toContain("No enabled keys left");

    // The row is gone; the trail stays, unlinked (SET NULL) but named.
    expect(db.prepare("SELECT COUNT(*) AS n FROM caller_keys").get()).toEqual({
      n: 0,
    });
    const trail = auditRows(db, "caller_key_delete") as {
      key_label: string;
      caller_key_id: number | null;
    }[];
    expect(trail).toHaveLength(1);
    expect(trail[0].key_label).toBe("CI");
    expect(trail[0].caller_key_id).toBeNull();
  });

  test("deleting one of several keys warns only when the mirror matches", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const a = await createCallerKey(store, testVerifier(), { name: "one" });
    await createCallerKey(store, testVerifier(), { name: "two" });

    const result = await deleteCallerKey(store, a.key.id);
    expect(result.warning).toBeUndefined();
    // Another enabled key remains, so no lockout warning either.
    expect(result.warning).toBeUndefined();
  });

  test("toggle, rename and delete on an unknown id are 404s", async () => {
    const db = freshDb();
    const store = writableD1(db);
    for (const attempt of [
      () => toggleCallerKey(store, 999),
      () => renameCallerKey(store, 999, "x"),
      () => deleteCallerKey(store, 999),
    ]) {
      const failure = await attempt().catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AdminStoreError);
      expect((failure as AdminStoreError).status).toBe(404);
    }
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM admin_audit WHERE action LIKE 'caller_key_%'"
        )
        .get()
    ).toEqual({
      n: 0,
    });
  });
});

// ============================================================================
// Review-round fixes (M1, M5, M7) - regression tests
// ============================================================================
// Each test pins the exact failure the review reproduced, so the defect
// cannot come back silently.

/** One enabled key with id 1, so a racing commit has something to lose. */
function seedOneKey(db: DatabaseSync): void {
  db.prepare(
    "INSERT INTO caller_keys (id, name, secret_hash, prefix, suffix, enabled) " +
      "VALUES (1, 'CI', 'h', 'p', 'a1b2', 1)"
  ).run();
}

/** A store whose first write hits a row that vanished after the read. */
function vanishingD1(db: DatabaseSync): AdminD1 {
  const base = writableD1(db);
  return {
    prepare: base.prepare,
    commit: async (writes) => {
      // The race: another request deletes the key between read and commit.
      db.prepare("DELETE FROM caller_keys WHERE id = 1").run();
      return base.commit(writes);
    },
  };
}

function auditCount(db: DatabaseSync, action: string): number {
  return Number(
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE action = ?")
        .get(action) as { n: number }
    ).n
  );
}

describe("review fixes: default name (M1)", () => {
  test("a key already called 'Key 2' does not make the next blank create collide", async () => {
    const db = freshDb();
    const store = writableD1(db);
    await createCallerKey(store, testVerifier(), { name: "Key 2" });

    // Before the fix this computed the row count (1) and picked "Key 2"
    // again, so an unnamed create answered 409.
    const created = await createCallerKey(store, testVerifier(), {});
    expect(created.key.name).toBe("Key 3");
  });

  test("the default still starts at Key 1 on an empty table", async () => {
    const db = freshDb();
    const created = await createCallerKey(writableD1(db), testVerifier(), {});
    expect(created.key.name).toBe("Key 1");
  });

  test("a non-numeric custom name does not affect the default", async () => {
    const db = freshDb();
    const store = writableD1(db);
    await createCallerKey(store, testVerifier(), { name: "Laptop" });
    const created = await createCallerKey(store, testVerifier(), {});
    expect(created.key.name).toBe("Key 1");
  });
});

describe("review fixes: ghost mutations write no audit row (M5)", () => {
  test("rotate on a vanished row answers 404 and records nothing", async () => {
    const db = freshDb();
    seedOneKey(db);
    const failure = await rotateCallerKey(
      vanishingD1(db),
      1,
      testVerifier()
    ).catch((error: unknown) => error);
    expect((failure as AdminStoreError).status).toBe(404);
    expect(auditCount(db, "caller_key_rotate")).toBe(0);
  });

  test("toggle on a vanished row answers 404 and records nothing", async () => {
    const db = freshDb();
    seedOneKey(db);
    const failure = await toggleCallerKey(vanishingD1(db), 1).catch(
      (error: unknown) => error
    );
    expect((failure as AdminStoreError).status).toBe(404);
    expect(auditCount(db, "caller_key_toggle")).toBe(0);
  });

  test("rename on a vanished row answers 404 and records nothing", async () => {
    const db = freshDb();
    seedOneKey(db);
    const failure = await renameCallerKey(vanishingD1(db), 1, "renamed").catch(
      (error: unknown) => error
    );
    expect((failure as AdminStoreError).status).toBe(404);
    expect(auditCount(db, "caller_key_rename")).toBe(0);
  });

  test("a normal mutation still records its audit row", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
    });
    await toggleCallerKey(store, created.key.id);
    expect(auditCount(db, "caller_key_toggle")).toBe(1);
  });
});

describe("review fixes: lockout warning matches the deploy (M7)", () => {
  test("with API_KEYS configured the warning names the surviving callers", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
    });

    const result = await deleteCallerKey(
      store,
      created.key.id,
      undefined,
      true
    );
    expect(result.warning).toContain("API_KEYS values still can");
    expect(result.warning).not.toContain("reject every caller");
  });

  test("without API_KEYS the warning is the full lockout", async () => {
    const db = freshDb();
    const store = writableD1(db);
    const created = await createCallerKey(store, testVerifier(), {
      name: "CI",
    });

    const result = await deleteCallerKey(store, created.key.id);
    expect(result.warning).toContain("reject every caller");
  });
});

describe("review round 2: default suffix beyond float precision", () => {
  test("a huge numeric name does not make the next default collide", async () => {
    const db = freshDb();
    const store = writableD1(db);
    // A suffix past Number.MAX_SAFE_INTEGER: Number() would round it and
    // `highest + 1` could land back on the same name, 409-ing forever.
    await createCallerKey(store, testVerifier(), {
      name: "Key 99999999999999999999",
    });
    const created = await createCallerKey(store, testVerifier(), {});
    expect(created.key.name).toBe("Key 100000000000000000000");
  });
});
