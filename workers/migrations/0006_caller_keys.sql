-- Migration 0006: caller keys — the keys that authenticate requests to this
-- Worker (#125, part of #123).
--
-- Forward-only (same convention as 0001-0005): undo is D1 Time Travel, never
-- a runner.
--
-- A caller key is the bearer token a client sends in `Authorization: Bearer`
-- to reach /v1/* and /mcp*. Until now those keys lived only in the API_KEYS
-- environment variable, so rotating or revoking one meant a redeploy. This
-- table gives them names, an enabled flag, and a home in the admin
-- workbench.
--
-- This is a different kind of secret from the provider credentials in
-- 0001-0004, and it is stored differently on purpose:
--
-- * Provider tokens are stored as AES-GCM envelopes (credential_versions.
--   envelope), sealed with PROVIDER_DATA_KEY. They must be OPENED at
--   request time, because the Worker authenticates to Cloudflare with them.
-- * A caller key is only ever COMPARED, never opened. So it is stored as a
--   verifier, not as an envelope: a hex HMAC-SHA256 over the secret, keyed
--   with a pepper derived from PROVIDER_DATA_KEY. The pepper lives in a
--   Worker secret, never in the database, and the helper that derives it
--   and computes the verifier arrives with the create path (#126). Until
--   then the table is empty and nothing writes to it.
--
-- Why a keyed verifier and not a plain salted hash: a row here must not be
-- brute-forceable offline from a D1 dump. A plain SHA-256(salt || secret),
-- with the salt in the same row, would be. The verifier is also
-- deterministic, so the authentication path can look a key up by its
-- verifier through an index instead of scanning every row on every request.
-- That is why this table has no salt column: the pepper is the salt, and
-- it never lands here.
--
-- No seed below contains a secret value. The table starts empty: an
-- operator adds caller keys through the admin workbench.

CREATE TABLE caller_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The operator's name for the key ("Laptop", "CI"). Unique so two keys
  -- are never told apart by accident.
  name TEXT NOT NULL UNIQUE CHECK (length(name) > 0),
  -- The verifier: hex HMAC-SHA256(pepper, secret). Never the secret, and
  -- never a salt: the pepper comes from a Worker secret.
  secret_hash TEXT NOT NULL CHECK (length(secret_hash) > 0),
  -- The leading segment of the secret, shown before the mask's ellipsis
  -- ("sk-mgmt-" for a key the server generated). Empty for a key the
  -- operator brought, whose prefix is not ours to claim.
  prefix TEXT NOT NULL DEFAULT '',
  -- The trailing characters shown after the ellipsis. Empty when the
  -- secret is too short for a hint to be safe, so the masked value shows
  -- nothing rather than half the secret.
  suffix TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- The authentication path looks a key up by its verifier, so the verifier
-- is indexed. UNIQUE because one secret is one key: two keys sharing a
-- secret would be indistinguishable to the operator and to the gateway.
CREATE UNIQUE INDEX uq_caller_keys_hash ON caller_keys (secret_hash);
