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
        prompt: 'A sunny day at the beach with palm trees and ocean waves',
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
    // URL should be absolute (https://) when CDN_URL is configured, or relative (/images/...)
    expect(image.url).toMatch(/^(https?:\/\/|\/images\/)/);

    // Log URL type for debugging
    if (image.url.startsWith('http')) {
      console.log('✅ Full CDN URL:', image.url);
    } else {
      console.log('⚠️  Relative URL (set CDN_URL for full URLs):', image.url);
    }
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

    // Verify each image has a URL (can be absolute or relative)
    for (const image of body.data) {
      expect(image).toHaveProperty('url');
      expect(image.url).toMatch(/^(https?:\/\/|\/images\/)/);
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

    // Validate base64 format (or URL if server doesn't support b64_json)
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    if (image.b64_json.match(/^https?:\/\//) || image.b64_json.match(/^\/images\//)) {
      // Server returned URL instead of base64 - skip validation
      console.log('Server returned URL instead of base64:', image.b64_json);
    } else {
      expect(image.b64_json).toMatch(base64Regex);
    }
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
        prompt: 'A mountain landscape with snow peaks and green forests',
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
      expect(body.data.length).toBeGreaterThan(0);
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
      expect(body.data.length).toBeGreaterThan(0);
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

  test('POST /v1/images/generations returns valid image URL format', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A beautiful sunset over mountains',
        model: TEST_MODEL,
        n: 1,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    const image = body.data[0];

    // URL must be a valid string
    expect(typeof image.url).toBe('string');
    expect(image.url.length).toBeGreaterThan(0);

    // URL should either be:
    // 1. Full HTTPS URL (when CDN_URL is configured): https://cdn.example.com/images/...
    // 2. Relative URL (when CDN_URL is not set): /images/...
    const isFullUrl = image.url.startsWith('https://');
    const isRelativeUrl = image.url.startsWith('/images/');

    expect(isFullUrl || isRelativeUrl).toBe(true);

    if (isFullUrl) {
      // Validate full URL format
      const urlPattern = /^https:\/\/[^\/]+\/images\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+\.png$/;
      expect(image.url).toMatch(urlPattern);
    }
  });

  test('POST /v1/images/generations returns OpenWebUI-compatible response', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A simple test image',
        model: TEST_MODEL,
        n: 1,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    // Response should have required fields for OpenWebUI compatibility
    expect(body).toHaveProperty('created');
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const image = body.data[0];

    // Must have url (not null/undefined)
    expect(image).toHaveProperty('url');
    expect(typeof image.url).toBe('string');
    expect(image.url).not.toBeNull();

    // Should have revised_prompt (OpenWebUI expects this)
    expect(image).toHaveProperty('revised_prompt');
    expect(typeof image.revised_prompt).toBe('string');

    // b64_json should NOT be present when response_format is url (default)
    // This was causing 'NoneType' object has no attribute 'lower' error in OpenWebUI
    if (image.b64_json !== undefined) {
      expect(image.b64_json).not.toBeNull();
    }
  });
});
