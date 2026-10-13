// ============================================================================
// Deploy pipeline tests - R1a (#71), D1 binding + migration wiring
// ============================================================================
// Seam: .github/workflows/deploy-workers.yml as text. Proves the generated
// worker config carries the D1 binding from secrets and that migrations
// are applied through that same binding before the deploy - one stable
// handle, so "migrations applied to a different database than the one
// bound" cannot happen. Misses real D1 behavior (a red migration surfaces
// in CI, not here).

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

  test("binds a stable name resolved per environment", () => {
    // No database_name in the generated config: the binding (stable across
    // environments) resolves to each environment's database via its
    // database_id. Names stay an internal detail, so environments cannot
    // collide on one account and nothing can drift between binding and
    // migrate target.
    const toml = generatedWranglerToml();
    expect(toml).toContain('binding = "PROVIDER_DB"');
    expect(toml).not.toContain("database_name");
  });
});

describe("migrations run before deploy (R1a)", () => {
  test("applies D1 migrations remotely", () => {
    expect(WORKFLOW).toMatch(/wrangler d1 migrations apply[^\n]*--remote/);
  });

  test("worker secrets upload in one bulk call", () => {
    // One atomic upload instead of a put-per-secret: the next secret is
    // one env line, not a new if-block. Values arrive via env indirection
    // so none appear on the command line; unset optionals are omitted.
    const step = WORKFLOW.split("\n")
      .filter((l) => l.includes("npx wrangler secret"))
      .map((l) => l.trim());
    expect(step).toEqual([
      "' | npx wrangler secret bulk --name ${{ env.WORKERS_NAME }}",
    ]);
    for (const key of [
      "DEPLOYED_AT",
      "COMMIT_SHA",
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_TOKEN",
      "API_KEYS_VALUE",
      "AI_ACCOUNTS_VALUE",
      "PROVIDER_DATA_KEY_VALUE",
      "TZ_VALUE",
    ]) {
      expect(WORKFLOW).toContain(key);
    }
  });

  test("migrations apply through the same binding the config declares", () => {
    // The binding is the single handle for both: binding name here must
    // match the one generated into wrangler.toml, so config and migrate
    // target resolve to the same database by construction.
    const applyStep = WORKFLOW.split("\n").find((l) =>
      l.includes("wrangler d1 migrations apply")
    );
    expect(applyStep).toContain("PROVIDER_DB");
    expect(generatedWranglerToml()).toContain('binding = "PROVIDER_DB"');
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

  test("rejects a malformed database id before generating config", () => {
    // Env indirection stops shell injection, but the value lands in TOML:
    // a quote or newline could alter the generated config. D1 ids are
    // UUIDs, so the workflow enforces the shape before use.
    expect(WORKFLOW).toContain(
      "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    );
  });
});
