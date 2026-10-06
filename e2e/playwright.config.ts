import { defineConfig, devices } from '@playwright/test';
import { getBaseURL, getAuthHeaders, getTargetConfig } from './lib/target.js';

/**
 * E2E Test Configuration for Cloudflare Image MCP
 *
 * Supports testing:
 * - Staging Workers: URL from secrets or environment
 * - Production Workers: URL from secrets or environment
 *
 * Configuration via environment variables:
 * - TEST_TARGET: 'staging' | 'production' (default: 'staging')
 * - TEST_BASE_URL: Override the base URL
 * - API_KEY: API key for authenticated endpoints
 * - TEST_TIMEOUT: Test timeout in milliseconds (default: 60000)
 */

// Get target configuration
const targetConfig = getTargetConfig();
const baseURL = getBaseURL();
const authHeaders = getAuthHeaders();

// Timeout configuration
const timeout = parseInt(process.env.TEST_TIMEOUT || '60000');

// Slow tests make real Workers AI calls (15-90s each on cold workers).
// Default runs skip them: `E2E_SLOW=1` opts into the full matrix
// (release branches, manual dispatch). One smoke test per surface stays
// untagged so the credential chain is still proven on every run.
const runSlow = process.env.E2E_SLOW === '1';

console.log(`🎯 E2E Test Configuration:`);
console.log(`   Target: ${targetConfig.name}`);
console.log(`   Base URL: ${baseURL}`);
console.log(`   Auth Required: ${targetConfig.requiresAuth}`);
console.log(`   Auth Headers Present: ${Object.keys(authHeaders).length > 0}`);
console.log(`   Slow generation tests: ${runSlow ? 'included (E2E_SLOW=1)' : 'skipped (set E2E_SLOW=1 for full matrix)'}`);

export default defineConfig({
  testDir: './tests',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Skip @slow tests (real image generation) unless explicitly opted in.
  // This keeps PR runs to ~1min of contract tests; release/manual runs set
  // E2E_SLOW=1 for the full matrix with a matching timeout budget.
  grepInvert: runSlow ? undefined : /@slow/,

  // Generous per-test timeout: slow runs need it for cold workers,
  // fast runs are unaffected (their tests finish in ms).
  timeout: runSlow ? 180000 : 60000,

  // Opt out of parallel tests on CI (resource intensive image generation)
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'junit-results.xml' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for all tests
    baseURL,

    // Auth headers for authenticated endpoints
    extraHTTPHeaders: authHeaders,

    // Collect trace when retrying failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'on-first-retry',

    // Test timeout (image generation can take time)
    actionTimeout: timeout,

    // Request timeout
    navigationTimeout: timeout,

    // Custom test metadata
    testIdAttribute: 'data-testid',

  },

  // Configure projects for different browsers/environments
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox testing (API tests work fine, mainly for frontend)
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      // Only run API tests in Firefox (skip UI-heavy tests)
      grep: /@api/,
    },
    // WebKit testing
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      grep: /@api/,
    },
  ],

  // No local server: workers-only repo
  webServer: undefined,

  // Global setup/teardown
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  // Output directory for test artifacts
  outputDir: 'test-results/',

  // Expect assertions timeout
  expect: {
    timeout: timeout,
  },
});
