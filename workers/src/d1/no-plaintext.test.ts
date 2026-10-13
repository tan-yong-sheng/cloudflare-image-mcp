// ============================================================================
// D1 provider store tests - R1a (#71), no plaintext tokens in the store
// ============================================================================
// Seam: the migrated database itself. Locks two properties of the store:
// the credential_versions column set (envelope-only, no token column) and
// the migration SQL (no secret-shaped literal). Runtime code is out of
// scope here — R1b owns envelope encryption, R2 (#74) writes and reads.

import { describe, expect, test } from "vitest";
import { scanForSecrets } from "../test-utils/plaintext-scan.js";
import {
  columnsOf,
  freshDb,
  migrationFiles,
  migrationSql,
} from "../test-utils/migration-fixtures.js";

describe("provider store holds no plaintext token column", () => {
  test("credential_versions columns are exactly the envelope set", () => {
    expect(columnsOf(freshDb(), "credential_versions")).toEqual([
      "id",
      "provider_key_id",
      "version",
      "envelope",
      "created_by",
      "created_at",
      "revoked_at",
    ]);
  });

  test("no migration file contains a secret-shaped literal", () => {
    for (const file of migrationFiles()) {
      expect(
        scanForSecrets(migrationSql(file)),
        `secret-shaped value in ${file}`
      ).toEqual([]);
    }
  });
});
