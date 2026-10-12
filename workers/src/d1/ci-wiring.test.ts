// ============================================================================
// Deploy pipeline tests - R1a (#71), D1 binding + migration wiring
// ============================================================================
// Seam: .github/workflows/deploy-workers.yml as text. Proves the generated
// worker config carries the D1 binding from secrets and that migrations
// are applied before the deploy, against the same database the binding
// names. Asserts step order and name agreement - the drift these catch is
// "migrations applied to a different database than the one bound".
// Misses real D1 behavior (a red migration surfaces in CI, not here).

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const WORKFLOW = readFileSync(
  join(REPO_ROOT, ".github/workflows/deploy-workers.yml"),
  "utf8"
);

/**
 * The generated worker config: the body of the wrangler.toml heredoc.
 * Line-based because the heredoc terminator is indented in the workflow.
 */
function generatedWranglerToml(): string {
  const lines = WORKFLOW.split("\n");
  const start = lines.findIndex((l) => l.includes("cat > wrangler.toml"));
  expect(start).toBeGreaterThan(-1);
  const end = lines.findIndex((l, i) => i > start && l.trim() === "EOF");
  expect(end).toBeGreaterThan(start);
  return lines.slice(start, end).join("\n");
}

describe("D1 binding in the generated worker config (R1a)", () => {
  test("declares a D1 database block", () => {
    expect(generatedWranglerToml()).toContain("[[d1_databases]]");
  });

  test("takes the database id from a secret, never a literal", () => {
    const toml = generatedWranglerToml();
    // Shell variable, not an inline ${{ secrets.* }} substitution.
    expect(toml).toContain('database_id = "$D1_DATABASE_ID"');
  });

  test("the database id secret reaches scripts only through env", () => {
    // An inline ${{ secrets.* }} inside a run: body is substituted before
    // bash parses it, so a value carrying shell metacharacters could alter
    // execution. Every reference must be an env mapping.
    const refs = WORKFLOW.split("\n").filter((l) =>
      l.includes("${{ secrets.D1_DATABASE_ID }}")
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.trim()).toMatch(
        /^D1_DATABASE_ID: \$\{\{ secrets\.D1_DATABASE_ID \}\}$/
      );
    }
  });

  test("names a database and a stable binding", () => {
    const toml = generatedWranglerToml();
    expect(toml).toContain('binding = "PROVIDER_DB"');
    expect(toml).toContain('database_name = "$D1_DATABASE_NAME"');
  });
});

describe("migrations run before deploy (R1a)", () => {
  test("applies D1 migrations remotely", () => {
    expect(WORKFLOW).toMatch(/wrangler d1 migrations apply[^\n]*--remote/);
  });

  test("one database name feeds both the binding and the apply", () => {
    // Single source for the name: the bound database and the migration
    // target cannot drift apart, which would apply migrations to a
    // database the Worker never talks to.
    const lines = WORKFLOW.split("\n");
    const definitions = lines.filter((l) =>
      l.includes('echo "D1_DATABASE_NAME=')
    );
    expect(definitions).toHaveLength(1);
    // Content, not column offsets: re-indenting the step must not fail the suite.
    expect(definitions[0]).toMatch(
      /echo "D1_DATABASE_NAME=[a-z0-9-]+" >> \$GITHUB_ENV/
    );
    const applyStep = lines.find((l) =>
      l.includes("wrangler d1 migrations apply")
    );
    expect(applyStep).toContain("$D1_DATABASE_NAME");
  });

  test("the migrate step precedes the deploy step", () => {
    const migrateAt = WORKFLOW.indexOf("wrangler d1 migrations apply");
    const deployAt = WORKFLOW.indexOf("npx wrangler deploy");
    expect(migrateAt).toBeGreaterThan(-1);
    expect(deployAt).toBeGreaterThan(-1);
    expect(migrateAt).toBeLessThan(deployAt);
  });

  test("fails loudly when the database id secret is missing", () => {
    // Fail fast beats shipping a worker bound to a database that does not
    // exist: the binding and the migration target come from one secret.
    expect(WORKFLOW).toContain("D1_DATABASE_ID");
    expect(WORKFLOW).toContain('if [ -z "$D1_DATABASE_ID" ]');
  });
});
