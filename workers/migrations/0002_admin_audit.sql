-- Migration 0002: admin audit trail (R2, #74, part of #68).
--
-- Forward-only (same convention as 0001): undo is D1 Time Travel, never a
-- runner. Records every admin key mutation (add / update / rotate /
-- disable) with
-- who/when/what — credential_versions.created_by covers rotate's actor,
-- but disable has no row of its own, and add needs a home for the label
-- the operator assigned. Tokens live ONLY in credential_versions.envelope;
-- this table carries labels and provider ids, never secret material.

CREATE TABLE admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL CHECK (length(actor) > 0),
  action TEXT NOT NULL CHECK (action IN ('add', 'update', 'rotate', 'disable')),
  provider_id TEXT NOT NULL CHECK (length(provider_id) > 0),
  key_id INTEGER REFERENCES provider_keys (id) ON DELETE SET NULL,
  key_label TEXT NOT NULL CHECK (length(key_label) > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_admin_audit_key ON admin_audit (key_id);
