// ============================================================================
// Auth middleware unit tests - pure logic, no bindings, no network
// ============================================================================
// Seam: authenticateRequest / requiresAuth public functions.
// Expected values are literals from the documented auth contract
// (Bearer scheme, public paths, Unauthorized envelope).

import { describe, expect, test } from "vitest";
import {
  authenticateRequest,
  buildBearerChallenge,
  buildProtectedResourceMetadata,
  createUnauthorizedResponse,
  getResourceMetadataUrl,
  requiresAuth,
} from "./auth.js";
import type { Env } from "../types.js";

const authedEnv = { API_KEYS: "key-one,key-two" } as Env;
const openEnv = {} as Env;

function authedRequest(token?: string): Request {
  const headers = new Headers();
  if (token) headers.set("Authorization", token);
  return new Request("https://worker.test/mcp", { headers });
}

describe("authenticateRequest", () => {
  test("open-by-default when no API keys configured", () => {
    const result = authenticateRequest(authedRequest(), openEnv);
    expect(result).toEqual({ authenticated: true });
  });

  test("valid key authenticates", () => {
    const result = authenticateRequest(
      authedRequest("Bearer key-two"),
      authedEnv
    );
    expect(result).toEqual({ authenticated: true, apiKey: "key-two" });
  });

  test("missing header is rejected", () => {
    const result = authenticateRequest(authedRequest(), authedEnv);
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Authorization header");
  });

  test("non-bearer scheme is rejected", () => {
    const result = authenticateRequest(
      authedRequest("Basic key-one"),
      authedEnv
    );
    expect(result.authenticated).toBe(false);
    expect(result.error).toContain("Bearer <api-key>");
  });

  test("scheme match is case-insensitive", () => {
    const result = authenticateRequest(
      authedRequest("bearer key-one"),
      authedEnv
    );
    expect(result.authenticated).toBe(true);
  });

  test("surrounding whitespace is tolerated", () => {
    const result = authenticateRequest(
      authedRequest("  Bearer   key-one  "),
      authedEnv
    );
    expect(result.authenticated).toBe(true);
  });

  test("unknown key is rejected", () => {
    const result = authenticateRequest(authedRequest("Bearer nope"), authedEnv);
    expect(result).toEqual({ authenticated: false, error: "Invalid API key" });
  });
});

describe("requiresAuth", () => {
  test("public paths bypass auth", () => {
    for (const path of [
      "/",
      "/index.html",
      "/health",
      "/api/internal/models",
    ]) {
      expect(requiresAuth(path, "GET")).toBe(false);
    }
    expect(requiresAuth("/images/abc.png", "GET")).toBe(false);
    expect(requiresAuth("/.well-known/oauth-protected-resource", "GET")).toBe(
      false
    );
  });

  test("OPTIONS preflight always bypasses", () => {
    expect(requiresAuth("/v1/images/generations", "OPTIONS")).toBe(false);
    expect(requiresAuth("/mcp", "OPTIONS")).toBe(false);
  });

  test("API endpoints require auth", () => {
    expect(requiresAuth("/v1/images/generations", "POST")).toBe(true);
    expect(requiresAuth("/mcp", "POST")).toBe(true);
    expect(requiresAuth("/v1/models", "GET")).toBe(true);
  });
});

describe("unauthorized response contract", () => {
  test("401 keeps legacy body shape with bearer challenge", async () => {
    const request = new Request("https://worker.test/mcp");
    const response = createUnauthorizedResponse("Invalid API key", request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Invalid API key",
    });
    const challenge = response.headers.get("WWW-Authenticate") ?? "";
    expect(challenge).toContain('Bearer error="invalid_token"');
    expect(challenge).toContain(
      'resource_metadata="https://worker.test/.well-known/oauth-protected-resource"'
    );
  });

  test("challenge omits resource_metadata without a request", () => {
    expect(buildBearerChallenge()).toBe(
      'Bearer error="invalid_token", error_description="Authentication required"'
    );
  });

  test("resource metadata URL derives from request origin", () => {
    const request = new Request("https://worker.test/mcp?transport=sse");
    expect(getResourceMetadataUrl(request)).toBe(
      "https://worker.test/.well-known/oauth-protected-resource"
    );
  });

  test("protected resource metadata is a resource-server document", () => {
    const request = new Request("https://worker.test/mcp");
    expect(buildProtectedResourceMetadata(request)).toEqual({
      resource: "https://worker.test/mcp",
      authorization_servers: [],
      scopes_supported: [],
      bearer_methods_supported: ["header"],
    });
  });
});
