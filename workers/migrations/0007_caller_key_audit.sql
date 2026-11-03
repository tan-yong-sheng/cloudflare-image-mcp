-- Migration 0007: admit caller-key actions on admin_audit (#128).
--
-- The caller-key mutations (create #126, rotate #127, toggle/rename/delete
-- #128) ride the same audit trail as the provider-key writes, but the
-- table as 0003 rebuilt it cannot hold their rows:
--
-- * action CHECK (action IN ('add', 'update', 'rotate', 'disable')) — a
--   caller-key action is none of these.
-- * provider_id NOT NULL — a caller key belongs to no provider.
-- * key_id REFERENCES provider_keys (id) — a caller-key id would violate
--   the foreign key, or worse, alias a provider-key id.
--
-- D1 applies a migration once per name and SQLite cannot alter a CHECK,
-- so the table is rebuilt forward-only, the same way 0003 did it: rows
-- and the autoincrement high-water mark carry over, nothing is dropped.
-- Provider rows copy through byte-for-byte and keep their semantics
-- (key_id still references provider_keys and still SET NULLs on a
-- provider-key delete); caller-key rows carry their own caller_key_id,
-- which SET NULLs when the key is deleted — the audit ROW stays either
-- way, which is the point of the trail.
--
-- undo is D1 Time Travel, never a runner (same convention as 0001-0006).

ALTER TABLE admin_audit RENAME TO admin_audit_previous;

CREATE TABLE admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL CHECK (length(actor) > 0),
  action TEXT NOT NULL CHECK (action IN (
    'add', 'update', 'rotate', 'disable', 'delete',
    'caller_key_create', 'caller_key_rotate', 'caller_key_toggle',
    'caller_key_rename', 'caller_key_delete'
  )),
  -- Provider rows carry the provider id; caller-key rows leave it NULL.
  provider_id TEXT CHECK (provider_id IS NULL OR length(provider_id) > 0),
  -- Provider key rows (unchanged semantics from 0003).
  key_id INTEGER REFERENCES provider_keys (id) ON DELETE SET NULL,
  -- Caller-key rows. SET NULL on delete: the trail outlives the key.
  caller_key_id INTEGER REFERENCES caller_keys (id) ON DELETE SET NULL,
  key_label TEXT NOT NULL CHECK (length(key_label) > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO admin_audit (id, actor, action, provider_id, key_id, key_label, created_at)
  SELECT id, actor, action, provider_id, key_id, key_label, created_at
    FROM admin_audit_previous;

-- Carry the old table's high-water mark over before it is dropped, so a
-- previously deleted id is never reused (same copy as 0003).
UPDATE sqlite_sequence
   SET seq = (SELECT seq FROM sqlite_sequence WHERE name = 'admin_audit_previous')
 WHERE name = 'admin_audit'
   AND EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'admin_audit_previous');

INSERT INTO sqlite_sequence (name, seq)
  SELECT 'admin_audit', seq FROM sqlite_sequence
   WHERE name = 'admin_audit_previous'
     AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'admin_audit');

DROP TABLE admin_audit_previous;

-- The rebuild takes the old table's indexes with it; 0002 created this
-- one, so an upgraded database must get it back.
CREATE INDEX idx_admin_audit_key ON admin_audit (key_id);
