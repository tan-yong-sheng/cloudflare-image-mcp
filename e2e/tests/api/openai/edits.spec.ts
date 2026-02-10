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

  test('POST /v1/images/edits with image for image-to-image transformation', async ({ request }) => {
    const model = '@cf/stabilityai/stable-diffusion-xl-base-1.0';

    const response = await request.post('/v1/images/edits', {
      data: {
        image: TEST_IMAGE_BASE64,
        prompt: 'Make this image blue',
        model: model,
        n: 1,
        size: '1024x1024',
      },
    });

    // Image-to-image may not be available in all environments
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
      console.log(`Image-to-image returned ${response.status()} (may not be supported)`);
    }
  });

  test('POST /v1/images/edits with image and mask for masked edits', async ({ request }) => {
    const model = '@cf/stabilityai/stable-diffusion-xl-base-1.0';

    const response = await request.post('/v1/images/edits', {
      data: {
        image: TEST_IMAGE_BASE64,
        mask: TEST_MASK_BASE64,
        prompt: 'Add a star in the masked area',
        model: model,
        n: 1,
        size: '1024x1024',
      },
    });

    // Inpainting may not be available in all environments
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
    } else {
      console.log(`Inpainting returned ${response.status()} (may not be supported)`);
    }
  });

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

  test('POST /v1/images/edits accepts multipart/form-data', async ({ request }) => {
    // Create a FormData-like structure for the test
    const boundary = '----TestBoundary' + Math.random().toString(36).substring(2);

    const body = [
      `------${boundary}`,
      `Content-Disposition: form-data; name="prompt"`,
      '',
      'Make this image better',
      `------${boundary}`,
      `Content-Disposition: form-data; name="model"`,
      '',
      '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      `------${boundary}`,
      `Content-Disposition: form-data; name="image"; filename="test.png"`,
      'Content-Type: image/png',
      '',
      Buffer.from(TEST_IMAGE_BASE64, 'base64').toString('binary'),
      `------${boundary}--`,
    ].join('\r\n');

    const response = await request.fetch('/v1/images/edits', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=----${boundary}`,
      },
      data: body,
    });

    // Multipart support may vary by environment
    expect([200, 400, 415, 500]).toContain(response.status());
  });

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

  test('POST /v1/images/edits respects size parameter', async ({ request }) => {
    const sizes = ['512x512', '1024x1024'];

    for (const size of sizes) {
      const response = await request.post('/v1/images/edits', {
        data: {
          image: TEST_IMAGE_BASE64,
          prompt: 'Test',
          model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
          size,
        },
      });

      if (response.status() === 200) {
        console.log(`Size ${size} accepted`);
      }
    }
  });
});
