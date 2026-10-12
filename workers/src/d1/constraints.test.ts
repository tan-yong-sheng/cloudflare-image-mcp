// ============================================================================
// D1 provider constraint tests - R1a (#71), single-active / single-default
// ============================================================================
// Seam: same as schema.test.ts — migrations applied to empty node:sqlite.
// Locks the rotation contract (insert-new-active + revoke-old, never
// overwrite) and the single-default rule, plus rejection of bad shapes.
// Asserts only D1-enforced behavior (UNIQUE / CHECK / partial-unique).

import { describe, expect, test } from "vitest";
import { freshDb } from "../test-utils/migration-fixtures.js";

function keyId(db: ReturnType<typeof freshDb>): number {
  db.exec(
    "INSERT INTO provider_keys (provider_id, label) VALUES ('cloudflare', 'k1')"
  );
  const row = db
    .prepare("SELECT id FROM provider_keys WHERE label = 'k1'")
    .get() as { id: number };
  return row.id;
}

describe("provider store constraints (R1a)", () => {
  test("rotation is insert-new-active plus revoke-old (single-active)", () => {
    const db = freshDb();
    const kid = keyId(db);
    db.exec(
      `INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) VALUES (${kid}, 1, 'env-v1', 'op')`
    );
    // Second active version rejected while v1 is un-revoked.
    expect(() =>
      db.exec(
        `INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) VALUES (${kid}, 2, 'env-v2', 'op')`
      )
    ).toThrow();
    // Revoke v1, then v2 inserts cleanly; exactly one active remains.
    db.exec(
      `UPDATE credential_versions SET revoked_at = unixepoch() WHERE provider_key_id = ${kid} AND version = 1`
    );
    db.exec(
      `INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) VALUES (${kid}, 2, 'env-v2', 'op')`
    );
    const active = db
      .prepare(
        `SELECT version FROM credential_versions WHERE provider_key_id = ${kid} AND revoked_at IS NULL`
      )
      .all() as { version: number }[];
    expect(active).toEqual([{ version: 2 }]);
  });

  test("duplicate version per key rejected (no overwrite)", () => {
    const db = freshDb();
    const kid = keyId(db);
    db.exec(
      `INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) VALUES (${kid}, 1, 'env-v1', 'op')`
    );
    db.exec(
      `UPDATE credential_versions SET revoked_at = unixepoch() WHERE provider_key_id = ${kid}`
    );
    // Same version number reused after revoke: still rejected.
    expect(() =>
      db.exec(
        `INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) VALUES (${kid}, 1, 'env-v1b', 'op')`
      )
    ).toThrow();
  });

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
    expect(() =>
      db.exec(
        "INSERT INTO exposure_overrides (model_id, alias, updated_by) VALUES ('m4', 'm3-alias', 'op')"
      )
    ).toThrow();
  });

  test("bad shapes rejected: empty envelope, bad flags, bad version", () => {
    const db = freshDb();
    const kid = keyId(db);
    expect(() =>
      db.exec(
        `INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) VALUES (${kid}, 1, '', 'op')`
      )
    ).toThrow();
    expect(() =>
      db.exec(
        `INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) VALUES (${kid}, 0, 'env', 'op')`
      )
    ).toThrow();
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
