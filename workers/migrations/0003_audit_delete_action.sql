-- Migration 0003: add 'delete' action to audit trail (#102).
--
-- Extends the CHECK constraint on admin_audit.action to include 'delete'
-- for hard-delete operations (alongside 'update' from the edit path).
-- SQLite doesn't support ALTER COLUMN, so we recreate the table with the
-- new constraint and migrate existing rows.

-- Create new table with extended constraint
CREATE TABLE admin_audit_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL CHECK (length(actor) > 0),
  action TEXT NOT NULL CHECK (action IN ('add', 'rotate', 'disable', 'update', 'delete')),
  provider_id TEXT NOT NULL CHECK (length(provider_id) > 0),
  key_id INTEGER REFERENCES provider_keys (id) ON DELETE SET NULL,
  key_label TEXT NOT NULL CHECK (length(key_label) > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Copy existing rows
INSERT INTO admin_audit_new (id, actor, action, provider_id, key_id, key_label, created_at)
  SELECT id, actor, action, provider_id, key_id, key_label, created_at FROM admin_audit;

-- Drop old table and rename
DROP TABLE admin_audit;
ALTER TABLE admin_audit_new RENAME TO admin_audit;

-- Recreate index
CREATE INDEX idx_admin_audit_key ON admin_audit (key_id);
