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
import { CLIENT_ASSET_DIR } from "./routes.js";

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

/** The `[assets]` table of a manifest, with quoted values unquoted. */
function assets(toml: string): Record<string, string> {
  const start = toml.search(/^[ \t]*\[assets\][ \t]*$/m);
  if (start < 0) return {};
  const table: Record<string, string> = {};
  for (const line of toml.slice(start).split("\n").slice(1)) {
    if (/^[ \t]*\[/.test(line)) break;
    const entry = /^[ \t]*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (entry) table[entry[1]] = entry[2].replace(/^"|"$/g, "");
  }
  return table;
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

/**
 * The value of a setting in the client's Vite config.
 *
 * A plain search over the file would be satisfied by a commented-out
 * value, and the first match could be an override that is not the one
 * in effect. Only a line that starts with the setting name carries a
 * value, and the setting has to be named exactly once, so neither a
 * comment nor a second occurrence can hide the value that counts.
 *
 * The client asserts the same contract against the effective build
 * configuration; this is the Worker's side of it, and it keeps the two
 * packages from drifting apart.
 */
function configValue(source: string, setting: string): string | undefined {
  const matches = [
    ...source.matchAll(
      new RegExp(`^\\s*${setting}\\s*:\\s*(?:"([^"]*)"|([^,\\s]+))`, "gm")
    ),
  ];
  if (matches.length !== 1) return undefined;
  return matches[0][1] ?? matches[0][2];
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

  test("both manifests serve the client from the same build output", () => {
    // The React client is deployed as Workers Static Assets. A local
    // manifest pointing somewhere else would make local dev serve a
    // different document than the one that is deployed.
    expect(assets(example)).toEqual(assets(generated));
    expect(assets(example)).toMatchObject({
      directory: "../client/dist",
      binding: "ASSETS",
      // The Worker answers the routes it owns and reaches the client's
      // files through the binding, so an unknown path keeps the Worker's
      // error envelope.
      not_found_handling: "none",
      run_worker_first: "true",
    });
  });

  test("the client build produces only what the Worker serves publicly", () => {
    // The Worker serves the client's bundle, stylesheet and fonts from
    // /assets/ before the auth gate, and everything else the client
    // asks for is the document. The build has to agree: a bundle
    // directory with another name leaves every bundle request 404ing,
    // and a file outside /assets/ is served by the Worker as an API
    // path — with API keys configured it answers 401, which reads as a
    // credential problem. Nothing else would say so.
    const viteConfig = read("client/vite.config.ts");
    expect(configValue(viteConfig, "assetsDir")).toBe(CLIENT_ASSET_DIR);
    // Vite copies a public directory to the root of the build output.
    // The build must not have one, or it can produce a file the Worker
    // would not serve.
    expect(configValue(viteConfig, "publicDir")).toBe("false");
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
