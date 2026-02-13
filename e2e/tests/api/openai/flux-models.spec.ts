import { test, expect } from '@playwright/test';

/**
 * FLUX Model E2E Tests (real API calls)
 *
 * Tests /v1/images/generations and /v1/images/edits with FLUX-1 and FLUX-2 models.
 * These hit the live Cloudflare Workers AI backend.
 *
 * 4 tests total:
 *   1. FLUX-1 schnell  — text-to-image  (/v1/images/generations)
 *   2. FLUX-2 klein 4B — text-to-image  (/v1/images/generations)
 *   3. FLUX-2 klein 4B — image editing   (/v1/images/edits)
 *   4. FLUX-2 dev      — text-to-image  (/v1/images/generations, b64_json)
 *
 * @api
 */

// Tiny 4x4 red PNG for image editing tests
const TINY_IMAGE_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg==';

test.describe('FLUX Models – Real API', () => {
  // Generous timeout: image generation can take 10-30s per call
  test.setTimeout(120_000);

  // ───────────────────────────────────────────────────────────────
  // 1. FLUX-1 schnell — text-to-image (fastest model)
  // ───────────────────────────────────────────────────────────────
  test('FLUX-1 schnell: /v1/images/generations returns valid image URL', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A red circle on a white background',
        model: '@cf/black-forest-labs/flux-1-schnell',
        n: 1,
        steps: 4,
        seed: 42,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('created');
    expect(typeof body.created).toBe('number');
    expect(body.data).toHaveLength(1);

    const image = body.data[0];
    expect(image).toHaveProperty('url');
    expect(typeof image.url).toBe('string');

    // URL points to /images/YYYY-MM-DD/<id>.png (absolute or relative)
    const path = image.url.startsWith('http') ? new URL(image.url).pathname : image.url;
    expect(path).toMatch(/^\/images\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+\.png$/);

    // Should NOT contain b64_json (default format is url)
    expect(image).not.toHaveProperty('b64_json');
  });

  // ───────────────────────────────────────────────────────────────
  // 2. FLUX-2 klein 4B — text-to-image
  // ───────────────────────────────────────────────────────────────
  test('FLUX-2 klein 4B: /v1/images/generations returns valid image URL', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A blue square on a grey background',
        model: '@cf/black-forest-labs/flux-2-klein-4b',
        n: 1,
        steps: 4,
        seed: 123,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('created');
    expect(body.data).toHaveLength(1);

    const image = body.data[0];
    expect(image).toHaveProperty('url');
    expect(typeof image.url).toBe('string');
    expect(image.url).toMatch(/^https?:\/\//);
  });

  // ───────────────────────────────────────────────────────────────
  // 3. FLUX-2 klein 4B — image editing (/v1/images/edits)
  // ───────────────────────────────────────────────────────────────
  test('FLUX-2 klein 4B: /v1/images/edits with image returns valid result', async ({ request }) => {
    const response = await request.post('/v1/images/edits', {
      data: {
        image: TINY_IMAGE_B64,
        prompt: 'Make this image a green landscape',
        model: '@cf/black-forest-labs/flux-2-klein-4b',
        n: 1,
        steps: 4,
        seed: 99,
        response_format: 'b64_json',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('created');
    expect(typeof body.created).toBe('number');
    expect(body.data).toHaveLength(1);

    const image = body.data[0];
    expect(image).toHaveProperty('b64_json');
    expect(typeof image.b64_json).toBe('string');

    // Validate it's proper base64 (at least 100 chars for a real image)
    expect(image.b64_json.length).toBeGreaterThan(100);
    expect(image.b64_json).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  // ───────────────────────────────────────────────────────────────
  // 4. FLUX-2 dev — text-to-image (b64_json format)
  // ───────────────────────────────────────────────────────────────
  test('FLUX-2 dev: /v1/images/generations returns b64_json', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A yellow triangle on a dark background',
        model: '@cf/black-forest-labs/flux-2-dev',
        n: 1,
        steps: 4,
        seed: 77,
        response_format: 'b64_json',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('created');
    expect(body.data).toHaveLength(1);

    const image = body.data[0];
    expect(image).toHaveProperty('b64_json');
    expect(typeof image.b64_json).toBe('string');
    expect(image.b64_json.length).toBeGreaterThan(100);
    expect(image.b64_json).toMatch(/^[A-Za-z0-9+/=]+$/);

    // Should NOT contain url when b64_json is requested
    expect(image).not.toHaveProperty('url');
  });
});
