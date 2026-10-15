// ============================================================================
// Ledger writer tests - R1b (#72), arch-review C1
// ============================================================================
// Seam: rotateKey(db, ...) — one module owning the revoke+insert transaction
// the R1a migration comment points at. Tested against the local-D1 harness
// (node:sqlite, FK pragma on, matching D1), locking the revoke-then-insert
// order at the writer level, not just the SQL level. Token material never
// appears: callers pass sealed envelopes.

import { describe, expect, test } from "vitest";
import { freshDb } from "../test-utils/migration-fixtures.js";
import { rotateKey } from "./ledger.js";
import type { DatabaseSync } from "node:sqlite";

function seedKey(db: DatabaseSync, label = "k1"): number {
  db.exec(
    `INSERT INTO provider_keys (provider_id, label) VALUES ('cloudflare', '${label}')`
  );
  return (
    db.prepare("SELECT id FROM provider_keys WHERE label = ?").get(label) as {
      id: number;
    }
  ).id;
}

function activeVersions(db: DatabaseSync, keyId: number): number[] {
  return (
    db
      .prepare(
        "SELECT version FROM credential_versions WHERE provider_key_id = ? AND revoked_at IS NULL ORDER BY version"
      )
      .all(keyId) as { version: number }[]
  ).map((r) => r.version);
}

describe("ledger writer (C1)", () => {
  test("first rotation inserts version 1 with no revoke", () => {
    const db = freshDb();
    const kid = seedKey(db);
    rotateKey(db, { keyId: kid, envelope: "env-v1", actor: "import" });
    expect(activeVersions(db, kid)).toEqual([1]);
  });

  test("second rotation revokes v1 and inserts v2 in one transaction", () => {
    const db = freshDb();
    const kid = seedKey(db);
    rotateKey(db, { keyId: kid, envelope: "env-v1", actor: "import" });
    rotateKey(db, { keyId: kid, envelope: "env-v2", actor: "op" });
    expect(activeVersions(db, kid)).toEqual([2]);
    const rows = db
      .prepare(
        "SELECT version, created_by, revoked_at FROM credential_versions WHERE provider_key_id = ? ORDER BY version"
      )
      .all(kid) as {
      version: number;
      created_by: string;
      revoked_at: number | null;
    }[];
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[1]).toMatchObject({
      version: 2,
      created_by: "op",
      revoked_at: null,
    });
  });

  test("rotation is atomic: a failed insert leaves the old version active", () => {
    const db = freshDb();
    const kid = seedKey(db);
    rotateKey(db, { keyId: kid, envelope: "env-v1", actor: "import" });
    expect(() =>
      rotateKey(db, { keyId: kid, envelope: "", actor: "op" })
    ).toThrow();
    expect(activeVersions(db, kid)).toEqual([1]);
  });

  test("rotating a missing key fails without touching the ledger", () => {
    const db = freshDb();
    const before = (
      db.prepare("SELECT COUNT(*) AS n FROM credential_versions").get() as {
        n: number;
      }
    ).n;
    expect(() =>
      rotateKey(db, { keyId: 9999, envelope: "env-x", actor: "op" })
    ).toThrow();
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM credential_versions").get() as {
          n: number;
        }
      ).n
    ).toBe(before);
  });
});
