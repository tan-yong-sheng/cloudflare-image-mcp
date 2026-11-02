// ============================================================================
// Caller-key store - the keys that authenticate requests to this Worker
// ============================================================================
// A caller key is the bearer token a client sends in `Authorization: Bearer`
// to reach /v1/* and /mcp*. It is a different kind of secret from a provider
// credential: a provider credential is OPENED at request time (the Worker
// authenticates to Cloudflare with it), while a caller key is only ever
// COMPARED. So it is stored as a verifier, not as an envelope.
//
// The store owns the read side here: the workbench lists caller keys by
// name and masked value, and the secret never leaves the server. The mask
// is composed here rather than in the browser, for the same reason the
// provider-key health route composes its hint server-side: the client
// never holds the material, so it cannot be the thing that decides what
// may be shown.
//
// Reads live in the store so the endpoint contains zero SQL. The D1 seam
// (AdminD1) is reused from the provider-key store rather than duplicated:
// both are the same engine surface, and the endpoint already holds one.

import type { AdminD1 } from "./admin-store.js";

/**
 * A caller key as the workbench lists it.
 *
 * `maskedKey` is the only form of the secret the client ever sees. The
 * secret itself is never in a response — not on create, not on rotate,
 * not on a read.
 */
export interface CallerKeySummary {
  id: number;
  name: string;
  /** The masked hint, e.g. `sk-mgmt-…a1b2`. */
  maskedKey: string;
  enabled: boolean;
  /** Unix seconds. */
  createdAt: number;
  /** Unix seconds. */
  updatedAt: number;
}

/**
 * Compose the masked hint from the pieces kept beside the verifier.
 *
 * A key the server generated carries its prefix ("sk-mgmt-"), so the hint
 * shows the family the key belongs to. A key the operator brought has no
 * prefix of ours to claim, so the hint starts at the ellipsis.
 *
 * The suffix is empty when the secret was too short for a hint to be safe;
 * the mask then shows the ellipsis alone rather than half the secret.
 *
 * The separator is an ellipsis, per the caller-key design
 * (design-plans/007-api-key-management.md) and the magpie UI it was
 * researched from. Provider tokens mask with stars instead
 * (maskToken): a provider credential and a caller key are different
 * secrets for different jobs, and each table carries its own hint style.
 */
export function maskCallerKey(prefix: string, suffix: string): string {
  return prefix.length > 0 ? `${prefix}…${suffix}` : `…${suffix}`;
}

/**
 * Every caller key, oldest first.
 *
 * The list carries no verifier: the client is told which keys exist, what
 * they are called, and whether they are enabled — never the material that
 * would let it use one.
 */
export async function listCallerKeys(db: AdminD1): Promise<CallerKeySummary[]> {
  const result = await db
    .prepare(
      "SELECT id, name, prefix, suffix, enabled, created_at, updated_at " +
        "FROM caller_keys ORDER BY id"
    )
    .all<Record<string, unknown>>();
  const rows = result.results ?? [];
  return rows.map((row) => ({
    id: Number(row["id"]),
    name: String(row["name"]),
    maskedKey: maskCallerKey(
      String(row["prefix"] ?? ""),
      String(row["suffix"] ?? "")
    ),
    enabled: Number(row["enabled"]) === 1,
    createdAt: Number(row["created_at"] ?? 0),
    updatedAt: Number(row["updated_at"] ?? 0),
  }));
}
