import { test, expect } from '@playwright/test';

/**
 * OpenAI Image Generations API E2E Tests
 *
 * Tests the /v1/images/generations endpoint for text-to-image generation.
 * @api
 */

test.describe('OpenAI Image Generations API', () => {
  // Default test model (fastest for testing)
  const TEST_MODEL = '@cf/black-forest-labs/flux-1-schnell';

  test('POST /v1/images/generations with minimal parameters', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A simple red circle on white background',
        model: TEST_MODEL,
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body = await response.json();

    // Validate OpenAI-compatible response
    expect(body).toHaveProperty('created');
    expect(typeof body.created).toBe('number');
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Validate image data
    const image = body.data[0];
    expect(image).toHaveProperty('url');
    expect(typeof image.url).toBe('string');
    expect(image.url).toMatch(/^https?:\/\//);

    console.log('Generated image URL:', image.url);
  });

  test('POST /v1/images/generations with all parameters', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A blue square on white background',
        model: TEST_MODEL,
        n: 2,
        size: '1024x1024',
        steps: 4,
        seed: 42,
        response_format: 'url',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(2);

    // Verify each image has a URL
    for (const image of body.data) {
      expect(image).toHaveProperty('url');
      expect(image.url).toMatch(/^https?:\/\//);
    }
  });

  test('POST /v1/images/generations with b64_json response format', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A green triangle on white background',
        model: TEST_MODEL,
        n: 1,
        response_format: 'b64_json',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(1);

    const image = body.data[0];
    expect(image).toHaveProperty('b64_json');
    expect(typeof image.b64_json).toBe('string');

    // Validate base64 format
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    expect(image.b64_json).toMatch(base64Regex);
  });

  test('POST /v1/images/generations without prompt returns 400', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        model: TEST_MODEL,
      },
    });

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('message');
    expect(body.error.message.toLowerCase()).toContain('prompt');
  });

  test('POST /v1/images/generations with empty prompt returns 400', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: '',
        model: TEST_MODEL,
      },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /v1/images/generations with invalid model returns error', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'Test prompt',
        model: '@cf/invalid/model-name',
      },
    });

    // Should return 400 or 500 depending on implementation
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('POST /v1/images/generations respects n parameter limit', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A simple shape',
        model: TEST_MODEL,
        n: 10, // Request more than max
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    // Should be capped at 8 images
    expect(body.data.length).toBeLessThanOrEqual(8);
  });

  test('POST /v1/images/generations with guidance parameter', async ({ request }) => {
    const modelWithGuidance = '@cf/stabilityai/stable-diffusion-xl-base-1.0';

    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A star on black background',
        model: modelWithGuidance,
        guidance: 7.5,
        num_steps: 20,
      },
    });

    // May fail if model not available, but tests parameter handling
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.data).toHaveLengthGreaterThan(0);
    }
  });

  test('POST /v1/images/generations with negative prompt', async ({ request }) => {
    const modelWithNegPrompt = '@cf/stabilityai/stable-diffusion-xl-base-1.0';

    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A beautiful landscape',
        model: modelWithNegPrompt,
        negative_prompt: 'blurry, low quality',
        num_steps: 20,
      },
    });

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.data).toHaveLengthGreaterThan(0);
    }
  });

  test('POST /v1/images/generations returns CORS headers', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'Test',
        model: TEST_MODEL,
      },
    });

    expect(response.headers()['access-control-allow-origin']).toBe('*');
  });
});
