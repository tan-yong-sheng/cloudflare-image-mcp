// ============================================================================
// Local dev templates - the .example copies of the gitignored local manifests
// ============================================================================
// Seam: the repo files themselves, read from disk. `wrangler.toml` and
// `.dev.vars` are gitignored (CI generates the manifest at deploy time and
// .dev.vars is where wrangler reads local secrets), so a clone has nothing to
// run until it copies the templates. These guards keep the templates honest:
// the bindings must match what the deploy workflow generates, the secret names
// must exist on Env, and no value may look like a real credential.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const WORKERS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = join(WORKERS_DIR, "..");

function read(relativePath: string): string {
  return readFileSync(join(REPO_DIR, relativePath), "utf8");
}

/** `binding = "X"` names, in declaration order. */
function bindings(toml: string): string[] {
  return [...toml.matchAll(/^[ \t]*binding\s*=\s*"([^"]+)"/gm)].map(
    (m) => m[1]
  );
}

/** Keys declared under the `[vars]` table. */
function vars(toml: string): string[] {
  const start = toml.search(/^[ \t]*\[vars\][ \t]*$/m);
  if (start < 0) return [];
  const keys: string[] = [];
  for (const line of toml.slice(start).split("\n").slice(1)) {
    if (/^[ \t]*\[/.test(line)) break;
    const key = /^[ \t]*([A-Za-z0-9_]+)\s*=/.exec(line);
    if (key) keys.push(key[1]);
  }
  return keys;
}

/** The `main` entry point a manifest points at. */
function mainEntry(toml: string): string {
  return /^[ \t]*main\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? "";
}

/** The manifest body the deploy workflow writes into workers/wrangler.toml. */
function generatedManifest(workflow: string): string {
  const body = /cat > wrangler\.toml << EOF\n([\s\S]*?)\n\s*EOF/.exec(workflow);
  if (!body) {
    throw new Error(
      "deploy-workers.yml no longer contains the wrangler.toml heredoc"
    );
  }
  return body[1];
}

/** Field names of the Worker's `Env` interface. */
function envFields(types: string): string[] {
  const body = /export interface Env \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? "";
  return [...body.matchAll(/^\s*([A-Za-z0-9_]+)\??:/gm)].map((m) => m[1]);
}

/** Live `KEY=VALUE` lines from a dotenv file. */
function devVars(text: string): { key: string; value: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return {
        key: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim(),
      };
    });
}

describe("local dev templates", () => {
  const example = read("workers/wrangler.toml.example");
  const generated = generatedManifest(
    read(".github/workflows/deploy-workers.yml")
  );

  test("the local manifest configures what the Worker reads", () => {
    expect(mainEntry(example)).toBe("src/index.ts");
    expect(bindings(example)).toEqual(
      expect.arrayContaining(["IMAGE_BUCKET", "PROVIDER_DB"])
    );
    expect(vars(example)).toContain("IMAGE_EXPIRY_HOURS");
  });

  test("the local manifest stays in step with the manifest CI generates", () => {
    // A binding renamed in one place and not the other would leave local dev
    // serving an Env the Worker cannot use.
    expect(bindings(example).sort()).toEqual(bindings(generated).sort());
    expect(vars(example).sort()).toEqual(vars(generated).sort());
    expect(mainEntry(example)).toBe(mainEntry(generated));
  });

  test("the local secrets template names only variables the Worker reads", () => {
    const documented = devVars(read("workers/.dev.vars.example"));
    const known = envFields(read("workers/src/types.ts"));
    for (const { key } of documented) {
      expect(known, key).toContain(key);
    }
    // The secrets the local gates depend on must be documented, not implied.
    expect(documented.map((entry) => entry.key)).toEqual(
      expect.arrayContaining(["API_KEYS", "ADMIN_API_KEY", "PROVIDER_DATA_KEY"])
    );
  });

  test("the secrets template documents no env fallback for credentials", () => {
    // ADR-001: inference credentials are database-only. These names still
    // exist on Env as deprecated fields, so the subset check above would not
    // catch them coming back — this pins the removal.
    const documented = devVars(read("workers/.dev.vars.example")).map(
      (entry) => entry.key
    );
    for (const fallback of [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ACCOUNT_ID",
      "AI_ACCOUNTS",
    ]) {
      expect(documented, `${fallback} is not read by the Worker`).not.toContain(
        fallback
      );
    }
  });

  test("no value in the local secrets template looks like a real credential", () => {
    for (const { key, value } of devVars(read("workers/.dev.vars.example"))) {
      // An empty value can hold nothing sensitive; everything else must read
      // as a placeholder, so a pasted token fails here.
      if (value.length === 0) continue;
      expect(value, `${key} must stay a placeholder`).toMatch(
        /local-dev|local-only|placeholder|change-me|example/i
      );
    }
  });
});
