#!/usr/bin/env node
// ============================================================================
// One-shot AI_ACCOUNTS import - legacy blob into D1 (R1b, #72, option A)
// ============================================================================
// Operator-run, once per environment. Reads the legacy JSON blob from stdin,
// seals each token with PROVIDER_DATA_KEY, and writes envelope-encrypted SQL
// to stdout. Never touches D1 or the network; the operator verifies the SQL
// and pipes it to wrangler themselves:
//
//   echo "$AI_ACCOUNTS" | PROVIDER_DATA_KEY=<key> \
//     node scripts/import-ai-accounts.mjs > /tmp/import.sql
//   wrangler d1 migrations apply <db> --remote   # schema first
//   wrangler d1 execute <db> --remote --file /tmp/import.sql
//
// Rollback is "empty the tables / Time Travel" per #72. Re-running against
// an already-imported database fails on the UNIQUE label/version guards
// rather than duplicating rows — import twice is an error, not a merge.

// NOTE: the AES-GCM codec below is intentionally self-contained rather than
// imported from workers/src/services/provider-crypto.ts: plain node cannot
// resolve that module's .js specifiers to .ts sources, and a build step for
// a run-once operator script is worse than ~30 duplicated lines. Divergence
// fails loudly — the test suite seals here and opens via the canonical
// module (import-script.test.ts: "emitted envelopes open with the same
// data key").

const ENVELOPE_VERSION = "v1";

function b64encode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function importKey(keyMaterial) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`provider-envelope-v1:${keyMaterial}`)
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function sealToken(token, keyMaterial) {
  const key = await importKey(keyMaterial);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token)
  );
  return `${ENVELOPE_VERSION}.${b64encode(iv.buffer)}.${b64encode(ciphertext)}`;
}

function fail(message) {
  console.error(`import-ai-accounts: ${message}`);
  process.exit(1);
}

/** SQL string literal escaping: single quotes double. */
function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const keyMaterial = process.env.PROVIDER_DATA_KEY;
  if (!keyMaterial) fail("PROVIDER_DATA_KEY is not set");

  let blob;
  try {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    blob = JSON.parse(input);
  } catch {
    fail("stdin is not valid JSON (expected the AI_ACCOUNTS array)");
  }
  if (!Array.isArray(blob)) fail("stdin must be a JSON array");

  const entries = blob.filter((a) => a?.account_id && a?.api_token);
  if (entries.length === 0) {
    console.log("-- no AI_ACCOUNTS entries to import");
    return;
  }

  const out = [
    "-- One-shot AI_ACCOUNTS import (R1b). Verify, then apply with:",
    "--   wrangler d1 execute <db> --remote --file <this file>",
    "-- Envelopes sealed with PROVIDER_DATA_KEY; tokens never appear below.",
    "BEGIN;",
  ];
  for (let i = 0; i < entries.length; i++) {
    const { account_id, api_token } = entries[i];
    const label = `imported-${i + 1}`;
    const envelope = await sealToken(api_token, keyMaterial);
    out.push(
      `INSERT INTO provider_keys (provider_id, label, external_account_id) VALUES ('cloudflare', ${quote(label)}, ${quote(account_id)});`
    );
    out.push(
      `INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) VALUES ((SELECT id FROM provider_keys WHERE label = ${quote(label)}), 1, ${quote(envelope)}, 'one-shot-import');`
    );
  }
  out.push("COMMIT;");
  console.log(out.join("\n"));
}

await main();
