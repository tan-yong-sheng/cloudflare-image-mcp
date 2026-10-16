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
  commit(writes: readonly AdminWrite[]): Promise<AdminCommitResult>;
}

/**
 * Result of an atomic write batch. keyId is the row id the engine assigned
 * to the first write (the provider_keys INSERT for add) so the response
 * carries the identity resolved INSIDE the commit — no read-your-write
 * round trip that can fail after the mutation already landed.
 */
export interface AdminCommitResult {
  keyId: number | null;
}

/** A bound write the store hands to the engine for atomic commit. */
export interface AdminWrite {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** Provider API tokens are short opaque strings; bound what we will seal. */
const MAX_API_TOKEN_LENGTH = 4096;

function assertTokenLength(apiToken: string): void {
  if (apiToken.length > MAX_API_TOKEN_LENGTH) {
    throw new AdminStoreError(400, "apiToken is too long");
  }
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

export interface AdminProviderSummary {
  id: string;
  displayName: string;
}

export interface AdminKeySummary {
  id: number;
  providerId: string;
  label: string;
  weight: number;
  enabled: boolean;
  activeVersion: number | null;
  accountId: string | null;
}

export interface AdminExposureSummary {
  modelId: string;
  enabled: boolean;
  alias: string | null;
  isDefault: boolean;
  scopes: string[];
}

export interface AdminHealthSummary {
  providers: AdminProviderSummary[];
  keys: AdminKeySummary[];
  exposure: AdminExposureSummary[];
  configVersion: number | null;
}

export interface AddKeyInput {
  providerId: string;
  label: string;
  apiToken: string;
  accountId?: string;
  weight?: number;
  enabled?: boolean;
}

export interface UpdateKeyInput {
  keyId: number;
  accountId?: string | null;
  weight?: number;
  enabled?: boolean;
  apiToken?: string;
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

function rows<T>(res: { results?: T[] } | null | undefined): T[] {
  return res?.results ?? [];
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

/**
 * Health read: pool counts, active key summaries, exposure overrides, and
 * the config cache version. Reads live in the store so endpoints contain
 * zero SQL.
 */
export async function getAdminHealth(db: AdminD1): Promise<AdminHealthSummary> {
  const providerRows = rows<Record<string, unknown>>(
    await db.prepare("SELECT id, display_name FROM providers").all()
  );
  const providers: AdminProviderSummary[] = providerRows.map((p) => ({
    id: String(p["id"]),
    displayName: String(p["display_name"]),
  }));

  const keyRows = rows<Record<string, unknown>>(
    await db
      .prepare(
        `SELECT k.id AS id,
                k.provider_id AS providerId,
                k.label AS label,
                k.weight AS weight,
                k.enabled AS enabled,
                k.external_account_id AS accountId,
                MAX(v.version) AS activeVersion
           FROM provider_keys k
           LEFT JOIN credential_versions v
             ON v.provider_key_id = k.id AND v.revoked_at IS NULL
          GROUP BY k.id`
      )
      .all()
  );
  const keys: AdminKeySummary[] = keyRows.map((k) => ({
    id: num(k["id"]),
    providerId: String(k["providerId"]),
    label: String(k["label"]),
    weight: num(k["weight"]),
    enabled: num(k["enabled"]) === 1,
    activeVersion: k["activeVersion"] === null ? null : num(k["activeVersion"]),
    accountId: k["accountId"] === null ? null : String(k["accountId"]),
  }));

  const versionRow = await db
    .prepare("SELECT version FROM config_versions WHERE id = 1")
    .first<{ version: number }>();

  const exposureRows = rows<Record<string, unknown>>(
    await db
      .prepare(
        `SELECT e.model_id AS modelId,
                e.enabled AS enabled,
                e.alias AS alias,
                e.is_default AS isDefault,
                s.scope AS scope
           FROM exposure_overrides e
           LEFT JOIN excluded_scopes s ON s.model_id = e.model_id`
      )
      .all()
  );
  const exposureMap = new Map<string, AdminExposureSummary>();
  for (const r of exposureRows) {
    const modelId = String(r["modelId"]);
    let entry = exposureMap.get(modelId);
    if (!entry) {
      entry = {
        modelId,
        enabled: num(r["enabled"]) === 1,
        alias: r["alias"] === null ? null : String(r["alias"]),
        isDefault: num(r["isDefault"]) === 1,
        scopes: [],
      };
      exposureMap.set(modelId, entry);
    }
    const scope = r["scope"] === null ? null : String(r["scope"]);
    if (scope !== null) {
      entry.scopes.push(scope);
    }
  }
  const exposure: AdminExposureSummary[] = Array.from(exposureMap.values());

  return {
    providers,
    keys,
    exposure,
    configVersion: versionRow?.version ?? null,
  };
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
  action: "add" | "rotate" | "disable" | "update",
  providerId: string,
  keyId: number | null,
  label: string
): AdminWrite {
  if (action === "add") {
    // Single-commit atomicity: the audit row resolves the fresh key id
    // through the UNIQUE label inside the SAME batch (subselect idiom),
    // eliminating any crash window between key creation and audit.
    return write(
      "INSERT INTO admin_audit (actor, action, provider_id, key_id, key_label) " +
        "VALUES (?, ?, ?, (SELECT id FROM provider_keys WHERE label = ?), ?)",
      ADMIN_ACTOR,
      action,
      providerId,
      label,
      label
    );
  }
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
  const apiToken = typeof input.apiToken === "string" ? input.apiToken : "";
  if (!providerId) throw new AdminStoreError(400, "providerId is required");
  if (!label) throw new AdminStoreError(400, "label is required");
  if (!apiToken || apiToken.length === 0) {
    throw new AdminStoreError(400, "apiToken is required");
  }
  assertTokenLength(apiToken);
  if (!(await providerExists(db, providerId))) {
    throw new AdminStoreError(400, `unknown provider '${providerId}'`);
  }
  const accountId = input.accountId !== undefined ? clean(input.accountId) : "";
  if (providerId === "cloudflare" && accountId.length === 0) {
    throw new AdminStoreError(400, "accountId is required for cloudflare keys");
  }
  const weight = input.weight !== undefined ? num(input.weight) : 1;
  const enabled = input.enabled !== undefined ? input.enabled === true : true;
  const envelope = await seal(apiToken);
  // Atomic single-commit: all 4 statements (key, credential version,
  // config bump, audit log) execute together in one batch. A duplicate
  // label rolls the entire batch back (no partial writes, no audit, no bump).
  const writes: AdminWrite[] = [
    write(
      "INSERT INTO provider_keys (provider_id, label, external_account_id, weight, enabled) " +
        "VALUES (?, ?, ?, ?, ?)",
      providerId,
      label,
      accountId.length > 0 ? accountId : null,
      weight,
      enabled ? 1 : 0
    ),
    write(
      "INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) " +
        "VALUES ((SELECT id FROM provider_keys WHERE label = ?), 1, ?, ?)",
      label,
      envelope,
      ADMIN_ACTOR
    ),
    bumpWrite(),
    auditWrite("add", providerId, null, label),
  ];
  let commit: AdminCommitResult;
  try {
    commit = await db.commit(writes);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminStoreError(409, `label '${label}' already exists`);
    }
    throw error;
  }
  // The id comes back from the atomic commit; the read is a belt-and-braces
  // fallback for an engine that reports no row id. A failure here happens
  // only AFTER the mutation landed, so it is retried, never reported as a
  // failed write the caller would try to repeat into a duplicate 409.
  let id: number | undefined =
    typeof commit.keyId === "number" ? commit.keyId : undefined;
  for (let attempt = 0; attempt < 3 && id === undefined; attempt++) {
    try {
      const row = await db
        .prepare("SELECT id FROM provider_keys WHERE label = ?")
        .bind(label)
        .first<{ id: number }>();
      if (row?.id !== undefined) {
        id = row.id;
        break;
      }
    } catch {
      // Transient read failure after successful commit; retry
    }
  }
  if (id === undefined) {
    throw new AdminStoreError(
      500,
      `key committed successfully but id resolution for '${label}' failed; query health to verify`
    );
  }
  return { id, label, providerId, activeVersion: 1 };
}

/**
 * Append the R1b rotate ledger writes: revoke the active version (if any)
 * then insert the next, in the order `uq_credential_single_active` forces —
 * the revoke must precede the insert even inside one transaction. Returns
 * the new active version. One home for the ledger order shared by rotate and
 * update-with-token.
 */
function appendRotateWrites(
  writes: AdminWrite[],
  keyId: number,
  envelope: string,
  current: { v: number | null } | null
): number {
  const next = (current?.v ?? 0) + 1;
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
    )
  );
  return next;
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
  const token = typeof apiToken === "string" ? apiToken : "";
  if (!token || token.length === 0) {
    throw new AdminStoreError(400, "apiToken is required");
  }
  assertTokenLength(token);
  const key = await keyRow(db, keyId);
  if (!key) throw new AdminStoreError(404, `unknown provider key ${keyId}`);
  const current = await db
    .prepare(
      "SELECT MAX(version) AS v FROM credential_versions WHERE provider_key_id = ?"
    )
    .bind(keyId)
    .first<{ v: number | null }>();
  const envelope = await seal(token);
  const writes: AdminWrite[] = [];
  const next = appendRotateWrites(writes, keyId, envelope, current);
  writes.push(
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

/** Full key row the update path edits and echoes back. */
async function keyRowFull(
  db: AdminD1,
  keyId: number
): Promise<{
  id: number;
  provider_id: string;
  label: string;
  weight: number;
  enabled: number;
  external_account_id: string | null;
} | null> {
  return db
    .prepare(
      "SELECT id, provider_id, label, weight, enabled, external_account_id " +
        "FROM provider_keys WHERE id = ?"
    )
    .bind(keyId)
    .first();
}

/**
 * Update a key: field edits (account id, weight, enabled) with optional
 * rotate-on-save, one transaction. A present token rides the same
 * revoke-before-insert ledger order as rotateProviderKey so a save can
 * never fork versions. The cloudflare account id is load-bearing for
 * inference, so a change that would leave it empty is rejected.
 */
export async function updateProviderKey(
  db: AdminD1,
  seal: (token: string) => Promise<string>,
  input: UpdateKeyInput
): Promise<AdminKeySummary> {
  const key = await keyRowFull(db, input.keyId);
  if (!key)
    throw new AdminStoreError(404, `unknown provider key ${input.keyId}`);

  const accountId =
    input.accountId !== undefined
      ? clean(input.accountId)
      : (key.external_account_id ?? "");
  if (key.provider_id === "cloudflare" && accountId.length === 0) {
    throw new AdminStoreError(400, "accountId is required for cloudflare keys");
  }
  const storedAccountId = accountId.length > 0 ? accountId : null;

  const weight =
    input.weight !== undefined ? num(input.weight) : num(key.weight);
  const enabled =
    input.enabled !== undefined
      ? input.enabled === true
      : num(key.enabled) === 1;
  const token = typeof input.apiToken === "string" ? input.apiToken : "";
  if (token.length > 0) assertTokenLength(token);
  if (
    input.weight === undefined &&
    input.enabled === undefined &&
    input.accountId === undefined &&
    token.length === 0
  ) {
    throw new AdminStoreError(400, "no fields to update");
  }

  const writes: AdminWrite[] = [];
  if (input.accountId !== undefined) {
    writes.push(
      write(
        "UPDATE provider_keys SET external_account_id = ? WHERE id = ?",
        storedAccountId,
        input.keyId
      )
    );
  }
  if (input.weight !== undefined) {
    writes.push(
      write(
        "UPDATE provider_keys SET weight = ? WHERE id = ?",
        weight,
        input.keyId
      )
    );
  }
  if (input.enabled !== undefined) {
    writes.push(
      write(
        "UPDATE provider_keys SET enabled = ? WHERE id = ?",
        enabled ? 1 : 0,
        input.keyId
      )
    );
  }

  let activeVersion: number | null;
  const current = await db
    .prepare(
      "SELECT MAX(version) AS v FROM credential_versions WHERE provider_key_id = ?"
    )
    .bind(input.keyId)
    .first<{ v: number | null }>();
  if (token) {
    const envelope = await seal(token);
    activeVersion = appendRotateWrites(writes, input.keyId, envelope, current);
  } else {
    activeVersion = current?.v ?? null;
  }

  writes.push(
    bumpWrite(),
    auditWrite("update", key.provider_id, input.keyId, key.label)
  );
  try {
    await db.commit(writes);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminStoreError(
        409,
        `key ${input.keyId} changed concurrently; retry the save`
      );
    }
    throw error;
  }
  return {
    id: input.keyId,
    label: key.label,
    providerId: key.provider_id,
    activeVersion,
    weight,
    enabled,
    accountId: storedAccountId,
  };
}
