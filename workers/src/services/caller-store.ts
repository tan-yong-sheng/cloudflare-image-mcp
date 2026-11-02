// ============================================================================
// Caller-key store - the keys that authenticate requests to this Worker
// ============================================================================
// A caller key is the bearer token a client sends in `Authorization: Bearer`
// to reach /v1/* and /mcp*. It is a different kind of secret from a provider
// credential: a provider credential is OPENED at request time (the Worker
// authenticates to Cloudflare with it), while a caller key is only ever
// COMPARED. So it is stored as a verifier, not as an envelope.
//
// The store owns the read side and the create path: the workbench lists
// caller keys by name and masked value, and the create path (#126) turns a
// name plus an optional operator secret into a row. The secret never leaves
// the server — except once, in the 201 the create returns, because a
// one-way verifier cannot reproduce it later. The mask is composed here
// rather than in the browser, for the same reason the provider-key health
// route composes its hint server-side: the client never holds the
// material, so it cannot be the thing that decides what may be shown.
//
// Reads live in the store so the endpoint contains zero SQL. The D1 seam
// (AdminD1) is reused from the provider-key store rather than duplicated:
// both are the same engine surface, and the endpoint already holds one.

import type { AdminD1, AdminWrite } from "./admin-store.js";
import { AdminStoreError, isUniqueViolation } from "./admin-store.js";
import { generateCallerSecret } from "./caller-crypto.js";

/**
 * The prefix of every secret this Worker generates, and the prefix an
 * operator-supplied secret must not claim ("sk-mgmt-" is reserved — a
 * brought key must never be mistakable for one of ours).
 */
export const GENERATED_CALLER_PREFIX = "sk-mgmt-";

/** Operator secrets are 8–256 printable ASCII characters with no spaces. */
const MIN_OPERATOR_SECRET_LENGTH = 8;
const MAX_OPERATOR_SECRET_LENGTH = 256;

/** Key names are 1–120 characters. */
const MAX_NAME_LENGTH = 120;

/** Printable ASCII without space: the operator-secret character set. */
const OPERATOR_SECRET_PATTERN = /^[\x21-\x7e]+$/;

/**
 * A caller key as the workbench lists it.
 *
 * `maskedKey` is the only form of the secret the client ever sees. The
 * secret itself is never in a response — not on create, not on rotate,
 * not on a read.
 */
export interface CallerKeySummary {
  id: number;
  name: string;
  /** The masked hint, e.g. `sk-mgmt-…a1b2`. */
  maskedKey: string;
  enabled: boolean;
  /** Unix seconds. */
  createdAt: number;
  /** Unix seconds. */
  updatedAt: number;
}

/**
 * Compose the masked hint from the pieces kept beside the verifier.
 *
 * A key the server generated carries its prefix ("sk-mgmt-"), so the hint
 * shows the family the key belongs to. A key the operator brought has no
 * prefix of ours to claim, so the hint starts at the ellipsis.
 *
 * The suffix is empty when the secret was too short for a hint to be safe;
 * the mask then shows the ellipsis alone rather than half the secret.
 *
 * The separator is an ellipsis, per the caller-key design
 * (design-plans/007-api-key-management.md) and the magpie UI it was
 * researched from. Provider tokens mask with stars instead
 * (maskToken): a provider credential and a caller key are different
 * secrets for different jobs, and each table carries its own hint style.
 */
export function maskCallerKey(prefix: string, suffix: string): string {
  return prefix.length > 0 ? `${prefix}…${suffix}` : `…${suffix}`;
}

/**
 * Every caller key, oldest first.
 *
 * The list carries no verifier: the client is told which keys exist, what
 * they are called, and whether they are enabled — never the material that
 * would let it use one.
 */
export async function listCallerKeys(db: AdminD1): Promise<CallerKeySummary[]> {
  const result = await db
    .prepare(
      "SELECT id, name, prefix, suffix, enabled, created_at, updated_at " +
        "FROM caller_keys ORDER BY id"
    )
    .all<Record<string, unknown>>();
  const rows = result.results ?? [];
  return rows.map((row) => ({
    id: Number(row["id"]),
    name: String(row["name"]),
    maskedKey: maskCallerKey(
      String(row["prefix"] ?? ""),
      String(row["suffix"] ?? "")
    ),
    enabled: Number(row["enabled"]) === 1,
    createdAt: Number(row["created_at"] ?? 0),
    updatedAt: Number(row["updated_at"] ?? 0),
  }));
}

/** The key half of the create response — never the verifier, never the salt. */
export interface CreatedCallerKey {
  key: {
    id: number;
    name: string;
    prefix: string;
    suffix: string;
    enabled: boolean;
    /** Unix seconds. */
    created_at: number;
  };
  /**
   * The plaintext, returned exactly once, in the 201 that created the key.
   * It is not stored — the row holds the verifier — so it can never be
   * served again; a lost secret is rotated, not revealed.
   */
  secret: string;
}

export interface CreateCallerKeyInput {
  /** 1–120 characters; absent or blank defaults to "Key N". */
  name?: string;
  /**
   * The operator's own secret (8–256 printable ASCII, no spaces, not
   * starting the reserved prefix). Absent or blank — the server generates.
   */
  secret?: string;
}

/**
 * Create a caller key (#126).
 *
 * The verifier callback is injected the way the provider store's seal is:
 * secret material is turned into its verifier here, inside the request
 * that carries it, and the plaintext is never persisted. The INSERT is a
 * single atomic statement — the audit and config-version writes join this
 * batch when the mutation paths land (#128).
 *
 * Uniqueness is enforced by the schema (the name UNIQUE constraint and the
 * uq_caller_keys_hash index) and mapped to 409 here, so a duplicate can
 * never slip through a read-then-write race.
 */
export async function createCallerKey(
  db: AdminD1,
  verifier: (secret: string) => Promise<string>,
  input: CreateCallerKeyInput
): Promise<CreatedCallerKey> {
  if (input.name !== undefined && typeof input.name !== "string") {
    throw new AdminStoreError(400, "name must be a string");
  }
  if (input.secret !== undefined && typeof input.secret !== "string") {
    throw new AdminStoreError(400, "secret must be a string");
  }
  const name = await resolveCallerKeyName(db, input.name);
  const brought = input.secret !== undefined && input.secret.length > 0;
  if (brought) validateOperatorSecret(input.secret as string);
  const secret = brought ? (input.secret as string) : generateCallerSecret();
  const hash = await verifier(secret);
  const now = Math.floor(Date.now() / 1000);
  // Masking decision (#126): last-4 for both key kinds, the spec default.
  // The columns are length-agnostic, so a move to last-6 for generated
  // keys is a one-line change here.
  const prefix = brought ? "" : GENERATED_CALLER_PREFIX;
  const suffix = secret.slice(-4);
  const insert: AdminWrite = {
    sql:
      "INSERT INTO caller_keys " +
      "(name, secret_hash, prefix, suffix, enabled, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, 1, ?, ?)",
    params: [name, hash, prefix, suffix, now, now],
  };
  let keyId: number | null;
  try {
    keyId = (await db.commit([insert])).keyId;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("secret_hash")) {
        // One secret is one key: the same verifier is already stored.
        throw new AdminStoreError(
          409,
          "that secret is already used by another key"
        );
      }
      throw new AdminStoreError(409, `name '${name}' already exists`);
    }
    throw error;
  }
  // The id comes back from the atomic commit; the read is the same
  // belt-and-braces fallback addProviderKey uses for an engine that
  // reports no row id. A failure here happens only AFTER the insert
  // landed, so it is retried, never reported as a failed create the
  // caller would repeat into a duplicate 409.
  let id: number | undefined = typeof keyId === "number" ? keyId : undefined;
  for (let attempt = 0; attempt < 3 && id === undefined; attempt++) {
    try {
      const row = await db
        .prepare("SELECT id FROM caller_keys WHERE name = ?")
        .bind(name)
        .first<{ id: number }>();
      if (row?.id !== undefined) {
        id = row.id;
        break;
      }
    } catch {
      // Transient read failure after successful commit; retry.
    }
  }
  if (id === undefined) {
    throw new AdminStoreError(
      500,
      `key committed successfully but id resolution for '${name}' failed; query health to verify`
    );
  }
  return {
    key: { id, name, prefix, suffix, enabled: true, created_at: now },
    secret,
  };
}

/**
 * Rotate a caller key (#127): a new generated secret, the old one dead the
 * moment this lands.
 *
 * Revoke-before-insert in a single UPDATE: the row holds ONE verifier, and
 * the statement replaces it — there is no window in which both secrets
 * authenticate, and there is no versions table to prune. The key's id,
 * name, enabled flag and created_at are preserved; prefix/suffix follow
 * the new secret (a rotated operator key becomes a generated one — the
 * operator's old phrasing is gone with the secret it described).
 *
 * The existence check is the read (404 before writing), and the UPDATE's
 * own changes count re-checks it: a key deleted between read and write
 * changes zero rows and still answers 404 rather than a 200 for a ghost.
 */
export async function rotateCallerKey(
  db: AdminD1,
  keyId: number,
  verifier: (secret: string) => Promise<string>
): Promise<CreatedCallerKey> {
  const row = await db
    .prepare("SELECT name, enabled, created_at FROM caller_keys WHERE id = ?")
    .bind(keyId)
    .first<{ name: string; enabled: number; created_at: number }>();
  if (!row) {
    throw new AdminStoreError(404, `unknown caller key ${keyId}`);
  }
  const secret = generateCallerSecret();
  const hash = await verifier(secret);
  const now = Math.floor(Date.now() / 1000);
  const prefix = GENERATED_CALLER_PREFIX;
  const suffix = secret.slice(-4);
  const result = (await db
    .prepare(
      "UPDATE caller_keys " +
        "SET secret_hash = ?, prefix = ?, suffix = ?, updated_at = ? " +
        "WHERE id = ?"
    )
    .bind(hash, prefix, suffix, now, keyId)
    .run()) as { meta?: { changes?: number } };
  if ((result.meta?.changes ?? 0) === 0) {
    throw new AdminStoreError(404, `unknown caller key ${keyId}`);
  }
  return {
    key: {
      id: keyId,
      name: row.name,
      prefix,
      suffix,
      enabled: Number(row.enabled) === 1,
      created_at: Number(row.created_at),
    },
    secret,
  };
}

/**
 * Resolve the create name: blank or absent defaults to "Key N" (N is one
 * past the current row count — a race that lands two defaults together
 * fails the UNIQUE constraint and surfaces as a 409, never a silent dup).
 */
async function resolveCallerKeyName(
  db: AdminD1,
  raw: string | undefined
): Promise<string> {
  const name = (raw ?? "").trim();
  if (name.length === 0) {
    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM caller_keys")
      .first<{ n: number }>();
    return `Key ${(row?.n ?? 0) + 1}`;
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new AdminStoreError(400, "name must be 1-120 characters");
  }
  return name;
}

/** The operator-supplied-secret rules, in the order an operator can act on. */
function validateOperatorSecret(secret: string): void {
  if (
    secret.length < MIN_OPERATOR_SECRET_LENGTH ||
    secret.length > MAX_OPERATOR_SECRET_LENGTH
  ) {
    throw new AdminStoreError(
      400,
      `secret must be ${MIN_OPERATOR_SECRET_LENGTH}-${MAX_OPERATOR_SECRET_LENGTH} characters`
    );
  }
  if (!OPERATOR_SECRET_PATTERN.test(secret)) {
    throw new AdminStoreError(
      400,
      "secret must be printable ASCII with no spaces"
    );
  }
  if (secret.startsWith(GENERATED_CALLER_PREFIX)) {
    throw new AdminStoreError(
      400,
      `secret must not start with the reserved prefix ${GENERATED_CALLER_PREFIX}`
    );
  }
}
