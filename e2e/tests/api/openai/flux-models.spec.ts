import { test, expect } from '@playwright/test';

/**
 * FLUX Model E2E Tests — DRIFT canaries (Phase 4).
 *
 * These 4 tests stay LIVE deliberately: they are the only tests that
 * prove per-model provider behavior (JSON vs multipart input, base64
 * vs binary output, b64 length/format per model). Mocks cannot catch
 * a model being retired or changing its envelope. Shape assertions
 * for the same paths live hermetically in openai-contract.test.ts.
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
  // Drift canary (kept): fastest model, JSON in / base64 out.
  test('FLUX-1 schnell: /v1/images/generations returns valid image URL @slow @drift', async ({ request }) => {
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
  // Drift canary (kept): multipart in / base64 out.
  test('FLUX-2 klein 4B: /v1/images/generations returns valid image URL @slow @drift', async ({ request }) => {
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
  // Drift canary (kept): multipart edit path with b64 round-trip.
  test('FLUX-2 klein 4B: /v1/images/edits with image returns valid result @slow @drift', async ({ request }) => {
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
  // Drift canary (kept): second model family proving b64_json output.
  test('FLUX-2 dev: /v1/images/generations returns b64_json @slow @drift', async ({ request }) => {
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
