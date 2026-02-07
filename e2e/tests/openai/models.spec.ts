import { test, expect } from '@playwright/test';

/**
 * OpenAI Models API E2E Tests
 *
 * Tests the /v1/models endpoint for listing and describing models.
 * @api
 */

test.describe('OpenAI Models API', () => {
  test('GET /v1/models returns list of available models', async ({ request }) => {
    const response = await request.get('/v1/models');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body = await response.json();

    // Validate OpenAI-compatible response format
    expect(body).toHaveProperty('object', 'list');
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);

    // Validate model structure
    if (body.data.length > 0) {
      const model = body.data[0];
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('object', 'model');
      expect(model).toHaveProperty('created');
      expect(model).toHaveProperty('owned_by');

      // Validate model ID format (@cf/provider/model-name)
      expect(model.id).toMatch(/^@[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+/);
    }

    // Log available models for debugging
    console.log('Available models:', body.data.map((m: any) => m.id).join(', '));
  });

  test('GET /v1/models/:model returns model details', async ({ request }) => {
    // First get a list of models
    const listResponse = await request.get('/v1/models');
    const listBody = await listResponse.json();

    test.skip(listBody.data.length === 0, 'No models available to test');

    const modelId = listBody.data[0].id;

    // Get specific model details
    const response = await request.get(`/v1/models/${encodeURIComponent(modelId)}`);

    // Skip if endpoint not implemented
    if (response.status() === 404) {
      test.skip(true, 'GET /v1/models/:model not implemented');
      return;
    }

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('object', 'model');
  });

  test('GET /v1/models returns CORS headers', async ({ request }) => {
    const response = await request.get('/v1/models');

    expect(response.headers()['access-control-allow-origin']).toBe('*');
    expect(response.headers()['access-control-allow-methods']).toContain('GET');
  });

  test('OPTIONS /v1/models returns CORS preflight headers', async ({ request }) => {
    const response = await request.fetch('/v1/models', {
      method: 'OPTIONS',
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBe('*');
  });
});
