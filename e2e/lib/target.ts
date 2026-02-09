/**
 * Target configuration utilities for E2E tests
 *
 * Supports testing against:
 * - staging: Staging Workers deployment
 * - production: Production Workers deployment
 */

export type TestTarget = 'staging' | 'production';

export interface TargetConfig {
  name: TestTarget;
  baseURL: string;
  requiresAuth: boolean;
  authType: 'none' | 'apikey' | 'cloudflare';
}

/**
 * Get target configuration based on environment
 */
export function getTargetConfig(): TargetConfig {
  const target = (process.env.TEST_TARGET || 'staging') as TestTarget;

  switch (target) {
    case 'production':
      return {
        name: 'production',
        baseURL: process.env.TEST_BASE_URL || '',
        requiresAuth: true,
        authType: 'apikey',
      };

    case 'staging':
      return {
        name: 'staging',
        baseURL: process.env.TEST_BASE_URL || '',
        requiresAuth: true,
        authType: 'apikey',
      };

    default:
      return {
        name: 'staging',
        baseURL: process.env.TEST_BASE_URL || '',
        requiresAuth: true,
        authType: 'apikey',
      };
  }
}

/**
 * Get the appropriate base URL for the current target
 *
 * URL Construction:
 * - Local: http://localhost:3000 (or TEST_BASE_URL override)
 * - Staging: https://cloudflare-image-workers-staging.<account_id>.workers.dev
 * - Production: https://cloudflare-image-workers.<account_id>.workers.dev
 *
 * The Workers URL is constructed from CLOUDFLARE_ACCOUNT_ID rather than stored as a secret.
 */
export function getBaseURL(): string {
  const config = getTargetConfig();

  // If TEST_BASE_URL is explicitly set, use it
  if (config.baseURL) {
    return config.baseURL;
  }

  // For staging/production, construct URL from account ID
  if (config.name === 'staging' || config.name === 'production') {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) {
      // Allow local execution without any env by falling back to a placeholder.
      // CI/workflow should provide CLOUDFLARE_ACCOUNT_ID or TEST_BASE_URL.
      return 'https://example.invalid';
    }

    const workerName = config.name === 'staging'
      ? 'cloudflare-image-workers-staging'
      : 'cloudflare-image-workers';

    return `https://${workerName}.${accountId}.workers.dev`;
  }

  // Should never reach here because staging/production must be handled above.
  throw new Error('Unexpected TEST_TARGET configuration');
}

/**
 * Check if current target requires authentication
 */
export function requiresAuth(): boolean {
  return getTargetConfig().requiresAuth;
}

/**
 * Get auth headers if API key is available
 */
export function getAuthHeaders(): Record<string, string> {
  const config = getTargetConfig();

  if (!config.requiresAuth) {
    return {};
  }

  const apiKey = process.env.API_KEY;
  if (apiKey) {
    return { 'Authorization': `Bearer ${apiKey}` };
  }

  return {};
}

/**
 * Skip auth tests if target doesn't require auth
 */
export function skipIfNoAuth(testFn: () => void | Promise<void>): void {
  if (requiresAuth()) {
    testFn();
  }
}
