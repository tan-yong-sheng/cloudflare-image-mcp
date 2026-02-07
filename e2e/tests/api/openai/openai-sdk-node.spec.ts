/**
 * OpenAI SDK Node.js Compliance Tests
 *
 * Uses the official OpenAI Node.js SDK directly (not through Playwright browser)
 * to verify our endpoint is fully compatible with OpenAI's TypeScript SDK.
 *
 * These tests run in Node.js context and use the OpenAI SDK to make actual API calls.
 */

import { test, expect } from '@playwright/test';
import OpenAI from 'openai';

test.describe('OpenAI SDK Node.js Compliance', () => {
  // Create OpenAI client pointing to our endpoint
  // baseURL is provided by Playwright config from TEST_BASE_URL env var
  const createClient = (baseURL: string) => {
    return new OpenAI({
      apiKey: 'dummy-api-key', // Our endpoint doesn't validate API keys
      baseURL: `${baseURL}/v1`,
    });
  };

  test('OpenAI SDK can generate images with url format', async ({ baseURL }) => {
    const client = createClient(baseURL!);

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

    // URL should be absolute (full CDN URL), not relative
    expect(image.url).toMatch(/^https:\/\//);

    // Should NOT have b64_json when using url format
    expect(image.b64_json).toBeUndefined();

    console.log('✅ Generated image URL:', image.url);
  });

  test('OpenAI SDK can generate images with b64_json format', async ({ baseURL }) => {
    const client = createClient(baseURL!);

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

    console.log('✅ Generated base64 image (length):', image.b64_json?.length);
  });

  test('OpenAI SDK can generate multiple images', async ({ baseURL }) => {
    const client = createClient(baseURL!);

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
      // URL should be absolute
      expect(image.url).toMatch(/^https:\/\//);
    }

    console.log('✅ Generated', response.data.length, 'images');
  });

  test('OpenAI SDK handles missing prompt gracefully', async ({ baseURL }) => {
    const client = createClient(baseURL!);

    let errorThrown = false;
    let errorStatus: number | undefined;
    try {
      // @ts-expect-error - Testing missing prompt intentionally
      await client.images.generate({
        model: '@cf/black-forest-labs/flux-1-schnell',
        n: 1,
      });
    } catch (error: any) {
      errorThrown = true;
      errorStatus = error.status;
    }

    // Ensure an error was actually thrown
    expect(errorThrown).toBe(true);
    // Error status should be 400 (or undefined if network error)
    expect(errorStatus === 400 || errorStatus === undefined).toBe(true);
  });

  test('OpenAI SDK can list models', async ({ baseURL }) => {
    const client = createClient(baseURL!);

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

    console.log('✅ Listed', response.data.length, 'models');
  });

  test('OpenAI SDK response format matches spec exactly', async ({ baseURL }) => {
    const client = createClient(baseURL!);

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

  test('OpenAI SDK b64_json response format matches spec exactly', async ({ baseURL }) => {
    const client = createClient(baseURL!);

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
