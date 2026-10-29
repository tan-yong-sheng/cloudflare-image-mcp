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
import type { AdminD1 } from "./admin-store.js";
import { listCallerKeys, maskCallerKey } from "./caller-store.js";

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
