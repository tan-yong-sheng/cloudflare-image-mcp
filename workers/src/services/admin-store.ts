// ============================================================================
// Provider admin store - key mutations against D1 (R2, #74)
// ============================================================================
// Pure SQL behind the AdminD1 interface: D1Database satisfies it
// structurally in production; the S2 harness adapts node:sqlite to the
// same calls and runs these exact statements against the real migrations.
// Takes sealed envelopes only — token material never reaches this module
// (sealing happens in the request handlers, which hold PROVIDER_DATA_KEY).
// Every mutation is one atomic batch: the credential write, the
// config_versions bump (the pool cache's reload signal — same row the
// one-shot import bumps), and the admin_audit row (actor/action/key).
// The actor is the admin API itself: bearer keys carry no identity, so a
// constant is honest where a forged user would be a lie.

/** Bound-statement surface the store needs. */
export interface BoundStmt {
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

/** Minimal D1 surface: prepare/bind reads plus atomic multi-write batch. */
export interface AdminD1 {
  prepare(sql: string): BoundStmt & {
    bind(...params: unknown[]): BoundStmt;
  };
  commit(writes: readonly AdminWrite[]): Promise<void>;
}

/** A bound write the store hands to the engine for atomic commit. */
export interface AdminWrite {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** The admin API itself, acting through the bearer+management-key gates. */
export const ADMIN_ACTOR = "admin-api";

export class AdminStoreError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface AddKeyInput {
  providerId: string;
  label: string;
  apiToken: string;
}

export interface KeySummary {
  id: number;
  label: string;
  providerId: string;
  activeVersion: number | null;
}

interface KeyRow {
  id: number;
  provider_id: string;
  label: string;
}

function write(sql: string, ...params: unknown[]): AdminWrite {
  return { sql, params };
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function keyRow(db: AdminD1, keyId: number): Promise<KeyRow | null> {
  return db
    .prepare("SELECT id, provider_id, label FROM provider_keys WHERE id = ?")
    .bind(keyId)
    .first<KeyRow>();
}

async function providerExists(
  db: AdminD1,
  providerId: string
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS one FROM providers WHERE id = ?")
    .bind(providerId)
    .first<{ one: number }>();
  return row !== null;
}

function bumpWrite(): AdminWrite {
  return write(
    "UPDATE config_versions SET version = version + 1, " +
      "updated_at = unixepoch() WHERE id = 1"
  );
}

function auditWrite(
  action: "add" | "rotate" | "disable",
  providerId: string,
  keyId: number | null,
  label: string
): AdminWrite {
  return write(
    "INSERT INTO admin_audit (actor, action, provider_id, key_id, key_label) " +
      "VALUES (?, ?, ?, ?, ?)",
    ADMIN_ACTOR,
    action,
    providerId,
    keyId,
    label
  );
}

/** D1 + SQLite agree on these constraint-failure spellings. */
const UNIQUE_PATTERNS = [
  /UNIQUE constraint failed/i,
  /UNIQUE violation/i,
  /unique constraint/i,
  /duplicate key/i,
  /already exists/i,
];
function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return UNIQUE_PATTERNS.some((p) => p.test(message));
}

/**
 * Add a key: version-1 envelope row for a new label. The version INSERT
 * resolves the fresh key id through the UNIQUE label (same idiom as the
 * one-shot import) so the whole mutation — key, version, bump, audit —
 * commits atomically with no read-your-write round trip.
 */
export async function addProviderKey(
  db: AdminD1,
  seal: (token: string) => Promise<string>,
  input: AddKeyInput
): Promise<KeySummary> {
  const providerId = clean(input.providerId);
  const label = clean(input.label);
  const apiToken = clean(input.apiToken);
  if (!providerId) throw new AdminStoreError(400, "providerId is required");
  if (!label) throw new AdminStoreError(400, "label is required");
  if (!apiToken) throw new AdminStoreError(400, "apiToken is required");
  if (!(await providerExists(db, providerId))) {
    throw new AdminStoreError(400, `unknown provider '${providerId}'`);
  }
  const envelope = await seal(apiToken);
  const writes: AdminWrite[] = [
    write(
      "INSERT INTO provider_keys (provider_id, label) VALUES (?, ?)",
      providerId,
      label
    ),
    write(
      "INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) " +
        "VALUES ((SELECT id FROM provider_keys WHERE label = ?), 1, ?, ?)",
      label,
      envelope,
      ADMIN_ACTOR
    ),
    bumpWrite(),
  ];
  try {
    // The key id for the audit row comes from INSIDE the same commit:
    // insert first (no audit yet), read the id, then commit audit+bump
    // with it. A duplicate label fails here, before any audit row.
    await db.commit(writes.slice(0, 2));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminStoreError(409, `label '${label}' already exists`);
    }
    throw error;
  }
  const id = (
    await db
      .prepare("SELECT id FROM provider_keys WHERE label = ?")
      .bind(label)
      .first<{ id: number }>()
  )?.id;
  if (id === undefined) throw new AdminStoreError(500, "key write failed");
  await db.commit([bumpWrite(), auditWrite("add", providerId, id, label)]);
  return { id, label, providerId, activeVersion: 1 };
}

/**
 * Rotate a key through the R1b ledger order: revoke the active version,
 * insert the next one, atomically. A concurrent rotate loses loudly (409)
 * on the single-active index instead of silently forking versions.
 */
export async function rotateProviderKey(
  db: AdminD1,
  seal: (token: string) => Promise<string>,
  keyId: number,
  apiToken: string
): Promise<KeySummary> {
  const token = clean(apiToken);
  if (!token) throw new AdminStoreError(400, "apiToken is required");
  const key = await keyRow(db, keyId);
  if (!key) throw new AdminStoreError(404, `unknown provider key ${keyId}`);
  const current = await db
    .prepare(
      "SELECT MAX(version) AS v FROM credential_versions WHERE provider_key_id = ?"
    )
    .bind(keyId)
    .first<{ v: number | null }>();
  const next = (current?.v ?? 0) + 1;
  const envelope = await seal(token);
  const writes: AdminWrite[] = [];
  if (current?.v !== null && current?.v !== undefined) {
    writes.push(
      write(
        "UPDATE credential_versions SET revoked_at = unixepoch() " +
          "WHERE provider_key_id = ? AND revoked_at IS NULL",
        keyId
      )
    );
  }
  writes.push(
    write(
      "INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) " +
        "VALUES (?, ?, ?, ?)",
      keyId,
      next,
      envelope,
      ADMIN_ACTOR
    ),
    bumpWrite(),
    auditWrite("rotate", key.provider_id, keyId, key.label)
  );
  try {
    await db.commit(writes);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminStoreError(
        409,
        `key ${keyId} changed concurrently; retry the rotation`
      );
    }
    throw error;
  }
  return {
    id: keyId,
    label: key.label,
    providerId: key.provider_id,
    activeVersion: next,
  };
}

/** Disable a key: parked (kept, unserved), audited, cache-bumped. */
export async function disableProviderKey(
  db: AdminD1,
  keyId: number
): Promise<{ id: number; enabled: false }> {
  const key = await keyRow(db, keyId);
  if (!key) throw new AdminStoreError(404, `unknown provider key ${keyId}`);
  await db.commit([
    write("UPDATE provider_keys SET enabled = 0 WHERE id = ?", keyId),
    bumpWrite(),
    auditWrite("disable", key.provider_id, keyId, key.label),
  ]);
  return { id: keyId, enabled: false as const };
}
