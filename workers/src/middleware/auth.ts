/**
 * Authentication middleware for Cloudflare Image MCP
 *
 * Supports API key authentication via Authorization header:
 * Authorization: Bearer <api-key>
 */

import type { Env } from '../types.js';

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
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return {
      authenticated: false,
      error: 'Missing Authorization header',
    };
  }

  // Parse Bearer token
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return {
      authenticated: false,
      error: 'Invalid Authorization format. Expected: Bearer <api-key>',
    };
  }

  // Validate token against configured keys
  const validKeys = env.API_KEYS.split(',').map((k: string) => k.trim()).filter(Boolean);
  if (!validKeys.includes(token)) {
    return {
      authenticated: false,
      error: 'Invalid API key',
    };
  }

  return {
    authenticated: true,
    apiKey: token,
  };
}

/**
 * Check if request path requires authentication
 * Public endpoints: /health, /login (POST), /images/* (if served directly)
 * Note: Frontend (/) requires auth when API_KEYS is configured
 */
export function requiresAuth(path: string, method: string): boolean {
  // Always allow OPTIONS (CORS preflight)
  if (method === 'OPTIONS') {
    return false;
  }

  // Public endpoints (always accessible)
  const publicPaths = [
    '/health',
    '/login',  // Login endpoint is public (it validates password)
  ];

  // Check exact matches
  if (publicPaths.includes(path)) {
    return false;
  }

  // Images can be public (they have signed URLs or short expiry)
  if (path.startsWith('/images/')) {
    return false;
  }

  // Models list is public
  if (path === '/api/internal/models') {
    return false;
  }

  // Everything else requires auth if API_KEYS is configured
  // This includes / and /index.html (frontend)
  return true;
}

/**
 * Create 401 Unauthorized response
 */
export function createUnauthorizedResponse(error: string = 'Unauthorized'): Response {
  return new Response(
    JSON.stringify({
      error: 'Unauthorized',
      message: error,
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer',
      },
    }
  );
}

/**
 * Middleware wrapper for authentication
 */
export function withAuth(
  handler: (request: Request, env: Env) => Promise<Response>,
  env: Env
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    // Check if auth is required for this path
    if (!requiresAuth(url.pathname, request.method)) {
      return handler(request, env);
    }

    // Validate authentication
    const authResult = authenticateRequest(request, env);
    if (!authResult.authenticated) {
      return createUnauthorizedResponse(authResult.error);
    }

    // Proceed with authenticated request
    return handler(request, env);
  };
}
