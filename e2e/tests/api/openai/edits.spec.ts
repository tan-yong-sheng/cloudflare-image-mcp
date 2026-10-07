import { test, expect } from '@playwright/test';

/**
 * OpenAI Image Edits API E2E Tests
 *
 * Tests the /v1/images/edits endpoint for image editing (image-to-image and masked edits).
 * @api
 */

// Test image - 1x1 pixel red PNG in base64
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Test mask - 1x1 pixel white PNG in base64
const TEST_MASK_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR42mP8DwABAQEAA0Q9124AAAAASUVORK5CYII=';

test.describe('OpenAI Image Edits API', () => {
  // Retired (Phase 4): covered by openai-contract.test.ts > JSON
  // image-to-image. (The old test accepted ANY non-200 as a pass, so it
  // proved nothing about the Worker — the contract test asserts 200 +
  // /images/ url instead.)
  // test('POST /v1/images/edits with image for image-to-image transformation @slow', ...)

  // Retired (Phase 4): covered by openai-contract.test.ts > masked
  // inpainting + mask-required guard. (The old test accepted ANY
  // non-200 as a pass — same vacuous pattern as above.)
  // test('POST /v1/images/edits with image and mask for masked edits @slow', ...)

  test('POST /v1/images/edits with mask-required model without mask returns error', async ({ request }) => {
    const response = await request.post('/v1/images/edits', {
      data: {
        image: TEST_IMAGE_BASE64,
        prompt: 'Add something',
        model: '@cf/runwayml/stable-diffusion-v1-5-inpainting',
        n: 1,
        size: '512x512',
      },
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(String(body.error.message)).toMatch(/requires a mask/i);
  });

  test('POST /v1/images/edits without image returns 400', async ({ request }) => {
    const response = await request.post('/v1/images/edits', {
      data: {
        prompt: 'Edit this image',
        model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      },
    });

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error.message.toLowerCase()).toContain('image');
  });

  test('POST /v1/images/edits without prompt returns 400', async ({ request }) => {
    const response = await request.post('/v1/images/edits', {
      data: {
        image: TEST_IMAGE_BASE64,
        model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      },
    });

    expect(response.status()).toBe(400);
  });

  // Retired (Phase 4): covered by openai-contract.test.ts >
  // multipart image-to-image. (The old test accepted 400/415/500 as a
  // pass — it could never fail — so nothing is lost.)
  // test('POST /v1/images/edits accepts multipart/form-data @slow', ...)

  test('POST /v1/images/edits with invalid model returns error', async ({ request }) => {
    const response = await request.post('/v1/images/edits', {
      data: {
        image: TEST_IMAGE_BASE64,
        prompt: 'Test',
        model: '@cf/invalid/model',
      },
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  // Retired (Phase 4): the contract suite asserts 200 + url for both
  // sizes (openai-contract.test.ts > size parameter). The old test only
  // logged acceptance and asserted nothing.
  // test('POST /v1/images/edits respects size parameter @slow', ...)
});
