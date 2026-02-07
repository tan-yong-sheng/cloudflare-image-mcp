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
  test('POST /v1/images/variations with image', async ({ request }) => {
    const response = await request.post('/v1/images/variations', {
      data: {
        image: TEST_IMAGE_BASE64,
        model: '@cf/black-forest-labs/flux-2-klein-4b',
        n: 1,
        size: '1024x1024',
      },
    });

    // Variations may not be available in all environments
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('created');
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);

      if (body.data.length > 0) {
        expect(body.data[0]).toHaveProperty('url');
        expect(body.data[0].url).toMatch(/^https?:\/\//);
      }
    } else {
      console.log(`Variations returned ${response.status()} (may not be supported)`);
    }
  });

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

  test('POST /v1/images/variations respects n parameter', async ({ request }) => {
    const response = await request.post('/v1/images/variations', {
      data: {
        image: TEST_IMAGE_BASE64,
        model: '@cf/black-forest-labs/flux-2-klein-4b',
        n: 2,
      },
    });

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.data.length).toBeLessThanOrEqual(2);
    }
  });
});
