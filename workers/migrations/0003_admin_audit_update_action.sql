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
-- autoincrement high-water mark carry over through the explicit-id copy.
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

DROP TABLE admin_audit_previous;

-- The rebuild takes the old table's indexes with it; 0002 created this one,
-- so an upgraded database must get it back (queries filter audit rows by
-- key_id).
CREATE INDEX idx_admin_audit_key ON admin_audit (key_id);
