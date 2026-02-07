import { test, expect } from '@playwright/test';

/**
 * MCP Initialize E2E Tests
 *
 * Tests the MCP initialization handshake.
 * @api
 */

test.describe('MCP Initialize', () => {
  test('POST /mcp/message with initialize method returns server info', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          clientInfo: {
            name: 'e2e-test-client',
            version: '0.1.0',
          },
        },
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body = await response.json();

    // Validate JSON-RPC 2.0 response
    expect(body).toHaveProperty('jsonrpc', '2.0');
    expect(body).toHaveProperty('id', 1);
    expect(body).toHaveProperty('result');

    // Validate server info
    expect(body.result).toHaveProperty('protocolVersion');
    expect(body.result).toHaveProperty('capabilities');
    expect(body.result).toHaveProperty('serverInfo');
    expect(body.result.serverInfo).toHaveProperty('name');
    expect(body.result.serverInfo).toHaveProperty('version');

    console.log('MCP Server:', body.result.serverInfo.name, body.result.serverInfo.version);
  });

  test('POST /mcp/message with invalid JSON returns error', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: 'invalid json',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return 200 with JSON-RPC error
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('jsonrpc', '2.0');
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', -32600);
    expect(body.error).toHaveProperty('message');
  });

  test('POST /mcp/message without jsonrpc version returns error', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        id: 1,
        method: 'initialize',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('POST /mcp/message with unknown method returns error', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown_method',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('jsonrpc', '2.0');
    expect(body).toHaveProperty('id', 1);
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', -32600);
  });
});
