// ============================================================================
// Envelope codec tests - R1b (#72), seam S2
// ============================================================================
// Seam: seal/open in provider-crypto.ts. Proves tokens rest ONLY as AES-GCM
// envelopes (non-deterministic, wrong-key fails, no plaintext shape) without
// touching key management or D1. Fixtures are synthetic; the scanner guard
// (secret-tripwire.test.ts) covers committed artifacts.

import { describe, expect, test } from "vitest";
import { maskToken, openEnvelope, sealToken } from "./provider-crypto.js";

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

describe("masked key hints (S2)", () => {
  test("keeps the prefix and suffix, stars the middle", () => {
    expect(maskToken("sk-yt9Xq2mKfa12")).toBe("sk-yt****fa12");
  });

  test("the hint never contains the whole token", () => {
    const token = "cf-token-value-for-tests-only";
    const mask = maskToken(token);
    expect(mask).not.toContain(token);
    expect(mask).toContain("****");
    expect(mask.length).toBeLessThan(token.length);
  });

  test("a token too short to hide four characters masks to stars only", () => {
    expect(maskToken("short")).toBe("****");
    expect(maskToken("123456789012")).toBe("****");
  });

  test("longest short-but-maskable token keeps a hidden middle", () => {
    // 13 characters is the first length with a middle to hide.
    expect(maskToken("1234567890abc")).toBe("12345****0abc");
  });

  test("an empty token has no hint", () => {
    expect(maskToken("")).toBe("");
    expect(maskToken("   ")).toBe("");
  });

  test("a hint never reads as a secret to the deployed-payload guard", () => {
    // e2e/tests/api/admin.spec.ts rejects the serialized health payload when it
    // matches sk-[A-Za-z0-9]{8,} or a long bearer run. The hint puts the mask
    // stars inside the visible head, so only two alphanumerics can ever follow
    // an sk- prefix — if that ratio changes, the deployed e2e starts failing
    // and cannot be reproduced locally, so pin it here.
    const tokens = [
      "sk-yt9Xq2mKfa12",
      "sk-proj-abcdefghijklmnop",
      "sk-ABCDEFGH12345678",
      "cf-token-value-for-tests-only",
    ];
    for (const token of tokens) {
      const mask = maskToken(token);
      expect(mask).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
      expect("Bearer " + mask).not.toMatch(/Bearer [A-Za-z0-9._~+/-]{8,}/);
    }
  });
});
