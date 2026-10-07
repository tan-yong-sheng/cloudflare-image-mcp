import { test, expect } from "@playwright/test";

/**
 * MCP Tools E2E Tests
 *
 * Tests the MCP tools/list and tools/call methods.
 *
 * NOTE: the SDK Streamable HTTP transport requires clients to send
 * `Accept: application/json, text/event-stream`, so responses arrive as
 * SSE frames. The `postMcp` helper sets the Accept header and unwraps the
 * first SSE data frame into JSON.
 * @api
 */

/**
 * POST a JSON-RPC message and unwrap the SSE data frame into parsed JSON.
 */
async function postMcp(request: any, path: string, body: unknown) {
  const response = await request.post(path, {
    data: body,
    headers: { Accept: "application/json, text/event-stream" },
  });
  expect(response.status()).toBe(200);
  const text = await response.text();
  const frame = text
    .split("\n")
    .find((line: string) => line.startsWith("data: "));
  expect(frame).toBeDefined();
  return JSON.parse(frame!.slice("data: ".length));
}

test.describe("MCP Tools", () => {
  test("POST /mcp/message with tools/list returns available tools", async ({
    request,
  }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    expect(body).toHaveProperty("jsonrpc", "2.0");
    expect(body).toHaveProperty("id", 2);
    expect(body).toHaveProperty("result");
    expect(body.result).toHaveProperty("tools");
    expect(Array.isArray(body.result.tools)).toBe(true);

    // Validate tool structure
    if (body.result.tools.length > 0) {
      const tool = body.result.tools[0];
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool.inputSchema).toHaveProperty("type", "object");
    }

    // Log available tools
    console.log(
      "MCP Tools:",
      body.result.tools.map((t: any) => t.name).join(", ")
    );
  });

  test("tools/list includes run_model tool", async ({ request }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
    });

    const toolNames = body.result.tools.map((t: any) => t.name);

    expect(toolNames).toContain("run_model");
  });

  test("tools/list includes list_models tool", async ({ request }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/list",
    });

    const toolNames = body.result.tools.map((t: any) => t.name);

    expect(toolNames).toContain("list_models");
  });

  test("tools/list includes describe_model tool", async ({ request }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/list",
    });

    const toolNames = body.result.tools.map((t: any) => t.name);

    expect(toolNames).toContain("describe_model");
  });

  test("tools/call list_models returns model list", async ({ request }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "list_models",
        arguments: {},
      },
    });

    expect(body).toHaveProperty("jsonrpc", "2.0");
    expect(body).toHaveProperty("id", 6);
    expect(body).toHaveProperty("result");
    expect(body.result).toHaveProperty("content");
    expect(Array.isArray(body.result.content)).toBe(true);

    // Content should be text with JSON
    if (body.result.content.length > 0) {
      expect(body.result.content[0]).toHaveProperty("type", "text");
      expect(body.result.content[0]).toHaveProperty("text");
    }
  });

  test("tools/call describe_model with valid model_id returns schema", async ({
    request,
  }) => {
    const modelId = "@cf/black-forest-labs/flux-1-schnell";

    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "describe_model",
        arguments: {
          model_id: modelId,
        },
      },
    });

    expect(body).toHaveProperty("result");
    expect(body.result).toHaveProperty("content");

    if (body.result.content.length > 0) {
      const textContent = body.result.content[0].text;
      const schema = JSON.parse(textContent);

      expect(schema).toHaveProperty("model_id", modelId);
      expect(schema).toHaveProperty("name");
      expect(schema).toHaveProperty("description");
      expect(schema).toHaveProperty("supported_task_types");
      expect(schema).toHaveProperty("cf_params");
    }
  });

  test("tools/call describe_model without model_id returns error", async ({
    request,
  }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "describe_model",
        arguments: {},
      },
    });

    expect(body).toHaveProperty("result");
    expect(body.result).toHaveProperty("content");

    expect(body.result).toHaveProperty("isError", true);
    expect(body.result).toHaveProperty("content");

    const content = body.result.content[0];
    // The SDK validates tool arguments against the registered schema and
    // reports violations as a tool-level error (message names the schema).
    expect(content.text).toContain("model_id");
  });

  test("tools/call run_model generates image @slow @smoke", async ({ request }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "run_model",
        arguments: {
          taskType: "generations",
          prompt: "A bright red apple on a wooden table",
          model_id: "@cf/black-forest-labs/flux-1-schnell",
          n: 1,
        },
      },
    });

    expect(body).toHaveProperty("result");
    expect(body.result).toHaveProperty("content");

    // Should contain text content with image URL
    if (body.result.content.length > 0) {
      const content = body.result.content[0];
      expect(content).toHaveProperty("type", "text");
      expect(content.text).toContain("!["); // Markdown image syntax

      // Extract URL from markdown: ![text](url)
      const urlMatch = content.text.match(
        /!\[.*?\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/
      );
      expect(urlMatch).not.toBeNull();

      const imageUrl = urlMatch[1];
      console.log("✅ MCP returns image URL:", imageUrl);
    }
  });

  test("tools/call run_model without prompt returns error", async ({
    request,
  }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "run_model",
        arguments: {
          taskType: "generations",
          model_id: "@cf/black-forest-labs/flux-1-schnell",
        },
      },
    });

    expect(body).toHaveProperty("result");
    expect(body.result).toHaveProperty("content");

    expect(body.result).toHaveProperty("isError", true);

    const content = body.result.content[0];
    expect(content.text).toContain("prompt");
  });

  test("tools/call run_model with mask and image array rejects explicitly", async ({
    request,
  }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 14,
      method: "tools/call",
      params: {
        name: "run_model",
        arguments: {
          taskType: "edits",
          prompt: "edit this",
          model_id: "@cf/runwayml/stable-diffusion-v1-5-inpainting",
          image: ["aGVsbG8=", "d29ybGQ="],
          mask: "bWFzaw==",
        },
      },
    });

    // Inpainting takes exactly one image: arrays must be rejected, never
    // silently truncated to the first element.
    expect(body.result).toHaveProperty("isError", true);
    expect(body.result.content[0].text).toContain("single image");
  });

  test("tools/call run_model with empty image array is rejected", async ({
    request,
  }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 16,
      method: "tools/call",
      params: {
        name: "run_model",
        arguments: {
          taskType: "edits",
          prompt: "edit this",
          model_id: "@cf/black-forest-labs/flux-2-dev",
          image: [],
        },
      },
    });

    // Schema requires a non-empty image input (string or 1-4 refs).
    expect(body.result).toHaveProperty("isError", true);
  });

  test("tools/call run_model with fractional n is rejected", async ({
    request,
  }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 15,
      method: "tools/call",
      params: {
        name: "run_model",
        arguments: {
          taskType: "generations",
          prompt: "a cat",
          model_id: "@cf/black-forest-labs/flux-1-schnell",
          n: 1.5,
        },
      },
    });

    // The schema requires an integer count (1-8).
    expect(body.result).toHaveProperty("isError", true);
    expect(body.result.content[0].text).toContain("n");
  });

  test("tools/call run_model without model_id returns error", async ({
    request,
  }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {
        name: "run_model",
        arguments: {
          taskType: "generations",
          prompt: "Test prompt",
        },
      },
    });

    expect(body).toHaveProperty("result");
    expect(body.result).toHaveProperty("content");

    expect(body.result).toHaveProperty("isError", true);

    const content = body.result.content[0];
    expect(content.text).toContain("model_id");
  });

  test("tools/call unknown tool returns error", async ({ request }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: {
        name: "unknown_tool",
        arguments: {},
      },
    });

    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code", -32602);
  });

  test("POST /mcp (alternate endpoint) also works", async ({ request }) => {
    const body = await postMcp(request, "/mcp", {
      jsonrpc: "2.0",
      id: 13,
      method: "tools/list",
    });

    // /mcp should also accept POST requests
    expect(body).toHaveProperty("result");
    expect(body.result).toHaveProperty("tools");
  });
});
