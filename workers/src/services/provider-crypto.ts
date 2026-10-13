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
