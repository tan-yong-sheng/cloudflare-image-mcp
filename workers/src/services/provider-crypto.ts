// ============================================================================
// Provider credential envelopes - AES-GCM token codec (R1b, #72)
// ============================================================================
// Tokens rest ONLY as envelopes in credential_versions.envelope; the data
// key lives in one Worker secret. AES-GCM via crypto.subtle (available in
// Workers and node 24): a random 96-bit IV per seal, key derived with a
// single SHA-256 (domain-separated) so any string key works. Envelope form
// is base64(iv) + "." + base64(ciphertext) — the dot also keeps the
// no-plaintext scanner's quoted-literal rule honest about dotted values.

import { arrayBufferToBase64, base64ToUint8Array } from "../utils/encoding.js";

const IV_BYTES = 12;
const ENVELOPE_VERSION = "v1";

async function importKey(keyMaterial: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`provider-envelope-v1:${keyMaterial}`)
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Seal a token into a storable envelope. Never returns the token itself. */
export async function sealToken(
  token: string,
  keyMaterial: string
): Promise<string> {
  const key = await importKey(keyMaterial);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(token)
  );
  return `${ENVELOPE_VERSION}.${arrayBufferToBase64(iv.buffer as ArrayBuffer)}.${arrayBufferToBase64(ciphertext)}`;
}

const MASK_STARS = "****";
const MASK_HEAD = 5;
const MASK_TAIL = 4;
const MASK_MIN_HIDDEN = 4;

/**
 * Masked hint for a stored token: enough to tell two keys apart, never enough
 * to use one. Shows the first five and last four characters, so a prefix such
 * as `sk-` stays recognisable, and stars everything between them.
 *
 * A value too short to hide at least four characters becomes stars alone:
 * a hint that shows all but one character is the token with a typo.
 */
export function maskToken(token: string): string {
  const value = token.trim();
  if (value.length === 0) return "";
  if (value.length < MASK_HEAD + MASK_TAIL + MASK_MIN_HIDDEN) return MASK_STARS;
  return value.slice(0, MASK_HEAD) + MASK_STARS + value.slice(-MASK_TAIL);
}

/** Open an envelope; throws when the key is wrong or bytes were tampered. */
export async function openEnvelope(
  envelope: string,
  keyMaterial: string
): Promise<string> {
  const parts = envelope.split(".");
  if (parts.length !== 3 || parts[0] !== ENVELOPE_VERSION) {
    throw new Error("not a v1 provider envelope");
  }
  const key = await importKey(keyMaterial);
  // Fresh copies: base64ToUint8Array returns Uint8Array<ArrayBufferLike>,
  // which strict BufferSource typing rejects (same copy idiom as the
  // generator's stream-byte handling).
  const iv = Uint8Array.from(base64ToUint8Array(parts[1]));
  const ciphertext = Uint8Array.from(base64ToUint8Array(parts[2]));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}
