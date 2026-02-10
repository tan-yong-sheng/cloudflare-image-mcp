/**
 * Authentication utilities for E2E tests
 *
 * Provides helpers for testing authenticated endpoints
 */

import { expect } from '@playwright/test';

/**
 * Get API key from environment
 */
export function getApiKey(): string | undefined {
  return process.env.API_KEY?.trim() || process.env.API_KEYS?.split(',')[0]?.trim();
}

/**
 * Check if API key is configured
 */
export function hasApiKey(): boolean {
  return !!getApiKey();
}

/**
 * Get Authorization header value
 */
export function getAuthorizationHeader(): string | undefined {
  const apiKey = getApiKey();
  return apiKey ? `Bearer ${apiKey}` : undefined;
}

/**
 * Get all auth headers as object
 */
export function getAuthHeaders(): Record<string, string> {
  const auth = getAuthorizationHeader();
  return auth ? { 'Authorization': auth } : {};
}

/**
 * Validate that a response has 401 Unauthorized status
 */
export function expectUnauthorized(response: { status(): number }): void {
  expect(response.status()).toBe(401);
}

/**
 * Validate that a response has 403 Forbidden status
 */
export function expectForbidden(response: { status(): number }): void {
  expect(response.status()).toBe(403);
}

/**
 * Create request options with auth headers
 */
export function withAuth(
  options: { headers?: Record<string, string>; [key: string]: unknown } = {}
): Record<string, unknown> {
  const authHeaders = getAuthHeaders();

  return {
    ...options,
    headers: {
      ...authHeaders,
      ...options.headers,
    },
  };
}

/**
 * Check if auth is available for conditional test skipping
 */
export function shouldSkipAuthTest(): boolean {
  return !getApiKey();
}
