/**
 * MCP SDK E2E Tests
 *
 * Uses the official @modelcontextprotocol/sdk to test the MCP server.
 * This provides deeper protocol-level validation than raw HTTP tests.
 *
 * Run with: TEST_TARGET=workers npx playwright test tests/mcp/mcp-sdk.spec.ts
 */

import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

interface TextContent {
  type: 'text';
  text: string;
  isError?: boolean;
}

test.describe('MCP SDK Integration', () => {
  // Create MCP client for each test
  const createClient = async (baseURL: string) => {
    const client = new Client({
      name: 'test-client',
      version: '1.0.0',
    });

    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseURL}/mcp`)
    );

    await client.connect(transport);
    return { client, transport };
  };

  test('MCP SDK can initialize connection', async ({ baseURL }) => {
    const { client, transport } = await createClient(baseURL!);

    try {
      // Initialize is done automatically by connect(), verify it's working
      // by listing tools
      const tools = await client.listTools();

      expect(tools).toBeDefined();
      expect(tools.tools).toBeDefined();
      expect(Array.isArray(tools.tools)).toBe(true);
      expect(tools.tools.length).toBeGreaterThan(0);

      console.log('✅ MCP initialized, found', tools.tools.length, 'tools');
    } finally {
      await transport.close();
    }
  });

  test('MCP SDK can list tools with proper schema', async ({ baseURL }) => {
    const { client, transport } = await createClient(baseURL!);

    try {
      const tools = await client.listTools();

      // Validate tool structure per MCP spec
      expect(tools.tools).toBeInstanceOf(Array);

      for (const tool of tools.tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
      }

      // Check for expected tools
      const toolNames = tools.tools.map((t: any) => t.name);
      expect(toolNames).toContain('run_models');
      expect(toolNames).toContain('list_models');
      expect(toolNames).toContain('describe_model');

      console.log('✅ MCP tools:', toolNames.join(', '));
    } finally {
      await transport.close();
    }
  });

  test('MCP SDK can call list_models tool', async ({ baseURL }) => {
    const { client, transport } = await createClient(baseURL!);

    try {
      const result = await client.callTool({
        name: 'list_models',
        arguments: {},
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      const content = result.content as TextContent[];
      expect(Array.isArray(content)).toBe(true);

      // Content should have text content with JSON
      if (content.length > 0) {
        const textContent = content[0];
        expect(textContent).toHaveProperty('type', 'text');
        expect(textContent).toHaveProperty('text');

        // Parse the JSON response
        const models = JSON.parse(textContent.text);
        expect(Object.keys(models).length).toBeGreaterThan(0);

        console.log('✅ MCP list_models returned', Object.keys(models).length - 1, 'models');
      }
    } finally {
      await transport.close();
    }
  });

  test('MCP SDK can call describe_model tool', async ({ baseURL }) => {
    const { client, transport } = await createClient(baseURL!);

    try {
      const result = await client.callTool({
        name: 'describe_model',
        arguments: {
          model_id: '@cf/black-forest-labs/flux-1-schnell',
        },
      });

      expect(result).toBeDefined();
      const content = result.content as TextContent[];
      expect(content).toBeDefined();

      if (content.length > 0) {
        const textContent = content[0];
        expect(textContent).toHaveProperty('type', 'text');

        const schema = JSON.parse(textContent.text);
        expect(schema).toHaveProperty('model_id', '@cf/black-forest-labs/flux-1-schnell');
        expect(schema).toHaveProperty('name');
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('parameters');

        console.log('✅ MCP describe_model returned schema for', schema.name);
      }
    } finally {
      await transport.close();
    }
  });

  test('MCP SDK can call run_models tool', async ({ baseURL }) => {
    const { client, transport } = await createClient(baseURL!);

    try {
      const result = await client.callTool({
        name: 'run_models',
        arguments: {
          prompt: 'A bright red apple on a wooden table',
          model_id: '@cf/black-forest-labs/flux-1-schnell',
          n: 1,
        },
      });

      expect(result).toBeDefined();
      const content = result.content as TextContent[];
      expect(content).toBeDefined();

      if (content.length > 0) {
        const textContent = content[0];
        expect(textContent).toHaveProperty('type', 'text');
        expect(textContent.text).toContain('!['); // Markdown image

        // Extract URL from markdown
        const urlMatch = textContent.text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        expect(urlMatch).not.toBeNull();

        const imageUrl = urlMatch![1];
        expect(imageUrl).toMatch(/^https:\/\//);

        console.log('✅ MCP run_models generated image:', imageUrl.substring(0, 60) + '...');
      }
    } finally {
      await transport.close();
    }
  });

  test('MCP SDK handles errors gracefully', async ({ baseURL }) => {
    const { client, transport } = await createClient(baseURL!);

    try {
      // Call with missing required parameter
      const result = await client.callTool({
        name: 'run_models',
        arguments: {
          // Missing prompt and model_id
        },
      });

      // Should return error in content
      expect(result).toBeDefined();
      const content = result.content as TextContent[];
      expect(content).toBeDefined();

      if (content.length > 0) {
        const textContent = content[0];
        // Server returns error as text content (not with isError flag)
        expect(textContent.text).toContain('Error:');
        expect(textContent.text).toContain('required');

        console.log('✅ MCP error handling works:', textContent.text);
      }
    } finally {
      await transport.close();
    }
  });

  test('MCP SDK can generate multiple images', async ({ baseURL }) => {
    const { client, transport } = await createClient(baseURL!);

    try {
      const result = await client.callTool({
        name: 'run_models',
        arguments: {
          prompt: 'A blue sky with clouds',
          model_id: '@cf/black-forest-labs/flux-1-schnell',
          n: 2,
        },
      });

      expect(result).toBeDefined();
      const content = result.content as TextContent[];
      expect(content).toBeDefined();

      if (content.length > 0) {
        const textContent = content[0];
        expect(textContent).toHaveProperty('type', 'text');

        // Count image URLs in response
        const urlMatches = textContent.text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g);
        expect(urlMatches).not.toBeNull();
        expect(urlMatches!.length).toBe(2);

        console.log('✅ MCP run_models generated', urlMatches!.length, 'images');
      }
    } finally {
      await transport.close();
    }
  });
});
