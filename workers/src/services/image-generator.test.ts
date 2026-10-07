// ============================================================================
// Image generator seam tests - runOnce / runMany interface coverage
// ============================================================================
// Seam: ImageGeneratorService.runOnce + runMany with in-memory adapters.
// The transport returns canned Cloudflare result shapes and the store
// records uploads; assertions cover observable image output and error
// envelopes for text-to-image, image-to-image, and masked edits.

import { describe, expect, test } from "vitest";
import {
  ImageGeneratorService,
  type GenerationRequest,
} from "./image-generator.js";
import type { AITransport, ImageStore } from "./generation-adapters.js";
import type { Env, ModelConfig } from "../types.js";

const TEXT_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const IMG2IMG_MODEL = "@cf/lykon/dreamshaper-8-lcm";
const MASK_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";
const MASK_REQUIRED_MODEL = "@cf/runwayml/stable-diffusion-v1-5-inpainting";
const MULTI_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

/** "hello" as base64 — known-good literal, independent of the code. */
const HELLO_B64 = "aGVsbG8=";

type CannedResult =
  { kind: "result"; value: unknown } | { kind: "error"; message: string };

class MemoryTransport implements AITransport {
  calls: Array<{
    modelId: string;
    payload: Record<string, unknown>;
    images?: string[];
  }> = [];
  private queue: CannedResult[] = [];

  /** Queue one canned outcome per expected call, in order. */
  enqueue(result: unknown): void {
    this.queue.push({ kind: "result", value: result });
  }

  enqueueError(message: string): void {
    this.queue.push({ kind: "error", message });
  }

  async run(
    modelId: string,
    payload: Record<string, any>,
    _model: ModelConfig,
    images?: string[]
  ): Promise<unknown> {
    this.calls.push({ modelId, payload, images });
    const next = this.queue.shift();
    if (!next) {
      return { image: HELLO_B64 };
    }
    if (next.kind === "error") {
      throw new Error(next.message);
    }
    return next.value;
  }
}

class MemoryStore implements ImageStore {
  uploads: Array<{
    data: string | ArrayBuffer;
    metadata: { model: string; prompt: string };
  }> = [];

  async uploadImage(
    imageData: string | ArrayBuffer,
    metadata: { model: string; prompt: string; parameters?: object }
  ): Promise<{ id: string; url: string; expiresAt: number }> {
    const record = {
      data: imageData,
      metadata: { model: metadata.model, prompt: metadata.prompt },
    };
    this.uploads.push(record);
    const id = `test-${this.uploads.length}`;
    return { id, url: `/images/test/${id}.png`, expiresAt: 0 };
  }

  async cleanupExpired(): Promise<number> {
    return 0;
  }
}

function setup() {
  const transport = new MemoryTransport();
  const store = new MemoryStore();
  const env = {
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_API_TOKEN: "token",
    IMAGE_EXPIRY_HOURS: "24",
    IMAGE_BUCKET: {},
  } as unknown as Env;
  const generator = new ImageGeneratorService(env, { transport, store });
  return { generator, transport, store };
}

function textRequest(
  overrides: Partial<GenerationRequest> = {}
): GenerationRequest {
  return { modelId: TEXT_MODEL, prompt: "a cat", ...overrides };
}

describe("runOnce text-to-image", () => {
  test("returns the stored image URL and records upload metadata", async () => {
    const { generator, transport, store } = setup();

    const result = await generator.runOnce(textRequest());

    expect(result).toEqual({
      success: true,
      imageUrl: "/images/test/test-1.png",
      imageId: "test-1",
    });
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].modelId).toBe(TEXT_MODEL);
    expect(transport.calls[0].payload.prompt).toBe("a cat");
    expect(store.uploads).toHaveLength(1);
    expect(store.uploads[0].metadata).toEqual({
      model: TEXT_MODEL,
      prompt: "a cat",
    });
  });

  test("prompt-embedded params reach the transport payload", async () => {
    const { generator, transport } = setup();

    await generator.runOnce(textRequest({ prompt: "a cat --steps=6" }));

    expect(transport.calls[0].payload.steps).toBe(6);
    expect(transport.calls[0].payload.prompt).toBe("a cat");
  });

  test("returnBase64 returns cleaned base64 without uploading", async () => {
    const { generator, store } = setup();

    const result = await generator.runOnce(
      textRequest({
        returnBase64: true,
      })
    );

    expect(result.success).toBe(true);
    expect(result.base64Data).toBe(HELLO_B64);
    expect(result.imageUrl).toBeUndefined();
    expect(store.uploads).toHaveLength(0);
  });

  test("data-URI prefixes are stripped from base64 results", async () => {
    const { generator, transport } = setup();
    transport.enqueue({ image: `data:image/png;base64,${HELLO_B64}` });

    const result = await generator.runOnce(textRequest({ returnBase64: true }));

    expect(result.base64Data).toBe(HELLO_B64);
  });

  test("binary transport results convert to base64", async () => {
    const { generator, transport } = setup();
    transport.enqueue(new Uint8Array([104, 101, 108, 108, 111]).buffer);

    const result = await generator.runOnce(textRequest({ returnBase64: true }));

    expect(result.base64Data).toBe(HELLO_B64);
  });

  test("unknown model returns an error envelope", async () => {
    const { generator, transport, store } = setup();

    const result = await generator.runOnce(
      textRequest({ modelId: "@cf/nope/missing" })
    );

    expect(result).toEqual({
      success: false,
      error: "Unknown model: @cf/nope/missing",
    });
    expect(transport.calls).toHaveLength(0);
    expect(store.uploads).toHaveLength(0);
  });

  test("empty transport result returns a no-image error", async () => {
    const { generator, transport } = setup();
    transport.enqueue({ unexpected: "shape" });

    const result = await generator.runOnce(textRequest({ returnBase64: true }));

    expect(result).toEqual({
      success: false,
      error: "No image in model response",
    });
  });

  test("transport failures surface as error envelopes", async () => {
    const { generator, transport } = setup();
    transport.enqueueError("Cloudflare AI API error (500): boom");

    const result = await generator.runOnce(textRequest());

    expect(result).toEqual({
      success: false,
      error: "Cloudflare AI API error (500): boom",
    });
  });
});

describe("runOnce image-to-image", () => {
  test("edits run through the seam and return stored URLs", async () => {
    const { generator, transport } = setup();

    const result = await generator.runOnce({
      modelId: IMG2IMG_MODEL,
      prompt: "add a hat",
      images: "QUJD",
    });

    expect(result.success).toBe(true);
    expect(result.imageUrl).toBe("/images/test/test-1.png");
    expect(transport.calls[0].images).toEqual(["QUJD"]);
  });

  test("multiple reference images reach a multi-image model", async () => {
    const { generator, transport } = setup();

    const result = await generator.runOnce({
      modelId: MULTI_MODEL,
      prompt: "combine styles",
      images: ["QUJD", "REVG"],
    });

    expect(result.success).toBe(true);
    expect(transport.calls[0].images).toEqual(["QUJD", "REVG"]);
  });

  test("text-only models reject image inputs", async () => {
    const { generator, transport } = setup();

    const result = await generator.runOnce({
      modelId: TEXT_MODEL,
      prompt: "add a hat",
      images: "QUJD",
    });

    expect(result).toEqual({
      success: false,
      error: `Model ${TEXT_MODEL} does not support image-to-image`,
    });
    expect(transport.calls).toHaveLength(0);
  });

  test("mask-required models redirect to the masked-edit route", async () => {
    const { generator, transport } = setup();

    const result = await generator.runOnce({
      modelId: MASK_REQUIRED_MODEL,
      prompt: "fill the hole",
      images: "QUJD",
    });

    expect(result).toEqual({
      success: false,
      error:
        `Model ${MASK_REQUIRED_MODEL} requires a mask; ` +
        "use /v1/images/edits with mask (masked edit).",
    });
    expect(transport.calls).toHaveLength(0);
  });

  test("input counts above the model limit are rejected", async () => {
    const { generator, transport } = setup();

    const result = await generator.runOnce({
      modelId: MULTI_MODEL,
      prompt: "too many",
      images: ["a", "b", "c", "d", "e"],
    });

    expect(result).toEqual({
      success: false,
      error: `Model ${MULTI_MODEL} supports up to 4 input image(s), got 5`,
    });
    expect(transport.calls).toHaveLength(0);
  });
});

describe("runOnce masked edits", () => {
  test("masked edits run through the seam and return stored URLs", async () => {
    const { generator, transport } = setup();

    const result = await generator.runOnce({
      modelId: MASK_MODEL,
      prompt: "remove the fence",
      images: "QUJD",
      mask: "TUFT",
    });

    expect(result.success).toBe(true);
    expect(result.imageUrl).toBe("/images/test/test-1.png");
    expect(transport.calls).toHaveLength(1);
  });

  test("models without mask support reject masked edits", async () => {
    const { generator, transport } = setup();

    const result = await generator.runOnce({
      modelId: IMG2IMG_MODEL,
      prompt: "remove the fence",
      images: "QUJD",
      mask: "TUFT",
    });

    expect(result).toEqual({
      success: false,
      error: `Model ${IMG2IMG_MODEL} does not support mask-based edits`,
    });
    expect(transport.calls).toHaveLength(0);
  });

  test("masked edits accept exactly one image", async () => {
    const { generator, transport } = setup();

    const result = await generator.runOnce({
      modelId: MASK_MODEL,
      prompt: "remove the fence",
      images: ["QUJD", "REVG"],
      mask: "TUFT",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("mask can only be used with a single image");
    expect(transport.calls).toHaveLength(0);
  });
});

describe("runMany", () => {
  test("batch runs return one stored image per request", async () => {
    const { generator } = setup();

    const result = await generator.runMany(textRequest(), 3);

    expect(result.success).toBe(true);
    expect(result.images).toHaveLength(3);
    expect(result.images[0]).toEqual({
      url: "/images/test/test-1.png",
      id: "test-1",
    });
  });

  test("explicit seeds increment across batch runs", async () => {
    const { generator, transport } = setup();

    await generator.runMany(textRequest({ explicitParams: { seed: 41 } }), 3);

    expect(
      transport.calls.map((call) => (call.payload as { seed?: number }).seed)
    ).toEqual([41, 42, 43]);
  });

  test("batch base64 runs return inline payloads without uploading", async () => {
    const { generator, store } = setup();

    const result = await generator.runMany(
      textRequest({ returnBase64: true }),
      2
    );

    expect(result).toEqual({
      success: true,
      images: [{ b64_json: HELLO_B64 }, { b64_json: HELLO_B64 }],
    });
    expect(store.uploads).toHaveLength(0);
  });

  test("a mid-batch failure keeps completed images and reports the error", async () => {
    const { generator, transport } = setup();
    transport.enqueue({ image: HELLO_B64 });
    transport.enqueueError("Cloudflare AI API error (429): rate limited");

    const result = await generator.runMany(textRequest(), 3);

    expect(result.success).toBe(false);
    expect(result.images).toHaveLength(1);
    expect(result.error).toBe("Cloudflare AI API error (429): rate limited");
  });

  test("batch masked edits route through the seam", async () => {
    const { generator } = setup();

    const result = await generator.runMany(
      {
        modelId: MASK_MODEL,
        prompt: "remove the fence",
        images: "QUJD",
        mask: "TUFT",
      },
      2
    );

    expect(result.success).toBe(true);
    expect(result.images).toHaveLength(2);
  });
});
