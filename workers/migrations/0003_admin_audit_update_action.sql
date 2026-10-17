-- Migration 0003: admit the 'update' audit action on existing databases
-- (R2 follow-up, #91).
--
-- 0002 ships CHECK (action IN ('add', 'rotate', 'disable')). The workbench
-- PATCH path records action 'update', so that constraint has to widen — but
-- D1 applies a migration once per name: an environment that already deployed
-- 0002 keeps the old constraint no matter what 0002's file says now. SQLite
-- cannot alter a CHECK, so the table is rebuilt forward-only (same convention
-- as 0001/0002: undo is D1 Time Travel, never a runner).
--
-- Nothing references admin_audit, so the rename is safe; rows and the
-- autoincrement high-water mark carry over.
ALTER TABLE admin_audit RENAME TO admin_audit_previous;

CREATE TABLE admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL CHECK (length(actor) > 0),
  action TEXT NOT NULL CHECK (action IN ('add', 'update', 'rotate', 'disable')),
  provider_id TEXT NOT NULL CHECK (length(provider_id) > 0),
  key_id INTEGER REFERENCES provider_keys (id) ON DELETE SET NULL,
  key_label TEXT NOT NULL CHECK (length(key_label) > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO admin_audit (id, actor, action, provider_id, key_id, key_label, created_at)
  SELECT id, actor, action, provider_id, key_id, key_label, created_at
    FROM admin_audit_previous;

-- The explicit-id copy only advances the new table's AUTOINCREMENT sequence to
-- the highest id still present, so an id deleted above that would be reused.
-- Carry the old table's high-water mark over before it is dropped (its
-- sqlite_sequence row goes away with it). The UPDATE covers the copied rows,
-- the INSERT the never-inserted case where the rebuilt table has no row yet.
UPDATE sqlite_sequence
   SET seq = (SELECT seq FROM sqlite_sequence WHERE name = 'admin_audit_previous')
 WHERE name = 'admin_audit'
   AND EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'admin_audit_previous');

INSERT INTO sqlite_sequence (name, seq)
  SELECT 'admin_audit', seq FROM sqlite_sequence
   WHERE name = 'admin_audit_previous'
     AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'admin_audit');

DROP TABLE admin_audit_previous;

-- The rebuild takes the old table's indexes with it; 0002 created this one,
-- so an upgraded database must get it back (queries filter audit rows by
-- key_id).
CREATE INDEX idx_admin_audit_key ON admin_audit (key_id);
