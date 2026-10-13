-- Migration 0001: D1 provider store foundation (R1a, #71, part of #68).
--
-- Forward-only. There is deliberately no down-migration: undo is D1
-- Time Travel (per the migration approach in #68), never a runner.
--
-- No Worker request path reads these tables yet. This migration only
-- creates and versions the store; application reads land in R1b (#72).
--
-- Conventions used here:
-- * Timestamps are INTEGER unix seconds via unixepoch().
-- * Booleans are INTEGER 0/1 with CHECKs (SQLite has no BOOL).
-- * Tokens live ONLY in credential_versions.envelope as AES-GCM envelopes
--   (shape pinned in R1b); the data key lives in one Worker secret set via
--   the existing secret-put path. No seed below contains a secret value.
-- * Foreign keys ARE enforced: D1 enables foreign_keys by default (verified
--   against a real D1 instance, PRAGMA foreign_keys = 1). The test harness
--   turns on the same pragma, so the FK guards are covered alongside the
--   UNIQUE/CHECK ones.

CREATE TABLE providers (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL CHECK (length(display_name) > 0),
  transport TEXT NOT NULL CHECK (length(transport) > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE provider_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL REFERENCES providers (id) ON DELETE RESTRICT,
  label TEXT NOT NULL UNIQUE CHECK (length(label) > 0),
  external_account_id TEXT,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_provider_keys_provider ON provider_keys (provider_id);

CREATE TABLE credential_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_key_id INTEGER NOT NULL REFERENCES provider_keys (id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version >= 1),
  envelope TEXT NOT NULL CHECK (length(envelope) > 0),
  created_by TEXT NOT NULL CHECK (length(created_by) > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER,
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  UNIQUE (provider_key_id, version)
);
-- Rotation never overwrites: the old version is revoked and a new one
-- inserted, inside one transaction. Order is forced by the partial-unique
-- index below, which admits only one un-revoked version per key — inserting
-- the new active row first fails even within a transaction, so the revoke
-- must precede the insert.
CREATE UNIQUE INDEX uq_credential_single_active
  ON credential_versions (provider_key_id) WHERE revoked_at IS NULL;
-- No separate index on provider_key_id: the UNIQUE (provider_key_id,
-- version) constraint already indexes that column first, and the query
-- planner uses it (verified by EXPLAIN QUERY PLAN).

CREATE TABLE exposure_overrides (
  model_id TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  alias TEXT UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  updated_by TEXT NOT NULL CHECK (length(updated_by) > 0)
);
-- Field names mirror the R0 registry exposure flags (enabled / alias /
-- excluded scopes) so later D1 overrides reuse them unchanged. At most one
-- row may claim the default (all indexed rows share is_default = 1, so
-- uniqueness on that value admits exactly one).
CREATE UNIQUE INDEX uq_exposure_single_default
  ON exposure_overrides (is_default) WHERE is_default = 1;

CREATE TABLE excluded_scopes (
  model_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (length(scope) > 0),
  PRIMARY KEY (model_id, scope)
);

-- Singleton row (id = 1) bumped on every provider/exposure mutation; the
-- runtime polls it on a short interval instead of querying D1 per request.
CREATE TABLE config_versions (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Seed: Cloudflare is the only provider; R3-Agnes arrives as a new row
-- plus transport, with no schema change.
INSERT INTO providers (id, display_name, transport)
  VALUES ('cloudflare', 'Cloudflare Workers AI', 'cloudflare-rest');
INSERT INTO config_versions (id) VALUES (1);
