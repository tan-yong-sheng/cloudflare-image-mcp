// ============================================================================
// Caller-key crypto tests - the keyed verifier (#126)
// ============================================================================
// The verifier is the security-critical half of the create path: it is what
// a D1 row holds instead of a secret. These tests pin it against an
// independent known value (RFC 4231's HMAC-SHA256 vector), not against
// the implementation's own output, so a wrong key length, a swapped
// argument, or a changed encoding fails loudly.

import { describe, expect, test } from "vitest";
import {
  callerKeyVerifier,
  deriveCallerPepper,
  generateCallerSecret,
} from "./caller-crypto.js";
import { GENERATED_CALLER_PREFIX } from "./caller-store.js";

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("callerKeyVerifier (the stored verifier)", () => {
  // RFC 4231, test case 2: key "Jefe", data "what do ya want for nothing?".
  test("matches the RFC 4231 known vector", async () => {
    const pepper = new TextEncoder().encode("Jefe");
    expect(
      await callerKeyVerifier(pepper, "what do ya want for nothing?")
    ).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });

  test("is 64 lowercase hex characters", async () => {
    const pepper = await deriveCallerPepper("data-key");
    const verifier = await callerKeyVerifier(pepper, "a-secret");
    expect(verifier).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic", async () => {
    const pepper = await deriveCallerPepper("data-key");
    expect(await callerKeyVerifier(pepper, "a-secret")).toBe(
      await callerKeyVerifier(pepper, "a-secret")
    );
  });

  test("differs per secret", async () => {
    const pepper = await deriveCallerPepper("data-key");
    expect(await callerKeyVerifier(pepper, "one")).not.toBe(
      await callerKeyVerifier(pepper, "two")
    );
  });

  test("is keyed: it is not a plain digest of the secret", async () => {
    // A plain SHA-256(secret) would be brute-forceable from a D1 dump.
    // The pepper must actually take part.
    const pepper = await deriveCallerPepper("data-key");
    expect(await callerKeyVerifier(pepper, "guess-me")).not.toBe(
      await sha256Hex("guess-me")
    );
  });

  test("differs per pepper, so per deployment", async () => {
    const secret = "one-secret";
    const a = await callerKeyVerifier(
      await deriveCallerPepper("data-key-a"),
      secret
    );
    const b = await callerKeyVerifier(
      await deriveCallerPepper("data-key-b"),
      secret
    );
    expect(a).not.toBe(b);
  });
});

describe("deriveCallerPepper", () => {
  test("is deterministic for a given data key", async () => {
    const a = await deriveCallerPepper("same-key");
    const b = await deriveCallerPepper("same-key");
    expect([...a]).toEqual([...b]);
  });

  test("differs per data key", async () => {
    const a = await deriveCallerPepper("key-a");
    const b = await deriveCallerPepper("key-b");
    expect([...a]).not.toEqual([...b]);
  });

  test("is SHA-256 length (32 bytes)", async () => {
    expect((await deriveCallerPepper("key")).length).toBe(32);
  });
});

describe("generateCallerSecret", () => {
  test("carries the reserved prefix plus 24 hex characters", () => {
    expect(generateCallerSecret()).toMatch(/^sk-mgmt-[0-9a-f]{24}$/);
    expect(GENERATED_CALLER_PREFIX).toBe("sk-mgmt-");
  });

  test("does not repeat", () => {
    const seen = new Set(Array.from({ length: 100 }, generateCallerSecret));
    expect(seen.size).toBe(100);
  });
});
