import { test, expect } from '@playwright/test';

/**
 * Health Check E2E Tests
 *
 * Basic connectivity and health endpoint tests.
 * @api
 */

test.describe('Health Check', () => {
  test('GET /health returns healthy status', async ({ request }) => {
    const response = await request.get('/health');

    // Health endpoint should return 200
    expect(response.status()).toBe(200);

    const body = await response.json();

    // Validate health response structure
    expect(body).toHaveProperty('status');
    expect(body.status).toMatch(/healthy|ok|up/i);
  });

  test('GET / returns frontend or API info', async ({ request }) => {
    const response = await request.get('/');

    // Root endpoint should return something (frontend HTML or API info)
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];

    // Could be HTML (frontend) or JSON (API info)
    expect([contentType.includes('text/html'), contentType.includes('application/json')]).toContain(true);
  });

  test('Unknown endpoints return 404', async ({ request }) => {
    const response = await request.get('/unknown-endpoint-that-does-not-exist');

    expect(response.status()).toBe(404);
  });

  test('CORS headers are present on all endpoints', async ({ request }) => {
    const endpoints = ['/health', '/v1/models', '/mcp'];

    for (const endpoint of endpoints) {
      const response = await request.get(endpoint);

      // Check CORS headers
      expect(response.headers()['access-control-allow-origin']).toBe('*');
    }
  });
});
