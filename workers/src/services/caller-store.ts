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
import {
  ADMIN_ACTOR,
  AdminStoreError,
  bumpWrite,
  isUniqueViolation,
} from "./admin-store.js";
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
    // One atomic batch: the key row, the config-version bump (the same
    // reload signal the provider-key writes ride), and the audit row —
    // which resolves the fresh key id through the UNIQUE name inside the
    // SAME commit, so there is no crash window between key and audit.
    keyId = (
      await db.commit([
        insert,
        bumpWrite(),
        callerAuditWriteByName("caller_key_create", name),
      ])
    ).keyId;
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
  const update: AdminWrite = {
    sql:
      "UPDATE caller_keys " +
      "SET secret_hash = ?, prefix = ?, suffix = ?, updated_at = ? " +
      "WHERE id = ?",
    params: [hash, prefix, suffix, now, keyId],
  };
  // One atomic batch: the verifier swap (revoke-before-insert — the old
  // secret dies here), the bump, and the audit row, whose caller_key_id
  // resolves through a subselect so a key deleted mid-flight nulls it
  // instead of violating the foreign key.
  const commit = await db.commit([
    update,
    bumpWrite(),
    callerAuditWrite("caller_key_rotate", keyId, row.name),
  ]);
  if (commit.changes === 0) {
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

/** The mutation response shared by toggle/rename/delete. */
export interface CallerKeyMutationResult {
  key: {
    id: number;
    name: string;
    prefix: string;
    suffix: string;
    enabled: boolean;
    created_at: number;
    updated_at: number;
  };
  /**
   * Set when the mutation did NOT do what it appears to do: the key's
   * secret also lives in env.API_KEYS, so disabling or deleting the row
   * leaves the credential live through the legacy mirror until the deploy
   * itself drops it (#128, the resurrection check).
   */
  warning?: string;
}

/**
 * Toggle a caller key (#128): flip enabled without deleting.
 *
 * A disabled key stops authenticating but stays listed. The env-mirror
 * check runs on DISABLE only: enabling needs no warning, and a warning on
 * enable would be noise. The mutation is one atomic batch — flip, bump,
 * audit.
 */
export async function toggleCallerKey(
  db: AdminD1,
  keyId: number,
  envMirror?: (secretHash: string) => Promise<boolean>
): Promise<CallerKeyMutationResult> {
  const row = await db
    .prepare(
      "SELECT name, enabled, secret_hash, prefix, suffix, created_at " +
        "FROM caller_keys WHERE id = ?"
    )
    .bind(keyId)
    .first<{
      name: string;
      enabled: number;
      secret_hash: string;
      prefix: string;
      suffix: string;
      created_at: number;
    }>();
  if (!row) {
    throw new AdminStoreError(404, `unknown caller key ${keyId}`);
  }
  const now = Math.floor(Date.now() / 1000);
  const enabled = Number(row.enabled) !== 1;
  const commit = await db.commit([
    {
      sql: "UPDATE caller_keys SET enabled = ?, updated_at = ? WHERE id = ?",
      params: [enabled ? 1 : 0, now, keyId],
    },
    bumpWrite(),
    callerAuditWrite("caller_key_toggle", keyId, row.name),
  ]);
  if (commit.changes === 0) {
    throw new AdminStoreError(404, `unknown caller key ${keyId}`);
  }
  const warnings: string[] = [];
  // The env-mirror check runs on DISABLE only: enabling needs no warning,
  // and a warning on enable would be noise.
  if (!enabled && (await envMirror?.(row.secret_hash)) === true) {
    warnings.push(ENV_MIRROR_WARNING);
  }
  return {
    key: {
      id: keyId,
      name: row.name,
      prefix: row.prefix,
      suffix: row.suffix,
      enabled,
      created_at: Number(row.created_at),
      updated_at: now,
    },
    ...(warnings.length > 0 ? { warning: warnings.join(" ") } : {}),
  };
}

/**
 * Rename a caller key (#128): 1–120 characters, unique across keys.
 *
 * The name is the only thing that moves — the verifier, the secret's
 * life, and the enabled flag are untouched, so there is no env-mirror
 * warning to give: whatever the name says, the credential is unchanged.
 */
export async function renameCallerKey(
  db: AdminD1,
  keyId: number,
  rawName: string | undefined
): Promise<CallerKeyMutationResult> {
  const row = await db
    .prepare(
      "SELECT prefix, suffix, enabled, created_at " +
        "FROM caller_keys WHERE id = ?"
    )
    .bind(keyId)
    .first<{
      prefix: string;
      suffix: string;
      enabled: number;
      created_at: number;
    }>();
  if (!row) {
    throw new AdminStoreError(404, `unknown caller key ${keyId}`);
  }
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw new AdminStoreError(400, "name must be 1-120 characters");
  }
  const now = Math.floor(Date.now() / 1000);
  let commit: { changes?: number };
  try {
    // The name UNIQUE constraint is the duplicate check: a read-then-write
    // window cannot sneak a duplicate past it, and the violation maps to
    // the same 409 a create with that name would get.
    commit = await db.commit([
      {
        sql: "UPDATE caller_keys SET name = ?, updated_at = ? WHERE id = ?",
        params: [name, now, keyId],
      },
      bumpWrite(),
      callerAuditWrite("caller_key_rename", keyId, name),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminStoreError(409, `name '${name}' already exists`);
    }
    throw error;
  }
  if (commit.changes === 0) {
    throw new AdminStoreError(404, `unknown caller key ${keyId}`);
  }
  return {
    key: {
      id: keyId,
      name,
      prefix: row.prefix,
      suffix: row.suffix,
      enabled: Number(row.enabled) === 1,
      created_at: Number(row.created_at),
      updated_at: now,
    },
  };
}

/**
 * Delete a caller key (#128): hard delete, no undo, the audit stays.
 *
 * The batch order matters: the audit row is written BEFORE the delete (its
 * caller_key_id resolving through the still-present row), so the delete's
 * ON DELETE SET NULL leaves the trail in place with the link cut — the
 * history survives the key it describes.
 *
 * Deleting is allowed even for the last enabled key (spec #74 decision),
 * but the response says what that means: every caller is locked out until
 * a key is added or the deploy carries API_KEYS again.
 */
export async function deleteCallerKey(
  db: AdminD1,
  keyId: number,
  envMirror?: (secretHash: string) => Promise<boolean>
): Promise<{ deleted: true; id: number; warning?: string }> {
  const row = await db
    .prepare("SELECT name, enabled, secret_hash FROM caller_keys WHERE id = ?")
    .bind(keyId)
    .first<{ name: string; enabled: number; secret_hash: string }>();
  if (!row) {
    throw new AdminStoreError(404, `unknown caller key ${keyId}`);
  }
  // The DELETE leads the batch so the commit's changed-row count IS the
  // delete's count: a key deleted between the read and the commit changes
  // zero rows and answers 404 — the same ghost guarantee rotate/toggle/
  // rename make. The audit row is guarded by changes() (the SQL function
  // reads the preceding statement's count on the same connection), so a
  // ghost commits a bump but no audit row; a real delete lands the trail
  // — its caller_key_id resolving to NULL because the row is already gone,
  // which the ON DELETE SET NULL produced anyway.
  const commit = await db.commit([
    {
      sql: "DELETE FROM caller_keys WHERE id = ?",
      params: [keyId],
    },
    {
      sql:
        "INSERT INTO admin_audit (actor, action, provider_id, caller_key_id, key_label) " +
        "SELECT ?, 'caller_key_delete', NULL, " +
        "(SELECT id FROM caller_keys WHERE id = ?), ? WHERE changes() > 0",
      params: [ADMIN_ACTOR, keyId, row.name],
    },
    bumpWrite(),
  ]);
  if (commit.changes === 0) {
    throw new AdminStoreError(404, `unknown caller key ${keyId}`);
  }
  const warnings: string[] = [];
  if ((await envMirror?.(row.secret_hash)) === true) {
    warnings.push(ENV_MIRROR_WARNING);
  }
  const enabledLeft = await db
    .prepare("SELECT COUNT(*) AS n FROM caller_keys WHERE enabled = 1")
    .first<{ n: number }>();
  if ((enabledLeft?.n ?? 0) === 0) {
    warnings.push(LOCKOUT_WARNING);
  }
  return {
    deleted: true,
    id: keyId,
    ...(warnings.length > 0 ? { warning: warnings.join(" ") } : {}),
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

/** The warning a disable/delete carries when the credential survives in env. */
export const ENV_MIRROR_WARNING =
  "still live via API_KEYS — remove it from the deploy to revoke it";

/** The warning a delete carries when no enabled key is left behind. */
export const LOCKOUT_WARNING =
  "No enabled keys left — /v1 and /mcp now reject every caller until you add a key or the deploy carries API_KEYS again.";

/**
 * The caller-key audit row, written in the SAME batch as the mutation it
 * describes (per the provider-store idiom). The actor is the admin API —
 * bearer keys carry no identity (ADMIN_ACTOR), and provider_id is NULL
 * because a caller key belongs to no provider (migration 0007).
 *
 * The caller_key_id resolves through a subselect rather than a bound
 * parameter: a row deleted concurrently yields NULL, which satisfies the
 * foreign key, instead of violating it.
 */
function callerAuditWrite(
  action:
    | "caller_key_rotate"
    | "caller_key_toggle"
    | "caller_key_rename"
    | "caller_key_delete",
  keyId: number,
  label: string
): AdminWrite {
  return {
    sql:
      "INSERT INTO admin_audit (actor, action, provider_id, caller_key_id, key_label) " +
      "VALUES (?, ?, NULL, (SELECT id FROM caller_keys WHERE id = ?), ?)",
    params: [ADMIN_ACTOR, action, keyId, label],
  };
}

/** Create-time variant: the fresh id exists only inside this batch, so the
 * audit row resolves it through the UNIQUE name (the provider add idiom). */
function callerAuditWriteByName(
  action: "caller_key_create",
  name: string
): AdminWrite {
  return {
    sql:
      "INSERT INTO admin_audit (actor, action, provider_id, caller_key_id, key_label) " +
      "VALUES (?, ?, NULL, (SELECT id FROM caller_keys WHERE name = ?), ?)",
    params: [ADMIN_ACTOR, action, name, name],
  };
}
