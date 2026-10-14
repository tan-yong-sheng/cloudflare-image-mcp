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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const WORKFLOW = readFileSync(
  join(REPO_ROOT, ".github/workflows/deploy-workers.yml"),
  "utf8"
);
const TERRAFORM_WORKFLOW = readFileSync(
  join(REPO_ROOT, ".github/workflows/terraform.yml"),
  "utf8"
);

/**
 * Files under terraform/ that are safe to keep in git: local plugin cache,
 * local state, generated tfvars, and plan output are exactly the .gitignore
 * entries for Terraform, so skipping them mirrors the boundary.
 */
function versionedTerraformFiles(): string[] {
  const skipFile = (name: string) =>
    name === "terraform.tfvars" ||
    name === "tfplan" ||
    name === "plan.json" ||
    name.endsWith(".tfstate") ||
    name.endsWith(".tfstate.backup") ||
    name.endsWith(".tfplan");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === ".terraform" || skipFile(name)) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(join(REPO_ROOT, "terraform"));
  return out;
}

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

// ============================================================================
// Terraform static-gate wiring - TF1 (#84)
// ============================================================================
// Seam: .github/workflows/terraform.yml plus the per-environment roots it
// gates. Proves the gate is no-apply, credential-free where it must be,
// credential-gated where it cannot be, and that each environment root binds
// exactly one remote-state workspace - so a staging gate can never plan the
// production store or vice versa.

describe("Terraform static gate (TF1, #84)", () => {
  test("static gate: fmt, init without backend, and validate per root", () => {
    // The credential-free analogue of typecheck: no provider login, no
    // backend connectivity - every check must be one that passes on a bare
    // checkout with the committed lock files.
    expect(TERRAFORM_WORKFLOW).toContain("fmt -check");
    expect(TERRAFORM_WORKFLOW).toContain("init -backend=false");
    expect(TERRAFORM_WORKFLOW).toContain("validate");
    expect(TERRAFORM_WORKFLOW).toContain("terraform/staging");
    expect(TERRAFORM_WORKFLOW).toContain("terraform/production");
  });

  test("plan gate is no-apply: it plans, never applies", () => {
    expect(TERRAFORM_WORKFLOW).toMatch(/plan -input=false/);
    expect(TERRAFORM_WORKFLOW).not.toContain("terraform apply");
  });

  test("the plan gate fails loudly on destroys, passes only on zero destroys", () => {
    // The zero-destroy evidence: the gate inspects the plan JSON and fails
    // on any "delete" action, not merely on the plan's exit code.
    expect(TERRAFORM_WORKFLOW).toContain('"delete" in');
    expect(TERRAFORM_WORKFLOW).toContain("zero-destroy gate FAILED");
  });

  test("the plan gate skips loudly, not silently, when credentials are absent", () => {
    // Offline planning is impossible with a declared remote backend, so an
    // uncredentialed run cannot produce evidence. It must say so on the
    // workflow log - a quiet green would fake the zero-destroy proof.
    expect(TERRAFORM_WORKFLOW).toContain("credential-gated");
    expect(TERRAFORM_WORKFLOW).toContain("::notice::");
  });

  test("secrets and variables reach the workflow only through env mapping", () => {
    // Same invariant as the D1 binding above: ${{ secrets.* }} / vars.* in a
    // run: body is substituted before the shell parses it; env mapping is
    // the only safe form.
    const refs = TERRAFORM_WORKFLOW.split("\n").filter(
      (l) => l.includes("${{ secrets.") || l.includes("${{ vars.")
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.trim()).toMatch(
        /^[A-Z0-9_]+: \$\{\{ (secrets|vars)\.[A-Z0-9_]+ \}\}$/
      );
    }
  });

  test("no hardcoded UUIDs in any versioned Terraform file", () => {
    // Live database IDs are import arguments, never committed values: a
    // literal UUID here would outlive the database it names and poison the
    // import. tfvars.example ships empty placeholders.
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    for (const file of versionedTerraformFiles()) {
      expect(readFileSync(file, "utf8").match(uuid), file).toBeNull();
    }
    expect(TERRAFORM_WORKFLOW.match(uuid)).toBeNull();
  });

  test("each environment root binds exactly one remote-state workspace", () => {
    // Per-environment isolation (spec #83): static workspace string per
    // root, distinct per environment, so no single value can address both
    // stores - a staging gate or apply cannot reach the production state.
    const staging = readFileSync(
      join(REPO_ROOT, "terraform/staging/main.tf"),
      "utf8"
    );
    const production = readFileSync(
      join(REPO_ROOT, "terraform/production/main.tf"),
      "utf8"
    );
    for (const [root, own, other] of [
      [
        staging,
        "cloudflare-image-mcp-staging",
        "cloudflare-image-mcp-production",
      ],
      [
        production,
        "cloudflare-image-mcp-production",
        "cloudflare-image-mcp-staging",
      ],
    ] as const) {
      expect(root).toContain(`workspace    = "${own}"`);
      expect(root).not.toContain(other);
    }
  });

  test("the provider is pinned, not floating", () => {
    // An unpinned provider would let the gate pass against one binary and
    // drift to another. Both roots pin the same exact version.
    for (const root of ["staging", "production"]) {
      const main = readFileSync(
        join(REPO_ROOT, `terraform/${root}/main.tf`),
        "utf8"
      );
      expect(main).toMatch(/version\s*=\s*"=\s*\d+\.\d+\.\d+"/);
    }
  });
});
