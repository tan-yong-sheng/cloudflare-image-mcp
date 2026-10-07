import { test, expect } from '@playwright/test';

/**
 * OpenAI Image Variations API E2E Tests
 *
 * Tests the /v1/images/variations endpoint.
 * @api
 */

// Test image - 1x1 pixel red PNG in base64
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.describe('OpenAI Image Variations API', () => {
  // Retired (Phase 4): covered by openai-contract.test.ts > JSON
  // variation. (The old test accepted ANY non-200 as a pass.)
  // test('POST /v1/images/variations with image @slow', ...)

  test('POST /v1/images/variations without image returns 400', async ({ request }) => {
    const response = await request.post('/v1/images/variations', {
      data: {
        model: '@cf/black-forest-labs/flux-2-klein-4b',
      },
    });

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error.message.toLowerCase()).toContain('image');
  });

  // Retired (Phase 4): variations n-capping is the same endpoint code
  // path as generations n-capping (generateImageToImages loop vs
  // generateImages loop, both Math.min(n, 8)); the generations cap is
  // pinned by openai-contract.test.ts > n above 8. (The old test
  // asserted nothing on non-200.)
  // test('POST /v1/images/variations respects n parameter @slow', ...)
});
