/**
 * Authentication middleware for Cloudflare Image MCP
 *
 * Supports API key authentication via Authorization header:
 * Authorization: Bearer <api-key>
 */

import type { Env } from "../types.js";

export interface AuthResult {
  authenticated: boolean;
  apiKey?: string;
  error?: string;
}

/**
 * Extract and validate API key from request
 */
export function authenticateRequest(request: Request, env: Env): AuthResult {
  // Skip auth if no API keys are configured (backward compatibility)
  if (!env.API_KEYS) {
    return { authenticated: true };
  }

  // Get Authorization header
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return {
      authenticated: false,
      error: "Missing Authorization header",
    };
  }

  // Parse Bearer token (scheme match is case-insensitive per RFC 6750;
  // surrounding whitespace is tolerated so pasted keys don't lock users out)
  const [scheme, ...rest] = authHeader.trim().split(/\s+/);
  const token = rest.join(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return {
      authenticated: false,
      error: "Invalid Authorization format. Expected: Bearer <api-key>",
    };
  }

  // Validate token against configured keys
  const validKeys = env.API_KEYS.split(",")
    .map((k: string) => k.trim())
    .filter(Boolean);
  if (!validKeys.includes(token)) {
    return {
      authenticated: false,
      error: "Invalid API key",
    };
  }

  return {
    authenticated: true,
    apiKey: token,
  };
}

/**
 * Check if request path requires authentication
 * Public endpoints: /, /index.html, /health, /images/*
 * Note: Frontend handles auth via JS login modal; API endpoints return 401
 */
export function requiresAuth(path: string, method: string): boolean {
  // Always allow OPTIONS (CORS preflight)
  if (method === "OPTIONS") {
    return false;
  }

  // Public endpoints (always accessible)
  const publicPaths = [
    "/",
    "/index.html",
    "/health",
    // OAuth Protected Resource Metadata (RFC 9728): unauthenticated
    // clients must resolve the resource_metadata pointer in 401s.
    "/.well-known/oauth-protected-resource",
  ];

  // Check exact matches
  if (publicPaths.includes(path)) {
    return false;
  }

  // Images can be public (they have signed URLs or short expiry)
  if (path.startsWith("/images/")) {
    return false;
  }

  // Models list is public
  if (path === "/api/internal/models") {
    return false;
  }

  // Everything else requires auth if API_KEYS is configured
  // API endpoints (/v1/*, /mcp/*) will return 401 JSON if not authenticated
  return true;
}

/**
 * Build the OAuth 2.1 bearer challenge for a 401 response.
 *
 * Modern MCP clients discover how to authenticate via the
 * `resource_metadata` pointer (RFC 9728): without it, a 401 is a dead end
 * the client surfaces as a hard auth failure with no recovery path.
 */
export function buildBearerChallenge(resourceMetadataUrl?: string): string {
  const base =
    'Bearer error="invalid_token", error_description="Authentication required"';
  return resourceMetadataUrl
    ? base + ', resource_metadata="' + resourceMetadataUrl + '"'
    : base;
}

/**
 * Derive the Protected Resource Metadata URL for a request.
 * Shape follows RFC 9728 section 2: the well-known suffix is appended to
 * the request origin.
 */
export function getResourceMetadataUrl(request: Request): string {
  const url = new URL(request.url);
  return url.origin + "/.well-known/oauth-protected-resource";
}

/**
 * Build the RFC 9728 Protected Resource Metadata document.
 *
 * This server is a resource server only: it verifies static API keys, it
 * never issues tokens. `authorization_servers` is intentionally empty —
 * clients authenticate with a pre-shared key, not an OAuth flow — but the
 * document's presence is what lets spec-compliant clients resolve the
 * `resource_metadata` pointer in the 401 challenge instead of failing.
 */
export function buildProtectedResourceMetadata(
  request: Request
): Record<string, unknown> {
  const url = new URL(request.url);
  return {
    resource: url.origin + "/mcp",
    authorization_servers: [],
    scopes_supported: [],
    bearer_methods_supported: ["header"],
  };
}

/**
 * Create 401 Unauthorized response
 *
 * Includes the OAuth 2.1 bearer challenge with a `resource_metadata`
 * pointer so modern MCP clients can discover the Protected Resource
 * Metadata document. The JSON body keeps the legacy
 * `{ error: 'Unauthorized', message }` shape so existing consumers
 * (frontend login modal, OpenAI REST clients) are unaffected.
 */
export function createUnauthorizedResponse(
  error: string = "Unauthorized",
  request?: Request
): Response {
  const resourceMetadataUrl = request
    ? getResourceMetadataUrl(request)
    : undefined;
  return new Response(
    JSON.stringify({
      error: "Unauthorized",
      message: error,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": buildBearerChallenge(resourceMetadataUrl),
      },
    }
  );
}
