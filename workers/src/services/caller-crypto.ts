// ============================================================================
// Caller-key crypto - the keyed verifier (caller keys, #126)
// ============================================================================
// A caller key is only ever COMPARED, never opened, so it is stored as a
// verifier: hex HMAC-SHA256(pepper, secret). The pepper is derived from
// PROVIDER_DATA_KEY — a Worker secret that never lands in D1 — so a stolen
// database alone cannot brute-force a row offline: every guess still needs
// the pepper. The verifier is deterministic, so the authentication path
// (#129) can look a key up by its verifier through the unique index
// uq_caller_keys_hash instead of scanning rows. There is no salt column by
// design: the pepper is the salt (migrations/0006_caller_keys.sql).
//
// The pepper is derived rather than reused raw: PROVIDER_DATA_KEY also seals
// provider envelopes (provider-crypto.ts), and the two jobs get different
// key material — SHA-256 over a domain-separated label — so exposure of one
// use does not hand over the other's key.

import { GENERATED_CALLER_PREFIX } from "./caller-store.js";

/** Domain separation for the pepper derivation. Bumping breaks every
 * stored verifier at once (they would all need re-rotation), so it is
 * versioned from day one. */
const PEPPER_DOMAIN = "cloudflare-image-mcp/caller-key-verifier/v1";

/**
 * Derive the caller-key pepper from PROVIDER_DATA_KEY.
 *
 * The pepper lives only in Worker memory for the life of a request; it is
 * never written to D1, logged, or returned from any endpoint.
 */
export async function deriveCallerPepper(dataKey: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${PEPPER_DOMAIN}\n${dataKey}`)
  );
  return new Uint8Array(digest);
}

/**
 * The stored verifier for a caller secret: lowercase hex
 * HMAC-SHA256(pepper, secret).
 *
 * The pepper is the HMAC key, so the verifier is indistinguishable from a
 * random value to anyone without it — unlike a plain digest, which a D1
 * dump could attack offline.
 */
export async function callerKeyVerifier(
  pepper: Uint8Array,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    pepper as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(secret)
  );
  return hex(new Uint8Array(mac));
}

/**
 * The secret a create (or rotate) generates when the operator brings none:
 * the reserved prefix plus 24 hex characters from a CSPRNG.
 */
export function generateCallerSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return GENERATED_CALLER_PREFIX + hex(bytes);
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}
