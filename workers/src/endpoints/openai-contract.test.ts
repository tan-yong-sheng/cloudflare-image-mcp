// ============================================================================
// OpenAI endpoint contract tests - full Worker path, stubbed inference
// ============================================================================
// Seam: global fetch at the outbound `api.cloudflare.com/.../ai/run/...`
// call (runAI in services/image-generator.ts), answered with a committed
// fixture image. Everything around the seam is real: ParamParser,
// ImageGeneratorService, fake R2 upload, endpoint response shaping.
// Expected shapes below come from the OpenAI spec + the live E2E matrix
// (e2e/tests/api/openai/*.spec.ts), not from the implementation.

import { afterEach, describe, expect, test, vi } from "vitest";
import { OpenAIEndpoint } from "./openai-endpoint.js";
import {
  FIXTURE_PNG_B64,
  fakeEnv,
  stubInference,
} from "../test-utils/fixtures.js";

const SCHNELL = "@cf/black-forest-labs/flux-1-schnell";
const SDXL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";
const KLEIN = "@cf/black-forest-labs/flux-2-klein-4b";
const INPAINT = "@cf/runwayml/stable-diffusion-v1-5-inpainting";
const ORIGIN = "https://worker.test";

afterEach(() => {
  vi.unstubAllGlobals();
});

function post(path: string, body: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /v1/images/generations contract", () => {
  test("minimal params returns created + data with /images/ url", async () => {
    stubInference("json");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/generations", { prompt: "a beach", model: SCHNELL })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as any;
    expect(typeof body.created).toBe("number");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    const url: string = body.data[0].url;
    expect(new URL(url).pathname).toMatch(/^\/images\//);
  });

  test("url format returns only url field, never b64_json", async () => {
    stubInference("json");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/generations", {
        prompt: "a beach",
        model: SCHNELL,
        n: 2,
        size: "1024x1024",
        steps: 4,
        seed: 42,
        response_format: "url",
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(2);
    for (const image of body.data) {
      expect(image).toHaveProperty("url");
      expect(image).not.toHaveProperty("b64_json");
      expect(image).not.toHaveProperty("revised_prompt");
    }
  });

  test("b64_json format returns only b64_json field", async () => {
    stubInference("json");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/generations", {
        prompt: "a beach",
        model: SCHNELL,
        response_format: "b64_json",
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty("b64_json", FIXTURE_PNG_B64);
    expect(body.data[0]).not.toHaveProperty("url");
  });

  test("missing prompt returns 400 naming prompt", async () => {
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/generations", { model: SCHNELL })
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.message.toLowerCase()).toContain("prompt");
  });

  test("unknown model returns 400 invalid_request_error", async () => {
    stubInference("json");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/generations", {
        prompt: "a beach",
        model: "@cf/invalid/model-name",
      })
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.code).toBeNull();
    expect(String(body.error.message)).toMatch(/unknown model/i);
  });

  test("n above 8 is capped at 8", async () => {
    const fetchMock = stubInference("json");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/generations", {
        prompt: "a beach",
        model: SCHNELL,
        n: 10,
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(8);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  test("guidance + negative prompt flow through to a url", async () => {
    stubInference("binary");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/generations", {
        prompt: "a star",
        model: SDXL,
        guidance: 7.5,
        negative_prompt: "blurry, low quality",
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(new URL(body.data[0].url).pathname).toMatch(/^\/images\//);
  });

  test("CORS header present on generation response", async () => {
    stubInference("json");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/generations", { prompt: "a beach", model: SCHNELL })
    );

    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("POST /v1/images/edits contract", () => {
  test("JSON image-to-image returns url", async () => {
    stubInference("binary");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/edits", {
        prompt: "make it sunny",
        model: SDXL,
        image: FIXTURE_PNG_B64,
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(new URL(body.data[0].url).pathname).toMatch(/^\/images\//);
  });

  test("multipart image-to-image returns url", async () => {
    stubInference("binary");
    const endpoint = new OpenAIEndpoint(fakeEnv());
    const form = new FormData();
    form.append("prompt", "make it sunny");
    form.append("model", SDXL);
    form.append(
      "image",
      new Blob([FIXTURE_PNG_B64], { type: "text/plain" }),
      "input.png"
    );

    const res = await endpoint.handle(
      new Request(`${ORIGIN}/v1/images/edits`, { method: "POST", body: form })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(new URL(body.data[0].url).pathname).toMatch(/^\/images\//);
  });

  test("multipart FLUX-2 klein edit returns url", async () => {
    stubInference("json");
    const endpoint = new OpenAIEndpoint(fakeEnv());
    const form = new FormData();
    form.append("prompt", "make it green");
    form.append("model", KLEIN);
    form.append(
      "image",
      new Blob([FIXTURE_PNG_B64], { type: "text/plain" }),
      "input.png"
    );

    const res = await endpoint.handle(
      new Request(`${ORIGIN}/v1/images/edits`, { method: "POST", body: form })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(new URL(body.data[0].url).pathname).toMatch(/^\/images\//);
  });

  test("mask-required model without mask returns 400 naming mask", async () => {
    stubInference("binary");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/edits", {
        prompt: "add something",
        model: INPAINT,
        image: FIXTURE_PNG_B64,
      })
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.code).toBeNull();
    expect(String(body.error.message)).toMatch(/mask/i);
  });

  test("masked inpainting returns url", async () => {
    stubInference("binary");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/edits", {
        prompt: "add a star",
        model: INPAINT,
        image: FIXTURE_PNG_B64,
        mask: FIXTURE_PNG_B64,
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(new URL(body.data[0].url).pathname).toMatch(/^\/images\//);
  });

  test("size parameter flows through to a url", async () => {
    stubInference("binary");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    for (const size of ["512x512", "1024x1024"]) {
      const res = await endpoint.handle(
        post("/v1/images/edits", {
          prompt: "edit this",
          model: SDXL,
          image: FIXTURE_PNG_B64,
          size,
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(new URL(body.data[0].url).pathname).toMatch(/^\/images\//);
    }
  });

  test("missing image returns 400", async () => {
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/edits", { prompt: "make it sunny", model: SDXL })
    );

    expect(res.status).toBe(400);
  });
});

describe("POST /v1/images/variations contract", () => {
  test("JSON variation returns url", async () => {
    stubInference("binary");
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/variations", {
        model: SDXL,
        image: FIXTURE_PNG_B64,
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(new URL(body.data[0].url).pathname).toMatch(/^\/images\//);
  });

  test("missing image returns 400", async () => {
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(
      post("/v1/images/variations", { model: SDXL })
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /v1/models contract", () => {
  test("list returns OpenAI list envelope", async () => {
    const endpoint = new OpenAIEndpoint(fakeEnv());

    const res = await endpoint.handle(new Request(`${ORIGIN}/v1/models`));

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.object).toBe("list");
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty("id");
    expect(body.data[0].object).toBe("model");
  });
});
