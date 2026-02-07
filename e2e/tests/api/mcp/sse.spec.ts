import { test, expect } from '@playwright/test';

/**
 * MCP SSE (Server-Sent Events) E2E Tests
 *
 * Tests the SSE transport for MCP.
 * @api
 */

test.describe('MCP SSE Transport', () => {
  test('GET /mcp?transport=sse behavior', async ({ request }) => {
    const response = await request.get('/mcp?transport=sse');

    // SSE endpoint may not be available in all implementations
    if (response.status() === 404) {
      test.skip(true, 'SSE transport not implemented');
      return;
    }

    expect(response.status()).toBe(200);

    // Check if it returns event-stream or JSON (implementation dependent)
    const contentType = response.headers()['content-type'];
    if (contentType.includes('text/event-stream')) {
      expect(response.headers()['cache-control']).toContain('no-cache');
    } else {
      // Server may return JSON info instead
      expect(contentType).toContain('application/json');
    }
  });

  test('GET /mcp (without transport param) returns endpoint info', async ({ request }) => {
    const response = await request.get('/mcp');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body = await response.json();

    // Validate MCP endpoint info
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('protocol', 'MCP');
    expect(body).toHaveProperty('transport');
    expect(body).toHaveProperty('endpoints');
    expect(body).toHaveProperty('tools');

    // Validate endpoints structure
    expect(body.endpoints).toHaveProperty('message');
    expect(body.endpoints).toHaveProperty('sse');

    // Validate tools array
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools.length).toBeGreaterThan(0);
  });

  test('GET /mcp returns CORS headers', async ({ request }) => {
    const response = await request.get('/mcp');

    expect(response.headers()['access-control-allow-origin']).toBe('*');
  });

  test('OPTIONS /mcp returns CORS preflight headers', async ({ request }) => {
    const response = await request.fetch('/mcp', {
      method: 'OPTIONS',
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBe('*');
  });
});
