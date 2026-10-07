// ============================================================================
// Contract-test fixtures - committed fake inference responses, zero network
// ============================================================================
// The 1x1 red PNG below stands in for a Workers AI image result. Tests stub
// the outbound `api.cloudflare.com/.../ai/run/...` call (the `runAI` seam
// in services/image-generator.ts) and assert the full Worker path around
// it: param parsing -> R2 upload -> /images/ serve -> OpenAI/MCP shaping.
//
// If the provider changes its envelope, add a new fixture here (named by
// model + responseFormat) rather than editing assertions in place: a new
// fixture fails loudly, an edited one hides drift.

/** 1x1 red PNG, base64 (no data-URI prefix). */
export const FIXTURE_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function fixturePngBytes(): Uint8Array {
  const binary = atob(FIXTURE_PNG_B64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * What a base64-format model (e.g. flux-1-schnell, responseFormat base64)
 * returns through the REST envelope: { result: { image: "<b64>" } }.
 */
export function jsonEnvelopeImage() {
  return { result: { image: FIXTURE_PNG_B64 } };
}

/**
 * What a binary-format model (e.g. sdxl-base-1.0, responseFormat binary)
 * returns: raw image bytes with an image content-type.
 */
export function binaryImageResponse(): Response {
  const bytes = fixturePngBytes();
  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: { "Content-Type": "image/png" },
  });
}

/** Minimal in-memory R2Bucket: put/get round-trip, delete/list for cleanup. */
export function fakeBucket(): R2Bucket {
  const store = new Map<
    string,
    { body: ArrayBuffer; httpMetadata?: any; customMetadata?: any }
  >();
  const toBuf = async (v: any): Promise<ArrayBuffer> => {
    if (v instanceof ArrayBuffer) return v;
    if (v instanceof Uint8Array) {
      const copy = new Uint8Array(v.byteLength);
      copy.set(v);
      return copy.buffer;
    }
    if (typeof v === "string") {
      const encoded = new TextEncoder().encode(v);
      return encoded.buffer.slice(
        encoded.byteOffset,
        encoded.byteOffset + encoded.byteLength
      );
    }
    if (v && typeof v.arrayBuffer === "function") return v.arrayBuffer();
    throw new Error(`fakeBucket: unsupported body type ${typeof v}`);
  };
  return {
    async put(key: string, value: any, options: any = {}) {
      store.set(key, {
        body: await toBuf(value),
        httpMetadata: options.httpMetadata,
        customMetadata: options.customMetadata,
      });
      return null as any;
    },
    async get(key: string) {
      const obj = store.get(key);
      if (!obj) return null;
      return {
        body: obj.body,
        httpMetadata: obj.httpMetadata,
        customMetadata: obj.customMetadata,
        arrayBuffer: async () => obj.body,
      } as any;
    },
    async delete(keys: any) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) store.delete(k);
    },
    async list(options: any = {}) {
      const prefix = options.prefix ?? "";
      const objects = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((key) => ({ key, customMetadata: store.get(key)!.customMetadata }));
      return { objects, truncated: false } as any;
    },
  } as unknown as R2Bucket;
}

/** Minimal Env for contract tests: fake R2, dummy inference credentials. */
export function fakeEnv(): Env {
  return {
    IMAGE_BUCKET: fakeBucket(),
    CLOUDFLARE_API_TOKEN: "test-token",
    CLOUDFLARE_ACCOUNT_ID: "test-account",
    IMAGE_EXPIRY_HOURS: "24",
  };
}

// Local type import (type-only, erased at runtime).
import type { Env } from "../types.js";
