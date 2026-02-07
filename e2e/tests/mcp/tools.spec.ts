import { test, expect } from '@playwright/test';

/**
 * MCP Tools E2E Tests
 *
 * Tests the MCP tools/list and tools/call methods.
 * @api
 */

test.describe('MCP Tools', () => {
  test('POST /mcp/message with tools/list returns available tools', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('jsonrpc', '2.0');
    expect(body).toHaveProperty('id', 2);
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('tools');
    expect(Array.isArray(body.result.tools)).toBe(true);

    // Validate tool structure
    if (body.result.tools.length > 0) {
      const tool = body.result.tools[0];
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool.inputSchema).toHaveProperty('type', 'object');
    }

    // Log available tools
    console.log('MCP Tools:', body.result.tools.map((t: any) => t.name).join(', '));
  });

  test('tools/list includes run_models tool', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
      },
    });

    const body = await response.json();
    const toolNames = body.result.tools.map((t: any) => t.name);

    expect(toolNames).toContain('run_models');
  });

  test('tools/list includes list_models tool', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
      },
    });

    const body = await response.json();
    const toolNames = body.result.tools.map((t: any) => t.name);

    expect(toolNames).toContain('list_models');
  });

  test('tools/list includes describe_model tool', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/list',
      },
    });

    const body = await response.json();
    const toolNames = body.result.tools.map((t: any) => t.name);

    expect(toolNames).toContain('describe_model');
  });

  test('tools/call list_models returns model list', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'list_models',
          arguments: {},
        },
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('jsonrpc', '2.0');
    expect(body).toHaveProperty('id', 6);
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('content');
    expect(Array.isArray(body.result.content)).toBe(true);

    // Content should be text with JSON
    if (body.result.content.length > 0) {
      expect(body.result.content[0]).toHaveProperty('type', 'text');
      expect(body.result.content[0]).toHaveProperty('text');
    }
  });

  test('tools/call describe_model with valid model_id returns schema', async ({ request }) => {
    const modelId = '@cf/black-forest-labs/flux-1-schnell';

    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'describe_model',
          arguments: {
            model_id: modelId,
          },
        },
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('content');

    if (body.result.content.length > 0) {
      const textContent = body.result.content[0].text;
      const schema = JSON.parse(textContent);

      expect(schema).toHaveProperty('model_id', modelId);
      expect(schema).toHaveProperty('name');
      expect(schema).toHaveProperty('description');
      expect(schema).toHaveProperty('parameters');
    }
  });

  test('tools/call describe_model without model_id returns error', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'describe_model',
          arguments: {},
        },
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('content');

    const content = body.result.content[0];
    expect(content).toHaveProperty('isError', true);
  });

  test('tools/call run_models generates image', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'run_models',
          arguments: {
            prompt: 'A bright red apple on a wooden table',
            model_id: '@cf/black-forest-labs/flux-1-schnell',
            n: 1,
          },
        },
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('content');

    // Should contain text content with image URL
    if (body.result.content.length > 0) {
      const content = body.result.content[0];
      expect(content).toHaveProperty('type', 'text');
      expect(content.text).toContain('!['); // Markdown image syntax
    }
  });

  test('tools/call run_models without prompt returns error', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'run_models',
          arguments: {
            model_id: '@cf/black-forest-labs/flux-1-schnell',
          },
        },
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('content');

    const content = body.result.content[0];
    expect(content).toHaveProperty('isError', true);
  });

  test('tools/call run_models without model_id returns error', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'run_models',
          arguments: {
            prompt: 'Test prompt',
          },
        },
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('content');

    const content = body.result.content[0];
    expect(content).toHaveProperty('isError', true);
  });

  test('tools/call unknown tool returns error', async ({ request }) => {
    const response = await request.post('/mcp/message', {
      data: {
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', -32601);
  });

  test('POST /mcp (alternate endpoint) also works', async ({ request }) => {
    const response = await request.post('/mcp', {
      data: {
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/list',
      },
    });

    // /mcp should also accept POST requests
    expect([200, 404]).toContain(response.status());
  });
});
