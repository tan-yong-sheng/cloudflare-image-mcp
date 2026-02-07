import { test, expect } from '@playwright/test';
import OpenAI from 'openai';

/**
 * OpenAI SDK Compliance Tests
 *
 * Uses the official OpenAI Node.js SDK to verify our endpoint is fully compatible.
 * This ensures we match the exact behavior of OpenAI's API.
 *
 * @compliance
 */

test.describe('OpenAI SDK Compliance', () => {
  // Get the base URL from environment or use default
  const baseURL = process.env.TEST_BASE_URL || 'http://localhost:8787';

  // Create OpenAI client pointing to our endpoint
  const createClient = () => {
    return new OpenAI({
      apiKey: 'dummy-api-key', // Our endpoint doesn't validate API keys
      baseURL: `${baseURL}/v1`,
    });
  };

  test('OpenAI SDK can generate images with url format', async () => {
    const client = createClient();

    const response = await client.images.generate({
      model: '@cf/black-forest-labs/flux-1-schnell',
      prompt: 'A red apple on a wooden table',
      n: 1,
      size: '1024x1024',
    });

    // Validate response structure matches OpenAI spec
    expect(response).toBeDefined();
    expect(response.created).toBeDefined();
    expect(typeof response.created).toBe('number');
    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);

    // Type guard for data array
    if (!response.data || response.data.length === 0) {
      throw new Error('Response data is empty');
    }
    expect(response.data.length).toBe(1);

    const image = response.data[0];

    // URL format should have 'url' property
    expect(image.url).toBeDefined();
    expect(typeof image.url).toBe('string');
    expect(image.url).not.toBeNull();
    expect(image.url).not.toBe('');

    // Should NOT have b64_json when using url format
    expect(image.b64_json).toBeUndefined();

    // revised_prompt is optional in OpenAI spec, may or may not be present
    // Our implementation does not include it
  });

  test('OpenAI SDK can generate images with b64_json format', async () => {
    const client = createClient();

    const response = await client.images.generate({
      model: '@cf/black-forest-labs/flux-1-schnell',
      prompt: 'A blue sky with white clouds',
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    });

    // Validate response structure
    expect(response).toBeDefined();
    expect(response.created).toBeDefined();
    expect(response.data).toBeDefined();

    // Type guard for data array
    if (!response.data || response.data.length === 0) {
      throw new Error('Response data is empty');
    }
    expect(response.data.length).toBe(1);

    const image = response.data[0];

    // b64_json format should have 'b64_json' property
    expect(image.b64_json).toBeDefined();
    expect(typeof image.b64_json).toBe('string');
    expect(image.b64_json).not.toBeNull();
    expect(image.b64_json).not.toBe('');

    // Validate base64 format
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    expect(image.b64_json).toMatch(base64Regex);

    // Should NOT have url when using b64_json format
    expect(image.url).toBeUndefined();
  });

  test('OpenAI SDK can generate multiple images', async () => {
    const client = createClient();

    const response = await client.images.generate({
      model: '@cf/black-forest-labs/flux-1-schnell',
      prompt: 'A cat sleeping on a couch',
      n: 2,
      size: '1024x1024',
    });

    // Type guard for data array
    if (!response.data) {
      throw new Error('Response data is undefined');
    }
    expect(response.data).toHaveLength(2);

    // Each image should have url
    for (const image of response.data) {
      expect(image.url).toBeDefined();
      expect(typeof image.url).toBe('string');
    }
  });

  test('OpenAI SDK handles missing prompt gracefully', async () => {
    const client = createClient();

    let errorThrown = false;
    try {
      // @ts-expect-error - Testing missing prompt intentionally
      await client.images.generate({
        model: '@cf/black-forest-labs/flux-1-schnell',
        n: 1,
      });
    } catch (error: any) {
      errorThrown = true;
      // OpenAI SDK wraps errors in a specific format
      expect(error).toBeDefined();
      expect(error.status).toBe(400);
    }

    // Ensure an error was actually thrown
    expect(errorThrown).toBe(true);
  });

  test('OpenAI SDK can list models', async () => {
    const client = createClient();

    const response = await client.models.list();

    expect(response).toBeDefined();
    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);

    // Type guard for data array
    if (!response.data) {
      throw new Error('Response data is undefined');
    }

    // Should have at least some models
    expect(response.data.length).toBeGreaterThan(0);

    // Check model structure
    const model = response.data[0];
    expect(model.id).toBeDefined();
    expect(model.object).toBe('model');
  });

  test('OpenAI SDK response format matches spec exactly', async () => {
    const client = createClient();

    const response = await client.images.generate({
      model: '@cf/black-forest-labs/flux-1-schnell',
      prompt: 'A simple geometric shape',
      n: 1,
    });

    // Verify the exact response structure matches OpenAI spec
    // https://platform.openai.com/docs/api-reference/images/create

    // Top-level fields
    expect(Object.keys(response).sort()).toEqual(['created', 'data']);

    // Type guard for data array
    if (!response.data || response.data.length === 0) {
      throw new Error('Response data is empty');
    }

    // Image object fields - only 'url' for url format
    const image = response.data[0];
    expect(Object.keys(image)).toEqual(['url']);
  });

  test('OpenAI SDK b64_json response format matches spec exactly', async () => {
    const client = createClient();

    const response = await client.images.generate({
      model: '@cf/black-forest-labs/flux-1-schnell',
      prompt: 'A simple geometric shape',
      n: 1,
      response_format: 'b64_json',
    });

    // Type guard for data array
    if (!response.data || response.data.length === 0) {
      throw new Error('Response data is empty');
    }

    // Image object fields - only 'b64_json' for b64_json format
    const image = response.data[0];
    expect(Object.keys(image)).toEqual(['b64_json']);
  });
});
