/**
 * Authentication middleware for Cloudflare Image MCP
 *
 * Supports API key authentication via Authorization header:
 * Authorization: Bearer <api-key>
 */

import type { Env } from "../types.js";
import {
  callerKeyVerifier,
  deriveCallerPepper,
} from "../services/caller-crypto.js";
import { getCallerKeyByVerifier } from "../services/caller-store.js";

export interface AuthResult {
  authenticated: boolean;
  apiKey?: string;
  error?: string;
}

/**
 * Does the D1 store hold at least one enabled caller key?
 *
 * This is what keeps the unset-API_KEYS bypass from swallowing a
 * deployment that moved its credentials into D1 (review H1). The old
 * posture — no API_KEYS means open — is only correct while NO credential
 * source exists. Once a key is enabled in `caller_keys`, that table IS the
 * gate, and an anonymous request must not pass just because the env var
 * was retired.
 *
 * The empty case stays open on purpose: binding PROVIDER_DB (which every
 * deployment does) must not lock a keys-less Worker out of `/v1` and
 * `/mcp`. A read failure fails CLOSED — with no env keys there is no other
 * source, and "the database is down" must not mean "everyone is
 * authorized".
 */
async function hasEnabledCallerKeys(env: Env): Promise<boolean> {
  if (!env.PROVIDER_DB) return false;
  try {
    const row = await env.PROVIDER_DB.prepare(
      "SELECT 1 AS ok FROM caller_keys WHERE enabled = 1 LIMIT 1"
    ).first<{ ok: number }>();
    return row !== null;
  } catch (error) {
    console.warn(
      "auth: caller-key lookup failed with no API_KEYS configured; refusing requests",
      error instanceof Error ? error.message : String(error)
    );
    return true;
  }
}

/** The usable values in the comma-separated API_KEYS secret. */
function configuredEnvKeys(env: Env): string[] {
  return (env.API_KEYS ?? "")
    .split(",")
    .map((key: string) => key.trim())
    .filter(Boolean);
}

/**
 * Whether the request gate is active — i.e. some credential source has an
 * entry.
 *
 * Exported because `/health` used to report `!!env.API_KEYS`, which became a
 * lie the moment D1 keys could gate on their own: on a deployment that
 * retired API_KEYS after creating a key (the end state ADR-005 blesses),
 * `/v1` and `/mcp` rejected anonymous callers while health said
 * `authEnabled: false`. One condition, one place (review F4).
 */
export async function isAuthGateActive(env: Env): Promise<boolean> {
  return configuredEnvKeys(env).length > 0 || (await hasEnabledCallerKeys(env));
}

/**
 * Extract and validate API key from request.
 *
 * The bearer authenticates through either credential source (#129, the
 * approved OR transition): any `env.API_KEYS` value, or any ENABLED D1
 * caller key. The env array is checked first — the cheap, allocation-free
 * path every existing deployment rides — and only a bearer the env
 * rejects pays the verifier computation and the one indexed D1 lookup.
 * So a request costs at most one lookup, never a scan.
 *
 * Existence is not leaked: an unknown key and a disabled D1 key both end
 * in the same `Invalid API key` rejection after the same shape of work.
 * A disabled key whose plaintext also sits in `API_KEYS` still
 * authenticates through the env OR-path — that is exactly the legacy
 * mirror whose warning #128 surfaces on disable.
 *
 * D1 trouble degrades to the pre-#129 behavior (env-only), never to an
 * open gate and never to a hard 500 on the hot path.
 */
export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<AuthResult> {
  // Open only when NO credential source is configured (backward
  // compatibility). With API_KEYS unset but keys enabled in D1, the D1
  // table is the gate: returning early here would serve `/v1` and `/mcp`
  // to anyone the moment the operator retired the env var (review H1).
  // A deployment with neither source keeps the documented open posture,
  // so binding PROVIDER_DB alone never locks a Worker out.
  const configuredKeys = configuredEnvKeys(env);
  if (!(await isAuthGateActive(env))) {
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

  // Validate token against configured keys (the legacy mirror)
  if (configuredKeys.includes(token)) {
    return {
      authenticated: true,
      apiKey: token,
    };
  }

  // D1 caller keys (#129): the verifier for the presented bearer, then one
  // indexed lookup. Only reached when the env path said no, so the common
  // env-key request pays no HMAC and no query.
  if (env.PROVIDER_DB && env.PROVIDER_DATA_KEY) {
    try {
      const pepper = await deriveCallerPepper(env.PROVIDER_DATA_KEY);
      const row = await getCallerKeyByVerifier(
        env.PROVIDER_DB,
        await callerKeyVerifier(pepper, token)
      );
      if (row?.enabled) {
        return {
          authenticated: true,
          apiKey: token,
        };
      }
      // A matched-but-disabled row falls through to the same rejection an
      // unknown key gets — unless the plaintext also lives in env, which
      // the mirror check above already handled.
    } catch {
      // D1 or crypto trouble: degrade to env-only auth (pre-#129
      // behavior). The env check above already said no, so the request
      // rejects exactly as it would have before this feature.
    }
  }

  return {
    authenticated: false,
    error: "Invalid API key",
  };
}

/**
 * Check if request path requires authentication
 * Public endpoints: /, /index.html, /admin, /admin/api-keys, /health, /images/*
 * `/admin` and `/admin/api-keys` are the same SPA shell as `/` (admin data
 * is behind the gated /api/admin/*), so they disclose nothing `/` does not.
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
    "/admin",
    "/admin/api-keys",
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
