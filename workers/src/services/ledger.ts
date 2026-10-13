// ============================================================================
// Credential ledger writer - single-owner rotation transactions (R1b, #72)
// ============================================================================
// The module the R1a migration comment points at: every credential mutation
// flows through rotateKey, which revokes the active version and inserts the
// next one inside one transaction, oldest-first. Order is forced by the
// single-active partial-unique index (inserting first fails even inside a
// transaction), so the revoke precedes the insert and a failed insert rolls
// back to the still-active old version. Takes sealed envelopes only — token
// material never reaches this module. Works against any DatabaseSync-shaped
// handle (node:sqlite harness here; D1's batch API in production callers).

/**
 * Minimal database handle this module needs: prepare/run/get/all plus
 * exec for transaction control. node:sqlite's DatabaseSync satisfies it
 * structurally (tests), as does a thin D1 adapter (production callers) —
 * so no node: import appears in shipped code and the WebWorker-only
 * production gate stays intact.
 */
export interface LedgerDb {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
  exec(sql: string): void;
}

export interface Rotation {
  keyId: number;
  /** AES-GCM envelope from sealToken; must be non-empty. */
  envelope: string;
  /** Operator or job performing the rotation (audit "who"). */
  actor: string;
}

/**
 * Rotate one key: revoke the active version (if any), insert the next
 * version, atomically. Returns the new version number.
 */
export function rotateKey(db: LedgerDb, rotation: Rotation): number {
  const { keyId, envelope, actor } = rotation;
  if (envelope.length === 0)
    throw new Error("refusing to store an empty envelope");
  if (actor.length === 0) throw new Error("rotation requires an actor");

  const keyExists = db
    .prepare("SELECT 1 FROM provider_keys WHERE id = ?")
    .get(keyId);
  if (!keyExists) throw new Error(`unknown provider key ${keyId}`);

  const current = db
    .prepare(
      "SELECT MAX(version) AS v FROM credential_versions WHERE provider_key_id = ?"
    )
    .get(keyId) as { v: number | null };
  const next = (current.v ?? 0) + 1;

  db.exec("BEGIN");
  try {
    if (current.v !== null) {
      db.exec(
        `UPDATE credential_versions SET revoked_at = unixepoch() WHERE provider_key_id = ${keyId} AND revoked_at IS NULL`
      );
    }
    db.prepare(
      "INSERT INTO credential_versions (provider_key_id, version, envelope, created_by) VALUES (?, ?, ?, ?)"
    ).run(keyId, next, envelope, actor);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Rollback of a failed transaction is best-effort; the original
      // error is what the caller must see.
    }
    throw error;
  }
  return next;
}
