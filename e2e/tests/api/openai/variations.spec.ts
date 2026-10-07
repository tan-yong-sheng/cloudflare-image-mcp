import { test, expect } from "@playwright/test";

/**
 * OpenAI Image Variations API E2E Tests
 *
 * Tests the /v1/images/variations endpoint.
 * @api
 */

// Test image - 1x1 pixel red PNG in base64
const TEST_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test.describe("OpenAI Image Variations API", () => {
  test("POST /v1/images/variations without image returns 400", async ({
    request,
  }) => {
    const response = await request.post("/v1/images/variations", {
      data: {
        model: "@cf/black-forest-labs/flux-2-klein-4b",
      },
    });

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error.message.toLowerCase()).toContain("image");
  });
});
