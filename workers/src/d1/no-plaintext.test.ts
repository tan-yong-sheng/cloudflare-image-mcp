// ============================================================================
// D1 provider store tests - R1a (#71), no-plaintext tripwire
// ============================================================================
// Seam: (a) the shared secret scanner, proved by scanning a synthetic token
// so a green run means something; (b) the credential_versions column set;
// (c) the migration SQL itself. Catches a token column creeping into the
// schema or a literal token committed in a migration. Misses secrets in
// runtime code - R1b owns envelope encryption, and R2 (#74) reuses this
// scanner on admin-API fixtures.

import { describe, expect, test } from "vitest";
import { scanForSecrets } from "../test-utils/plaintext-scan.js";
import {
  columnsOf,
  freshDb,
  migrationFiles,
  migrationSql,
} from "../test-utils/migration-fixtures.js";

const CF_TOKEN = "v1.0-abcdef0123456789abcdef0123456789";

describe("secret scanner (plaintext tripwire)", () => {
  test("flags a Cloudflare-style token literal", () => {
    const sql = `INSERT INTO credential_versions VALUES ('${CF_TOKEN}');`;
    expect(scanForSecrets(sql).map((f) => f.pattern)).toContain("cf-api-token");
  });

  test("flags a long base64 blob in a string literal", () => {
    const sql =
      "INSERT INTO t VALUES ('QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=');";
    expect(scanForSecrets(sql).map((f) => f.pattern)).toContain(
      "long-string-literal"
    );
  });

  test("flags a bearer token header", () => {
    const sql = "Authorization: Bearer abcdefghij0123456789ABCDEFGHIJ";
    expect(scanForSecrets(sql).map((f) => f.pattern)).toContain("bearer-token");
  });

  test("masks findings so a real secret is never echoed", () => {
    for (const f of scanForSecrets(`VALUES ('${CF_TOKEN}')`)) {
      expect(f.masked).not.toContain("abcdef0123456789");
    }
  });

  test("reports the line a finding is on", () => {
    const findings = scanForSecrets(
      `line one\nline two\nVALUES ('${CF_TOKEN}')\n`
    );
    expect(findings.map((f) => f.line)).toEqual([3]);
  });

  test("ordinary SQL produces no findings", () => {
    const sql = "INSERT INTO providers (id) VALUES ('cloudflare');";
    expect(scanForSecrets(sql)).toEqual([]);
  });
});

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
