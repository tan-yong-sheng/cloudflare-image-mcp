-- Migration 0005: seed the Agnes provider row (R3-Agnes, #75, part of #68).
--
-- Forward-only and data-only: 0001 created and versioned the provider store
-- and its own comment anticipated this row ("R3-Agnes arrives as a new row
-- plus transport, with no schema change"). No column, table, or index
-- changes here; the number is 0005 because 0002-0004 are the admin audit
-- migrations.
--
-- The row is inert until a credential is published for the provider through
-- the admin path (ADR-001); until then the pool snapshot reports this
-- provider with no servable keys. `transport` is the key ADR-002 registers:
-- 'openai-compat' resolves to services/openai-transport.ts through
-- TRANSPORT_FACTORIES. No seed below contains a secret value.

INSERT INTO providers (id, display_name, transport)
  VALUES ('agnes', 'Agnes AI', 'openai-compat');
