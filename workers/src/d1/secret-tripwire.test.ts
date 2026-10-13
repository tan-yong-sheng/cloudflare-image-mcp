// ============================================================================
// Repo secret tripwire - R1a (#71), shared no-plaintext scanner
// ============================================================================
// Seam: the scanner module plus the repo's own config surface. The ledger
// gate (no-plaintext.test.ts) owns store properties; this file owns the
// scanner's contract: synthetic-positive coverage plus a calibration test
// pinning zero findings on real repo files, so widening detection into
// noise fails loudly. R2 (#74) reuses scanForSecrets on admin-API fixtures.

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanForSecrets } from "../test-utils/plaintext-scan.js";

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

  test("flags an all-alphabetic bearer credential", () => {
    // The narrow bearer pattern must not be filtered by the digit heuristic:
    // a credential need not contain a digit to be a credential.
    const alphabetic = "abcdefghijklmnopqrstuvwxyzabcdefghij";
    expect(
      scanForSecrets(`Authorization: Bearer ${alphabetic}`).map(
        (f) => f.pattern
      )
    ).toContain("bearer-token");
  });

  test("flags a JWT-shaped literal (dotted, not base64)", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(
      scanForSecrets(`Authorization: '${jwt}'`).map((f) => f.pattern)
    ).toContain("long-string-literal");
  });

  test("flags an unquoted assignment value", () => {
    expect(
      scanForSecrets("API_KEY=QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo").map(
        (f) => f.pattern
      )
    ).toContain("assignment-value");
  });

  test("does not read ordinary URLs as secrets", () => {
    const md =
      "See https://raw.githubusercontent.com/cloudflare/workers-sdk/wrangler/main/README for details";
    expect(scanForSecrets(md)).toEqual([]);
  });

  test("flags a quoted base64 secret that contains slashes", () => {
    // Slashes are only path evidence in a key/value context; inside a quoted
    // literal they are ordinary base64 and must not suppress detection.
    const b64 = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5MA==";
    const withSlash = `${b64.slice(0, 20)}/abcdefghij0123456789`;
    expect(
      scanForSecrets(`token = "${withSlash}"`).map((f) => f.pattern)
    ).toContain("long-string-literal");
  });

  test("ordinary SQL produces no findings", () => {
    const sql = "INSERT INTO providers (id) VALUES ('cloudflare');";
    expect(scanForSecrets(sql)).toEqual([]);
  });
});

test("the repo's own config stays clean (scanner calibration)", () => {
  // A tripwire that fires on ordinary config gets switched off, which is
  // worse than not having one. Lock the calibration against real files:
  // these must produce no findings, so detection cannot be widened into
  // noise without this test failing.
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const files = [
    ".github/workflows/deploy-workers.yml",
    ".github/workflows/pr-checks.yml",
    "docs/DEPLOY.md",
    "CONTRIB.md",
  ];
  for (const rel of files) {
    const text = readFileSync(join(repoRoot, rel), "utf8");
    expect(scanForSecrets(text), `unexpected finding in ${rel}`).toEqual([]);
  }
});
