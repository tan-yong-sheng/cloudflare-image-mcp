// ============================================================================
// D1 provider constraint tests - R1a (#71), single-active / single-default
// ============================================================================
// Seam: same as schema.test.ts — migrations applied to empty node:sqlite
// with foreign_keys = ON, matching D1's default. Locks the rotation
// contract (never overwrite: revoke the old version, insert the new one,
// in that order), the single-default rule, and rejection of bad shapes.
// Asserts only D1-enforced behavior (UNIQUE / CHECK / partial-unique / FK).

import { describe, expect, test } from "vitest";
import { freshDb } from "../test-utils/migration-fixtures.js";

type Db = ReturnType<typeof freshDb>;

/** One credential row: the (key, version, envelope, actor) tuple. */
function insertVersion(
  db: Db,
  keyId: number,
  version: number,
  envelope: string,
  createdBy = "op"
): void {
  db.exec(
    `INSERT INTO credential_versions (provider_key_id, version, envelope, created_by)` +
      ` VALUES (${keyId}, ${version}, '${envelope}', '${createdBy}')`
  );
}

/** A provider key to hang credential versions off, plus its id. */
function newKey(db: Db, label = "k1"): number {
  db.exec(
    `INSERT INTO provider_keys (provider_id, label) VALUES ('cloudflare', '${label}')`
  );
  return (
    db.prepare(`SELECT id FROM provider_keys WHERE label = ?`).get(label) as {
      id: number;
    }
  ).id;
}

describe("credential rotation ledger (R1a)", () => {
  test("a second active version is refused; revoke-then-insert rotates", () => {
    const db = freshDb();
    const kid = newKey(db);
    insertVersion(db, kid, 1, "env-v1");
    // A second active version is rejected while v1 is un-revoked. This is
    // what forces the rotation order: inserting the new active row before
    // revoking the old one fails even inside a transaction, so the revoke
    // must come first (R1b writes both statements in one transaction).
    expect(() => insertVersion(db, kid, 2, "env-v2")).toThrow();
    // Revoke v1, then v2 inserts cleanly; exactly one active remains.
    db.exec(
      `UPDATE credential_versions SET revoked_at = unixepoch()
       WHERE provider_key_id = ${kid} AND version = 1`
    );
    insertVersion(db, kid, 2, "env-v2");
    const active = db
      .prepare(
        `SELECT version FROM credential_versions
         WHERE provider_key_id = ${kid} AND revoked_at IS NULL`
      )
      .all() as { version: number }[];
    expect(active).toEqual([{ version: 2 }]);
  });

  test("duplicate version per key rejected (rotation never overwrites)", () => {
    const db = freshDb();
    const kid = newKey(db);
    insertVersion(db, kid, 1, "env-v1");
    db.exec(
      `UPDATE credential_versions SET revoked_at = unixepoch()
       WHERE provider_key_id = ${kid}`
    );
    // Reusing the version number after revoke is still rejected.
    expect(() => insertVersion(db, kid, 1, "env-v1b")).toThrow();
  });

  test("identifier columns reject an omitted id", () => {
    const db = freshDb();
    // SQLite allows NULL in a TEXT PRIMARY KEY unless NOT NULL is declared,
    // which would let a provider or override row exist with no identifier.
    expect(() =>
      db.exec(
        "INSERT INTO providers (display_name, transport) VALUES ('X', 't')"
      )
    ).toThrow();
    expect(() =>
      db.exec("INSERT INTO exposure_overrides (updated_by) VALUES ('op')")
    ).toThrow();
  });

  test("a credential version requires an existing key (FK enforced)", () => {
    const db = freshDb();
    expect(() => insertVersion(db, 9999, 1, "env-orphan")).toThrow();
  });
});

describe("exposure overrides (R1a)", () => {
  test("at most one default exposure override", () => {
    const db = freshDb();
    db.exec(
      "INSERT INTO exposure_overrides (model_id, is_default, updated_by) VALUES ('m1', 1, 'op')"
    );
    expect(() =>
      db.exec(
        "INSERT INTO exposure_overrides (model_id, is_default, updated_by) VALUES ('m2', 1, 'op')"
      )
    ).toThrow();
    // Non-default rows are unlimited.
    db.exec(
      "INSERT INTO exposure_overrides (model_id, updated_by) VALUES ('m2', 'op')"
    );
    db.exec(
      "INSERT INTO exposure_overrides (model_id, alias, updated_by) VALUES ('m3', 'm3-alias', 'op')"
    );
    // Aliases stay unique across overrides.
    expect(() =>
      db.exec(
        "INSERT INTO exposure_overrides (model_id, alias, updated_by) VALUES ('m4', 'm3-alias', 'op')"
      )
    ).toThrow();
  });
});

describe("bad shapes rejected (R1a)", () => {
  test("empty envelope, bad version, bad flags, bad weight", () => {
    const db = freshDb();
    const kid = newKey(db);
    expect(() => insertVersion(db, kid, 1, "")).toThrow();
    expect(() => insertVersion(db, kid, 0, "env")).toThrow();
    expect(() =>
      db.exec(
        "INSERT INTO provider_keys (provider_id, label, enabled) VALUES ('cloudflare', 'bad', 2)"
      )
    ).toThrow();
    expect(() =>
      db.exec(
        "INSERT INTO provider_keys (provider_id, label, weight) VALUES ('cloudflare', 'neg', -1)"
      )
    ).toThrow();
  });
});
