-- Migration 0002: seed the Agnes provider row (R3-Agnes, #75, part of #68).
--
-- Forward-only and data-only: 0001 created and versioned the provider store
-- and its own comment anticipated this row ("R3-Agnes arrives as a new row
-- plus transport, with no schema change"). No column, table, or index
-- changes here.
--
-- The row is inert until a credential is published for the provider through
-- the R1b/R2 paths; no Worker request path reads it yet. transport names the
-- seam the provider speaks ("openai-compat" -> OpenAITransport). No seed
-- below contains a secret value.

INSERT INTO providers (id, display_name, transport)
  VALUES ('agnes', 'Agnes AI', 'openai-compat');
