import { test, expect } from "@playwright/test";

/**
 * MCP Initialize E2E Tests
 *
 * Tests the MCP initialization handshake.
 *
 * NOTE: the SDK Streamable HTTP transport requires clients to send
 * `Accept: application/json, text/event-stream`, so responses arrive as
 * SSE frames (`event: message\ndata: {...}`). The `postMcp` helper sets
 * the Accept header and unwraps the first SSE data frame into JSON.
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

test.describe("MCP Initialize", () => {
  test("POST /mcp/message with initialize method returns server info", async ({
    request,
  }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {
          tools: {},
        },
        clientInfo: {
          name: "e2e-test-client",
          version: "0.1.0",
        },
      },
    });

    // Validate JSON-RPC 2.0 response
    expect(body).toHaveProperty("jsonrpc", "2.0");
    expect(body).toHaveProperty("id", 1);
    expect(body).toHaveProperty("result");

    // Validate server info
    expect(body.result).toHaveProperty("protocolVersion");
    expect(body.result).toHaveProperty("capabilities");
    expect(body.result).toHaveProperty("serverInfo");
    expect(body.result.serverInfo).toHaveProperty("name");
    expect(body.result.serverInfo).toHaveProperty("version");

    console.log(
      "MCP Server:",
      body.result.serverInfo.name,
      body.result.serverInfo.version
    );
  });

  test("POST /mcp/message with legacy protocol version negotiates successfully", async ({
    request,
  }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "e2e-test-client", version: "0.1.0" },
      },
    });

    expect(body).toHaveProperty("result");
    expect(body.result).toHaveProperty("serverInfo");
  });

  test("POST /mcp/message with initialized notification is accepted", async ({
    request,
  }) => {
    // Notifications carry no id and get 202 Accepted with an empty body.
    const response = await request.post("/mcp/message", {
      data: { jsonrpc: "2.0", method: "notifications/initialized" },
      headers: { Accept: "application/json, text/event-stream" },
    });

    expect(response.status()).toBe(202);
  });

  test("POST /mcp/message with ping is answered", async ({ request }) => {
    const body = await postMcp(request, "/mcp/message", {
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
    });

    expect(body).toHaveProperty("jsonrpc", "2.0");
    expect(body).toHaveProperty("result", {});
  });
});
