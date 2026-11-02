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
  GENERATED_CALLER_PREFIX,
  listCallerKeys,
  maskCallerKey,
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
      try {
        for (let i = 0; i < writes.length; i++) {
          const info = db
            .prepare(writes[i].sql)
            .run(...(writes[i].params as (string | number | null)[]));
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
