// ============================================================================
// Image generator seam tests - runOnce / runMany interface coverage
// ============================================================================
// Seam: ImageGeneratorService.runOnce + runMany with in-memory adapters.
// The transport returns canned Cloudflare result shapes and the store
// records uploads; assertions cover observable image output and error
// envelopes for text-to-image, image-to-image, and masked edits.

import { describe, expect, test, vi } from "vitest";
import {
  ImageGeneratorService,
  type GenerationRequest,
} from "./image-generator.js";
import { ProviderPool, type PoolKey } from "./provider-pool.js";
import { ProviderPools, type ProviderPoolEntry } from "./provider-pools.js";
import type { ExposureOverlay } from "../config/exposure-overlay.js";
import {
  RestAITransport,
  type AITransport,
  type ImageStore,
} from "./generation-adapters.js";
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

describe("listModels delegation (C3)", () => {
  // Q3 freeze: the service list is a projection of the config registry.
  // Every service entry must match its registry entry field-for-field;
  // the config list is the single source of truth.
  test("service list projects the config registry exactly", async () => {
    const { generator } = setup();
    const { MODEL_CONFIGS } = await import("../config/models.js");
    const listed = generator.listModels();
    expect(listed.map((m) => m.id).sort()).toEqual(
      Object.keys(MODEL_CONFIGS).sort()
    );
    for (const entry of listed) {
      const cfg = MODEL_CONFIGS[entry.id];
      expect(entry.name).toBe(cfg.name);
      expect(entry.description).toBe(cfg.description);
      expect(entry.provider).toBe(cfg.provider);
      expect(entry.supportedSizes).toEqual(cfg.limits.supportedSizes);
      expect(entry.taskTypes).toEqual(cfg.supportedTasks);
      expect(entry.editCapabilities ?? null).toEqual(
        cfg.editCapabilities ?? null
      );
    }
  });
});

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
      validationError: true,
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

  test("invalid params flag validation (maps to 400, not 500)", async () => {
    const { generator } = setup();

    const result = await generator.runOnce(
      textRequest({ explicitParams: { size: "bogus" } })
    );

    expect(result.success).toBe(false);
    expect(result.validationError).toBe(true);
    expect(result.error).toMatch("Invalid size format");
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
      validationError: true,
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
      validationError: true,
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
      validationError: true,
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
      validationError: true,
    });
    expect(transport.calls).toHaveLength(0);
  });

  test("explicitly empty image array is invalid input", async () => {
    const { generator, transport } = setup();

    const result = await generator.runOnce({
      modelId: IMG2IMG_MODEL,
      prompt: "add a hat",
      images: [],
    });

    expect(result.success).toBe(false);
    expect(result.validationError).toBe(true);
    expect(result.error).toMatch("At least one input image");
    expect(transport.calls).toHaveLength(0);
  });

  test("masked-edit input-shape guards flag validation", async () => {
    const { generator, transport } = setup();

    for (const images of [["QUJD", "REVG"], undefined]) {
      const result = await generator.runOnce({
        modelId: MASK_MODEL,
        prompt: "remove the fence",
        ...(images === undefined ? {} : { images }),
        mask: "TUFT",
      });

      expect(result.success).toBe(false);
      expect(result.validationError).toBe(true);
    }
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

  test("seed 0 increments across batch runs (not dropped as falsy)", async () => {
    const { generator, transport } = setup();

    await generator.runMany(textRequest({ explicitParams: { seed: 0 } }), 3);

    expect(
      transport.calls.map((call) => (call.payload as { seed?: number }).seed)
    ).toEqual([0, 1, 2]);
  });

  test("numeric-string seed increments as numbers, not concatenation", async () => {
    const { generator, transport } = setup();

    await generator.runMany(textRequest({ explicitParams: { seed: "5" } }), 2);

    expect(
      transport.calls.map((call) => (call.payload as { seed?: number }).seed)
    ).toEqual([5, 6]);
  });

  test("null seed behaves as absent (no validation error)", async () => {
    const { generator, transport } = setup();

    const result = await generator.runMany(
      textRequest({ explicitParams: { seed: null as unknown as number } }),
      2
    );

    expect(result.success).toBe(true);
    expect(result.images).toHaveLength(2);
    expect(
      transport.calls.map((call) => (call.payload as { seed?: number }).seed)
    ).toEqual([undefined, undefined]);
  });

  test("null seed preserves prompt-embedded seed", async () => {
    const { generator, transport } = setup();

    await generator.runMany(
      textRequest({
        prompt: "a cat --seed=42",
        explicitParams: { seed: null as unknown as number },
      }),
      2
    );

    expect(
      transport.calls.map((call) => (call.payload as { seed?: number }).seed)
    ).toEqual([42, 42]);
  });

  test("prompt-embedded seed survives when no base seed is given", async () => {
    const { generator, transport } = setup();

    await generator.runMany(textRequest({ prompt: "a cat --seed=7" }), 2);

    expect(
      transport.calls.map((call) => (call.payload as { seed?: number }).seed)
    ).toEqual([7, 7]);
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

describe("database-only credential wiring (ADR-001)", () => {
  /** One provider's pool, as the isolate cache would present it (C4). */
  function poolsOf(pool: ProviderPool): ProviderPools {
    return new ProviderPools([
      {
        providerId: "cloudflare",
        transport: "cloudflare-rest",
        pool,
      } satisfies ProviderPoolEntry,
    ]);
  }

  const minimalEnv = {
    IMAGE_EXPIRY_HOURS: "24",
    IMAGE_BUCKET: {},
  } as unknown as Env;

  function constructWith(pool: ProviderPool | undefined): string {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      new ImageGeneratorService(minimalEnv, {
        transport: new MemoryTransport(),
        store: new MemoryStore(),
        pools: pool ? poolsOf(pool) : undefined,
      });
      const allLogs = [
        ...warn.mock.calls.map((c) => String(c[0])),
        ...error.mock.calls.map((c) => String(c[0])),
      ].join("\n");
      return allLogs;
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  }

  const d1Keys: PoolKey[] = [
    {
      label: "k1",
      accountId: "d1-a1",
      apiToken: "d1-t1",
      weight: 1,
      enabled: true,
    },
    {
      label: "k2",
      accountId: "d1-a2",
      apiToken: "d1-t2",
      weight: 1,
      enabled: true,
    },
  ];

  test("a servable D1 pool is used, labels only in logs", () => {
    const said = constructWith(new ProviderPool(d1Keys, { source: "d1" }));
    expect(said).toContain("AI inference path: d1 with 2 account(s)");
    expect(said).not.toContain("d1-t1");
    expect(said).not.toContain("d1-a1");
  });

  test("a pool with no servable keys logs error (ADR-001)", () => {
    const disabled = d1Keys.map((k) => ({ ...k, enabled: false }));
    const said = constructWith(new ProviderPool(disabled, { source: "d1" }));
    expect(said).toContain("No AI provider credentials configured");
    expect(said).toContain("admin UI");
  });

  test("no pool logs error (ADR-001)", () => {
    const said = constructWith(undefined);
    expect(said).toContain("No AI provider credentials configured");
    expect(said).toContain("admin UI");
  });

  test("an empty pool surfaces a readable error, never the string null", async () => {
    // Production-shaped fix: with no servable credentials the service used
    // to build a real transport with zero accounts, and its bare
    // `throw lastError` produced { error: "null" } in the API envelope.
    const svc = new ImageGeneratorService(minimalEnv, {
      store: new MemoryStore(),
      pools: poolsOf(new ProviderPool([], { source: "d1" })),
    });

    const result = await svc.runOnce({ modelId: TEXT_MODEL, prompt: "a cat" });

    expect(result.success).toBe(false);
    expect(String(result.error)).not.toBe("null");
    expect(String(result.error)).toContain(
      "No AI provider credentials configured"
    );
  });

  // AC5-response fix (#72): "zero-secret-character assertions on logs AND
  // responses" — the log half was pinned, but no test scanned what the
  // service returns to callers. This drives runOnce + runMany through the
  // D1-pool path with credential-shaped secrets in every slot and scans
  // every returned envelope: base64 payloads, image URLs/ids, and error
  // strings.
  test("D1-pool responses carry zero secret characters", async () => {
    const transport = new MemoryTransport();
    transport.enqueue({ image: HELLO_B64 });
    const store = new MemoryStore();
    const svc = new ImageGeneratorService(minimalEnv, {
      transport,
      store,
      pools: poolsOf(
        new ProviderPool(
          [
            {
              label: "k1",
              accountId: "a1",
              apiToken: "SECRET-TOKEN-K1",
              weight: 1,
              enabled: true,
            },
          ],
          { source: "d1" }
        )
      ),
    });

    const one = await svc.runOnce({
      modelId: TEXT_MODEL,
      prompt: "a cat",
      returnBase64: true,
    });
    expect(one.success).toBe(true);
    expect(JSON.stringify(one)).not.toContain("SECRET-TOKEN-K1");
    expect(JSON.stringify(one)).not.toContain("env-token");
    expect(JSON.stringify(one)).not.toContain("deploy-token");

    transport.enqueue({ image: HELLO_B64 });
    const many = await svc.runMany({ modelId: TEXT_MODEL, prompt: "a cat" }, 1);
    expect(many.success).toBe(true);
    expect(JSON.stringify(many)).not.toContain("SECRET-TOKEN-K1");

    // Error path, production-shaped: a real pooled transport whose
    // upstream echoes the token must still yield a clean envelope —
    // scrubbing lives in the transport, the only module holding secrets.
    const realTransport = new RestAITransport(
      [{ account_id: "a1", api_token: "SECRET-TOKEN-K1" }],
      "d1",
      new ProviderPool(
        [
          {
            label: "k1",
            accountId: "a1",
            apiToken: "SECRET-TOKEN-K1",
            weight: 1,
            enabled: true,
          },
        ],
        { source: "d1" }
      )
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("boom SECRET-TOKEN-K1", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        })
      )
    );
    const failing = new ImageGeneratorService(minimalEnv, {
      transport: realTransport,
      store: new MemoryStore(),
    });
    const err = await failing.runOnce({
      modelId: TEXT_MODEL,
      prompt: "a cat",
    });
    expect(err.success).toBe(false);
    expect(String(err.error)).not.toContain("SECRET-TOKEN-K1");
    expect(String(err.error)).toContain("Cloudflare AI API error (500)");
  });
});

describe("exposure overlay wiring (S6)", () => {
  const env = {
    CLOUDFLARE_ACCOUNT_ID: "deploy-account",
    CLOUDFLARE_API_TOKEN: "deploy-token",
    IMAGE_EXPIRY_HOURS: "24",
    IMAGE_BUCKET: {},
  } as unknown as Env;

  function generatorWith(
    exposureOverlay: ExposureOverlay | undefined
  ): ImageGeneratorService {
    return new ImageGeneratorService(env, {
      transport: new MemoryTransport(),
      store: new MemoryStore(),
      exposureOverlay,
    });
  }

  test("a D1-enabled=false row hides the model from the service", () => {
    const generator = generatorWith(
      new Map([
        [
          IMG2IMG_MODEL,
          { enabled: false, alias: null, isDefault: false, excludedScopes: [] },
        ],
      ])
    );
    expect(generator.getModelConfig(IMG2IMG_MODEL)).toBeNull();
    expect(generator.listModels().map((m) => m.id)).not.toContain(
      IMG2IMG_MODEL
    );
    expect(generator.getModelConfig(TEXT_MODEL)?.id).toBe(TEXT_MODEL);
  });

  test("a D1 alias resolves through the service", () => {
    const generator = generatorWith(
      new Map([
        [
          TEXT_MODEL,
          {
            enabled: true,
            alias: "d1-alias",
            isDefault: false,
            excludedScopes: [],
          },
        ],
      ])
    );
    expect(generator.getModelConfig("d1-alias")?.id).toBe(TEXT_MODEL);
  });
});
