import { test, expect } from "@playwright/test";

/**
 * OpenAI Image Generations API E2E Tests (live canary + contract suite)
 *
 * Live inference here is ONE test: the @smoke canary proving the
 * credential chain + model drift on the deployed Worker. Every other
 * shape assertion lives hermetically in
 * workers/src/endpoints/openai-contract.test.ts (stubbed fetch, fake R2).
 * @api
 */

test.describe("OpenAI Image Generations API", () => {
  // Default test model (fastest for testing)
  const TEST_MODEL = "@cf/black-forest-labs/flux-1-schnell";

  // Live canary (kept): proves the credential chain + model drift.
  // Contract mirror: openai-contract.test.ts > minimal params.
  test("POST /v1/images/generations with minimal parameters @slow @smoke", async ({
    request,
  }) => {
    const response = await request.post("/v1/images/generations", {
      data: {
        prompt: "A sunny day at the beach with palm trees and ocean waves",
        model: TEST_MODEL,
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const body = await response.json();

    // Validate OpenAI-compatible response
    expect(body).toHaveProperty("created");
    expect(typeof body.created).toBe("number");
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Validate image data
    const image = body.data[0];
    expect(image).toHaveProperty("url");
    expect(typeof image.url).toBe("string");
    // URL can be absolute or relative, but must point to the worker image proxy (/images/...)
    const path = image.url.startsWith("http")
      ? new URL(image.url).pathname
      : image.url;
    expect(path).toMatch(/^\/images\//);

    console.log("✅ Image URL:", image.url);
  });

  test("POST /v1/images/generations without prompt returns 400", async ({
    request,
  }) => {
    const response = await request.post("/v1/images/generations", {
      data: {
        model: TEST_MODEL,
      },
    });

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("message");
    expect(body.error.message.toLowerCase()).toContain("prompt");
  });

  test("POST /v1/images/generations with empty prompt returns 400", async ({
    request,
  }) => {
    const response = await request.post("/v1/images/generations", {
      data: {
        prompt: "",
        model: TEST_MODEL,
      },
    });

    expect(response.status()).toBe(400);
  });

  test("POST /v1/images/generations with invalid model returns error", async ({
    request,
  }) => {
    const response = await request.post("/v1/images/generations", {
      data: {
        prompt: "Test prompt",
        model: "@cf/invalid/model-name",
      },
    });

    // Should return 400 or 500 depending on implementation
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
