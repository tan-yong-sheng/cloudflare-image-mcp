// ============================================================================
// Shared encoding utils unit tests - pure logic, no bindings, no network
// ============================================================================
// Seam: arrayBufferToBase64 / cleanBase64 / base64ToUint8Array exports.
// Expected values are known-good literals (RFC 4648 examples), never
// recomputed through the implementation.

import { describe, expect, test } from "vitest";
import {
  arrayBufferToBase64,
  base64ToUint8Array,
  cleanBase64,
} from "./encoding.js";

function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe("arrayBufferToBase64", () => {
  test("encodes ASCII bytes to the RFC 4648 literal", () => {
    expect(arrayBufferToBase64(bytesOf("Hello"))).toBe("SGVsbG8=");
  });

  test("empty buffer encodes to empty string", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });

  test("multi-chunk buffer encodes through the chunked path", () => {
    const bytes = new Uint8Array(100_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const encoded = arrayBufferToBase64(bytes.buffer as ArrayBuffer);
    expect(encoded.length).toBe(133_336);
    const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(bytes);
  });
});

describe("cleanBase64", () => {
  test("strips a png data-URI prefix", () => {
    expect(cleanBase64("data:image/png;base64,SGVsbG8=")).toBe("SGVsbG8=");
  });

  test("plain base64 passes through unchanged", () => {
    expect(cleanBase64("SGVsbG8=")).toBe("SGVsbG8=");
  });
});

describe("base64ToUint8Array", () => {
  test("decodes to the original bytes", () => {
    expect(base64ToUint8Array("SGVsbG8=")).toEqual(
      new TextEncoder().encode("Hello")
    );
  });

  test("accepts a data-URI prefixed payload", () => {
    expect(base64ToUint8Array("data:image/png;base64,SGVsbG8=")).toEqual(
      new TextEncoder().encode("Hello")
    );
  });

  test("round-trips through arrayBufferToBase64", () => {
    const original = new Uint8Array(1000);
    for (let i = 0; i < original.length; i++) original[i] = i % 251;
    const encoded = arrayBufferToBase64(original.buffer as ArrayBuffer);
    expect(base64ToUint8Array(encoded)).toEqual(original);
  });
});
