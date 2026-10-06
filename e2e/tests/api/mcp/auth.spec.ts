import { test, expect } from "@playwright/test";

/**
 * MCP Auth E2E Tests
 *
 * Verifies the OAuth 2.1 resource-server behavior of the MCP surface:
 * spec-compliant 401 challenges (RFC 6750 + RFC 9728 pointer), the public
 * Protected Resource Metadata document, and static-key acceptance.
 *
 * These tests only assert auth behavior when an API key is configured
 * (API_KEY env, same source as the Playwright config headers). Without a
 * key the worker is open-by-default and the tests verify that instead.
 * @api
 */

import { getAuthHeaders, getApiKey } from "../../../lib/target.js";

const hasKey = !!getApiKey();

test.describe("MCP Auth", () => {
  test("unauthenticated POST /mcp returns spec-compliant 401 challenge", async ({
    request,
  }) => {
    const response = await request.post("/mcp", {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      headers: {
        Accept: "application/json, text/event-stream",
        // Playwright injects auth headers globally; strip them to test the
        // unauthenticated path.
        ...(hasKey ? { Authorization: "" } : {}),
      },
    });

    if (!hasKey) {
      // Open-by-default: no keys configured -> request passes through.
      expect(response.status()).toBe(200);
      return;
    }

    expect(response.status()).toBe(401);

    // OAuth 2.1 bearer challenge with RFC 9728 discovery pointer.
    const challenge = response.headers()["www-authenticate"];
    expect(challenge).toContain("Bearer");
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain("resource_metadata=");
    expect(challenge).toContain("/.well-known/oauth-protected-resource");

    // Legacy JSON body shape is preserved for existing consumers.
    const body = await response.json();
    expect(body).toHaveProperty("error", "Unauthorized");
    expect(body).toHaveProperty("message");
  });

  test("401 challenge pointer resolves to a public PRM document", async ({
    request,
  }) => {
    const unauth = await request.post("/mcp", {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      headers: {
        Accept: "application/json, text/event-stream",
        ...(hasKey ? { Authorization: "" } : {}),
      },
    });

    // The discovery document is public regardless of auth configuration.
    const response = await request.get("/.well-known/oauth-protected-resource");
    expect(response.status()).toBe(200);

    const doc = await response.json();
    expect(doc).toHaveProperty("resource");
    expect(doc.resource).toContain("/mcp");
    expect(doc).toHaveProperty("bearer_methods_supported", ["header"]);

    if (hasKey) {
      expect(unauth.status()).toBe(401);
      const challenge = unauth.headers()["www-authenticate"];
      const match = challenge.match(/resource_metadata="([^"]+)"/);
      expect(match).not.toBeNull();
      const pointed = await request.get(match![1]);
      expect(pointed.status()).toBe(200);
    }
  });

  test("valid API key is accepted on MCP routes", async ({ request }) => {
    test.skip(!hasKey, "requires API_KEY env");

    const headers = {
      ...getAuthHeaders(),
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    };

    const response = await request.post("/mcp", {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      headers,
    });

    expect(response.status()).toBe(200);
  });

  test("invalid API key is rejected with 401", async ({ request }) => {
    test.skip(!hasKey, "requires API_KEY env");

    const response = await request.post("/mcp", {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer definitely-wrong-key",
      },
    });

    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toContain(
      'error="invalid_token"'
    );
  });
});
