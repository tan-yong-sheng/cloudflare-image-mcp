// ============================================================================
// R2 storage unit tests - upload / exact-key resolve / cleanup seam
// ============================================================================
// Seam: R2StorageService public methods with an in-memory R2Bucket double.
// Keys use the production shape (images/<date>/<id>.png); assertions pin
// the observable contract: upload returns a retrievable reference,
// resolve matches exact keys only, and cleanup guards invalid timestamps.

import { describe, expect, test } from "vitest";
import { R2StorageService } from "./r2-storage.js";
import type { Env } from "../types.js";

function testEnv(): Env {
  return {
    IMAGE_BUCKET: {},
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_API_TOKEN: "token",
    IMAGE_EXPIRY_HOURS: "24",
  } as unknown as Env;
}

interface StoredObject {
  body: ArrayBuffer;
  customMetadata: Record<string, string>;
  size: number;
}

class MemoryBucket {
  objects = new Map<string, StoredObject>();
  deleted: string[] = [];

  async put(
    key: string,
    body: ArrayBuffer,
    options: { customMetadata: Record<string, string> }
  ): Promise<void> {
    this.objects.set(key, {
      body,
      customMetadata: options.customMetadata,
      size: body.byteLength,
    });
  }

  async list(options: { prefix: string; limit: number }): Promise<{
    objects: Array<{
      key: string;
      size: number;
      customMetadata: Record<string, string>;
    }>;
    truncated: boolean;
  }> {
    const matches = [...this.objects.entries()]
      .filter(([key]) => key.startsWith(options.prefix))
      .slice(0, options.limit)
      .map(([key, stored]) => ({
        key,
        size: stored.size,
        customMetadata: stored.customMetadata,
      }));
    return { objects: matches, truncated: false };
  }

  async get(key: string): Promise<{
    customMetadata: Record<string, string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  } | null> {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      customMetadata: stored.customMetadata,
      arrayBuffer: async () => stored.body,
    };
  }

  async delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      this.objects.delete(key);
      this.deleted.push(key);
    }
  }
}

function setup() {
  const bucket = new MemoryBucket();
  const env = testEnv();
  (env as { IMAGE_BUCKET: unknown }).IMAGE_BUCKET = bucket;
  const service = new R2StorageService(env);
  return { bucket, service };
}

/** "hello" as base64 — known-good literal, independent of the code. */
const HELLO_B64 = "aGVsbG8=";

describe("uploadImage", () => {
  test("upload returns an id, a URL, and a future expiry", async () => {
    const { service } = setup();
    const before = Date.now();

    const result = await service.uploadImage(HELLO_B64, {
      model: "@cf/test/model",
      prompt: "a cat",
      parameters: {},
    });

    expect(result.id.length).toBeGreaterThan(0);
    expect(result.url).toContain(`${result.id}.png`);
    expect(result.expiresAt).toBeGreaterThan(before);
  });
});

describe("resolveImage", () => {
  test("uploaded image resolves by exact id with its metadata", async () => {
    const { service } = setup();
    const uploaded = await service.uploadImage(HELLO_B64, {
      model: "@cf/test/model",
      prompt: "a cat",
      parameters: {},
    });

    const resolved = await service.resolveImage(uploaded.id);

    expect(resolved).not.toBeNull();
    expect(resolved?.metadata.id).toBe(uploaded.id);
    expect(resolved?.metadata.model).toBe("@cf/test/model");
    expect(resolved?.metadata.prompt).toBe("a cat");
    expect(new TextDecoder().decode(resolved?.data)).toBe("hello");
  });

  test("unknown id resolves to null", async () => {
    const { service } = setup();

    await expect(service.resolveImage("no-such-id")).resolves.toBeNull();
  });

  test("a key that merely contains the id does not resolve", async () => {
    const { bucket, service } = setup();
    await bucket.put(
      `other-${"abc"}.png`,
      new TextEncoder().encode("x").buffer as ArrayBuffer,
      {
        customMetadata: {
          model: "m",
          prompt: "p",
          createdAt: "1",
          expiresAt: String(Date.now() + 3600_000),
        },
      }
    );

    await expect(service.resolveImage("abc")).resolves.toBeNull();
  });
});

describe("cleanupExpired", () => {
  test("deletes expired images and keeps live ones", async () => {
    const { bucket, service } = setup();
    const past = Date.now() - 1000;
    const future = Date.now() + 3600_000;
    const put = (key: string, expiresAt: string) =>
      bucket.put(key, new TextEncoder().encode("x").buffer as ArrayBuffer, {
        customMetadata: {
          model: "m",
          prompt: "p",
          createdAt: "1",
          expiresAt,
        },
      });
    await put("images/2024-01-01/old.png", String(past));
    await put("images/2024-01-01/live.png", String(future));

    const deleted = await service.cleanupExpired();

    expect(deleted).toBe(1);
    expect(bucket.deleted).toEqual(["images/2024-01-01/old.png"]);
    expect(bucket.objects.has("images/2024-01-01/live.png")).toBe(true);
  });

  test("invalid expiry timestamps are skipped, never deleted", async () => {
    const { bucket, service } = setup();
    await bucket.put(
      "images/2024-01-01/corrupt.png",
      new TextEncoder().encode("x").buffer as ArrayBuffer,
      {
        customMetadata: {
          model: "m",
          prompt: "p",
          createdAt: "1",
          expiresAt: "not-a-number",
        },
      }
    );

    const deleted = await service.cleanupExpired();

    expect(deleted).toBe(0);
    expect(bucket.deleted).toHaveLength(0);
    expect(bucket.objects.has("images/2024-01-01/corrupt.png")).toBe(true);
  });

  test("numeric-prefix corrupt timestamps are kept, never deleted", async () => {
    // "0garbage" must not parse as 0 (expired): the guard keeps anything
    // that is not a finite integer expiry.
    const { bucket, service } = setup();
    for (const [key, expiresAt] of [
      ["images/2024-01-01/prefix.png", "0garbage"],
      ["images/2024-01-01/float.png", "123.45"],
      ["images/2024-01-01/blank.png", ""],
      ["images/2024-01-01/spaces.png", "   "],
    ] as Array<[string, string]>) {
      await bucket.put(
        key,
        new TextEncoder().encode("x").buffer as ArrayBuffer,
        {
          customMetadata: {
            model: "m",
            prompt: "p",
            createdAt: "1",
            expiresAt,
          },
        }
      );
    }

    const deleted = await service.cleanupExpired();

    expect(deleted).toBe(0);
    expect(bucket.deleted).toHaveLength(0);
  });
});
