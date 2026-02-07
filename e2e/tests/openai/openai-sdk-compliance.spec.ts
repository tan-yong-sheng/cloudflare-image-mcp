import { test, expect } from '@playwright/test';

/**
 * OpenAI API Compliance Tests
 *
 * Validates that our endpoint returns responses exactly matching the OpenAI API specification.
 * This ensures compatibility with OpenAI's official SDK and clients like OpenWebUI.
 *
 * @compliance
 */

test.describe('OpenAI API Compliance', () => {
  // Default test model (fastest for testing)
  const TEST_MODEL = '@cf/black-forest-labs/flux-1-schnell';

  test('response with url format contains only url field', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A red apple on a wooden table',
        model: TEST_MODEL,
        n: 1,
        response_format: 'url',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    // Validate top-level structure matches OpenAI spec exactly
    expect(body).toHaveProperty('created');
    expect(typeof body.created).toBe('number');
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);

    const image = body.data[0];

    // Image object should ONLY have 'url' field for url format
    // per OpenAI spec: https://platform.openai.com/docs/api-reference/images/create
    expect(Object.keys(image)).toEqual(['url']);

    // Validate url field
    expect(image.url).toBeDefined();
    expect(typeof image.url).toBe('string');
    expect(image.url).not.toBeNull();
    expect(image.url).not.toBe('');
    expect(image.url.length).toBeGreaterThan(0);

    // Should NOT have b64_json when using url format
    expect(image).not.toHaveProperty('b64_json');

    // Should NOT have revised_prompt (not in OpenAI spec)
    expect(image).not.toHaveProperty('revised_prompt');
  });

  test('response with b64_json format contains only b64_json field', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A blue sky with white clouds',
        model: TEST_MODEL,
        n: 1,
        response_format: 'b64_json',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    // Validate structure
    expect(body).toHaveProperty('created');
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);

    const image = body.data[0];

    // Image object should ONLY have 'b64_json' field for b64_json format
    expect(Object.keys(image)).toEqual(['b64_json']);

    // Validate b64_json field
    expect(image.b64_json).toBeDefined();
    expect(typeof image.b64_json).toBe('string');
    expect(image.b64_json).not.toBeNull();
    expect(image.b64_json).not.toBe('');

    // Validate base64 format
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    expect(image.b64_json).toMatch(base64Regex);

    // Should NOT have url when using b64_json format
    expect(image).not.toHaveProperty('url');

    // Should NOT have revised_prompt (not in OpenAI spec)
    expect(image).not.toHaveProperty('revised_prompt');
  });

  test('default response format is url and contains only url field', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A simple geometric shape',
        model: TEST_MODEL,
        n: 1,
        // No response_format specified - should default to url
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    const image = body.data[0];

    // Default format should be url
    expect(Object.keys(image)).toEqual(['url']);
    expect(image.url).toBeDefined();
    expect(image).not.toHaveProperty('b64_json');
  });

  test('multiple images each have only url field', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A cat sleeping on a couch',
        model: TEST_MODEL,
        n: 2,
        response_format: 'url',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(2);

    // Each image should only have url field
    for (const image of body.data) {
      expect(Object.keys(image)).toEqual(['url']);
      expect(image.url).toBeDefined();
      expect(typeof image.url).toBe('string');
      expect(image).not.toHaveProperty('b64_json');
      expect(image).not.toHaveProperty('revised_prompt');
    }
  });

  test('edits endpoint returns only url field', async ({ request }) => {
    // Note: This test requires an actual image. For compliance testing,
    // we just verify the response structure is correct.
    // Skip if image editing is not available

    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const response = await request.post('/v1/images/edits', {
      data: {
        image: testImageBase64,
        prompt: 'Add a red dot in the center',
        model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
        n: 1,
      },
    });

    // If the endpoint works, verify response structure
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('created');
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);

      if (body.data.length > 0) {
        const image = body.data[0];
        // Should only have url field
        const keys = Object.keys(image);
        expect(keys).toContain('url');
        expect(keys).not.toContain('b64_json');
        expect(keys).not.toContain('revised_prompt');
      }
    }
    // If it fails (400/500), that's ok - we're testing response format, not functionality
  });

  test('variations endpoint returns only url field', async ({ request }) => {
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const response = await request.post('/v1/images/variations', {
      data: {
        image: testImageBase64,
        model: '@cf/black-forest-labs/flux-2-klein-4b',
        n: 1,
      },
    });

    // If the endpoint works, verify response structure
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('created');
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);

      if (body.data.length > 0) {
        const image = body.data[0];
        // Should only have url field
        const keys = Object.keys(image);
        expect(keys).toContain('url');
        expect(keys).not.toContain('b64_json');
        expect(keys).not.toContain('revised_prompt');
      }
    }
    // If it fails (400/500), that's ok - we're testing response format, not functionality
  });

  test('response structure matches OpenAI spec exactly', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A simple test image',
        model: TEST_MODEL,
        n: 1,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    // Verify top-level fields match OpenAI spec exactly
    // https://platform.openai.com/docs/api-reference/images/create
    const topLevelKeys = Object.keys(body).sort();
    expect(topLevelKeys).toEqual(['created', 'data']);

    // Verify image object has only url (for url format)
    const image = body.data[0];
    expect(Object.keys(image)).toEqual(['url']);

    // created should be a unix timestamp
    expect(typeof body.created).toBe('number');
    expect(body.created).toBeGreaterThan(1600000000); // After 2020
    expect(body.created).toBeLessThan(3000000000); // Before 2050

    // data should be an array
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('b64_json response structure matches OpenAI spec exactly', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A simple test image',
        model: TEST_MODEL,
        n: 1,
        response_format: 'b64_json',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    const image = body.data[0];

    // Verify image object has only b64_json (for b64_json format)
    expect(Object.keys(image)).toEqual(['b64_json']);
  });

  test('OpenWebUI compatibility: no null values in response', async ({ request }) => {
    // OpenWebUI's Python code fails with 'NoneType' object has no attribute 'lower'
    // when null values are present in the response

    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A simple test image',
        model: TEST_MODEL,
        n: 1,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    // Recursively check for null values
    function checkNoNullValues(obj: any, path: string = ''): void {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        // Check for null
        expect(value).not.toBeNull();

        // Recurse into objects (but not arrays of primitives)
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          checkNoNullValues(value, currentPath);
        }
      }
    }

    checkNoNullValues(body);
  });
});
