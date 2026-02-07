import { FullConfig } from '@playwright/test';

/**
 * Global Teardown - Runs once after all tests
 */
async function globalTeardown(config: FullConfig) {
  console.log('');
  console.log('🏁 E2E Test Suite Complete');

  const startTime = parseInt(process.env.TEST_START_TIME || '0');
  const duration = Date.now() - startTime;
  console.log(`⏱️  Total duration: ${(duration / 1000).toFixed(1)}s`);

  // Clean up any test artifacts if needed
  // (Playwright handles screenshot/video cleanup automatically)

  console.log('');
}

export default globalTeardown;
