import { test, expect } from "@playwright/test";

/**
 * MCP SSE (Server-Sent Events) E2E Tests
 *
 * Tests the SSE transport for MCP.
 * @api
 */

test.describe("MCP SSE Transport", () => {
  test("GET /mcp?transport=sse behavior", async ({ request }) => {
    const response = await request.get("/mcp?transport=sse");

    // The SDK handler has no standalone GET/SSE stream: it answers 405
    // JSON-RPC with Allow: POST. Clients open streams via POST instead.
    expect(response.status()).toBe(405);

    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("GET /mcp (without transport param) is not a JSON-RPC route", async ({
    request,
  }) => {
    const response = await request.get("/mcp");

    // GET is not part of the Streamable HTTP contract: the SDK answers 405.
    expect(response.status()).toBe(405);
  });

  test("GET /.well-known/oauth-protected-resource returns discovery document", async ({
    request,
  }) => {
    const response = await request.get("/.well-known/oauth-protected-resource");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const body = await response.json();
    expect(body).toHaveProperty("resource");
    expect(body).toHaveProperty("authorization_servers");
    expect(body).toHaveProperty("bearer_methods_supported", ["header"]);
  });

  test("OPTIONS /mcp returns CORS preflight headers", async ({ request }) => {
    const response = await request.fetch("/mcp", {
      method: "OPTIONS",
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    // MCP transport headers must be allow-listed for browser clients.
    expect(response.headers()["access-control-allow-headers"]).toContain(
      "Mcp-Protocol-Version"
    );
  });
});
