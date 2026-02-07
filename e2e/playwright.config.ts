import { defineConfig, devices } from '@playwright/test';

/**
 * E2E Test Configuration for Cloudflare Image MCP
 *
 * Supports testing both:
 * - Local deployment (packages/local): http://localhost:3000
 * - Cloudflare Workers (workers): https://cloudflare-image-workers.tanyongsheng-net.workers.dev
 */

// Determine test target from environment
const testTarget = process.env.TEST_TARGET || 'local';
const isWorkers = testTarget === 'workers';

// Base URL configuration
const baseURL = isWorkers
  ? 'https://cloudflare-image-workers.tanyongsheng-net.workers.dev'
  : process.env.TEST_BASE_URL || 'http://localhost:3000';

// Timeout configuration
const timeout = parseInt(process.env.TEST_TIMEOUT || '60000');

export default defineConfig({
  testDir: './tests',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

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

  // Local dev server configuration (only for local tests)
  webServer: isWorkers
    ? undefined
    : {
        command: 'cd ../packages/local && npm run dev',
        url: 'http://localhost:3000/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        env: {
          PORT: '3000',
          NODE_ENV: 'test',
        },
      },

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
