// ============================================================================
// One-shot import script tests - R1b (#72), slice E (option A)
// ============================================================================
// Seam: scripts/import-ai-accounts.mjs as a subprocess — blob JSON in via
// stdin, envelope-encrypted SQL out via stdout. Proves each blob entry
// becomes one provider_keys row plus one version-1 credential row, envelopes
// open with the same data key, and no plaintext token reaches the output.
// The script never touches D1 or the network; the operator pipes its output
// to wrangler d1 execute --file.

import { describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/import-ai-accounts.mjs"
);
const DATA_KEY = "import-script-test-key";

/** Run the script with blob JSON on stdin; resolves stdout, rejects on failure. */
function runScript(input: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`exit ${code}: ${stderr}`))
    );
    child.stdin.write(input);
    child.stdin.end();
  });
}

async function importBlob(blob: unknown): Promise<string> {
  return runScript(JSON.stringify(blob), {
    ...process.env,
    PROVIDER_DATA_KEY: DATA_KEY,
  });
}

describe("one-shot import script (E)", () => {
  test("each blob entry becomes a key row plus a version-1 envelope row", async () => {
    const sql = await importBlob([
      { account_id: "acc-1", api_token: "tok-1" },
      { account_id: "acc-2", api_token: "tok-2" },
    ]);
    expect(sql.match(/INSERT INTO provider_keys/g)?.length).toBe(2);
    expect(sql.match(/INSERT INTO credential_versions/g)?.length).toBe(2);
    expect(sql).toContain("version, envelope");
    for (const id of ["acc-1", "acc-2"]) {
      expect(sql).toContain(id);
    }
  });

  test("no plaintext token reaches the emitted SQL", async () => {
    const sql = await importBlob([{ account_id: "acc-1", api_token: "tok-1" }]);
    expect(sql).not.toContain("tok-1");
  });

  test("emitted envelopes open with the same data key", async () => {
    const sql = await importBlob([{ account_id: "acc-1", api_token: "tok-1" }]);
    const envelope = sql.match(/v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+/)?.[0];
    expect(envelope).toBeTruthy();
    const { openEnvelope } = await import("../services/provider-crypto.js");
    expect(await openEnvelope(envelope!, DATA_KEY)).toBe("tok-1");
  });

  test("empty blob emits a no-op with a comment, exit 0", async () => {
    const sql = await importBlob([]);
    expect(sql).toMatch(/-- no AI_ACCOUNTS entries/i);
  });

  test("emitted SQL bumps config_versions so warm isolates reload", async () => {
    // pool-cache.ts reloads its snapshot only when the version changes;
    // without the bump an isolate that booted before the import keeps its
    // stale snapshot for the isolate's life.
    const sql = await importBlob([{ account_id: "acc-1", api_token: "tok-1" }]);
    expect(sql).toContain("UPDATE config_versions");
    expect(sql).toContain("version = version + 1");
  });

  test("emitted SQL carries no explicit transaction wrapper", async () => {
    // The wrapper would break every documented apply command: wrangler's
    // local path forbids explicit transactions (workerd SQL API) and the
    // remote D1 import endpoint rejects them, while a failed import
    // already leaves the database at its original state.
    const sql = await importBlob([{ account_id: "acc-1", api_token: "tok-1" }]);
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\b/im);
  });

  test("malformed blob fails loudly without emitting SQL", async () => {
    await expect(
      runScript("not-json{", { ...process.env, PROVIDER_DATA_KEY: DATA_KEY })
    ).rejects.toThrow();
  });

  test("missing data key fails loudly without emitting SQL", async () => {
    const env = { ...process.env };
    delete env.PROVIDER_DATA_KEY;
    await expect(
      runScript(JSON.stringify([{ account_id: "a", api_token: "t" }]), env)
    ).rejects.toThrow();
  });
});
