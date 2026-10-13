// ============================================================================
// Envelope codec tests - R1b (#72), seam S2
// ============================================================================
// Seam: seal/open in provider-crypto.ts. Proves tokens rest ONLY as AES-GCM
// envelopes (non-deterministic, wrong-key fails, no plaintext shape) without
// touching key management or D1. Fixtures are synthetic; the scanner guard
// (secret-tripwire.test.ts) covers committed artifacts.

import { describe, expect, test } from "vitest";
import { openEnvelope, sealToken } from "./provider-crypto.js";

const KEY = "test-key-material-for-unit-tests-only";
const TOKEN = "cf-token-value-for-tests-only";

describe("envelope codec (S2)", () => {
  test("round-trips a token through seal and open", async () => {
    expect(await openEnvelope(await sealToken(TOKEN, KEY), KEY)).toBe(TOKEN);
  });

  test("sealing is non-deterministic (fresh IV per seal)", async () => {
    expect(await sealToken(TOKEN, KEY)).not.toBe(await sealToken(TOKEN, KEY));
  });

  test("opening with the wrong key fails", async () => {
    await expect(
      openEnvelope(await sealToken(TOKEN, KEY), "wrong-key")
    ).rejects.toThrow();
  });

  test("the envelope carries no plaintext token shape", async () => {
    const envelope = await sealToken(TOKEN, KEY);
    expect(envelope).not.toContain(TOKEN);
    expect(envelope.length).toBeGreaterThan(TOKEN.length);
  });

  test("tampering with the envelope fails authentication", async () => {
    const envelope = await sealToken(TOKEN, KEY);
    const tampered = envelope.slice(0, -4) + "AAAA";
    await expect(openEnvelope(tampered, KEY)).rejects.toThrow();
  });
});
