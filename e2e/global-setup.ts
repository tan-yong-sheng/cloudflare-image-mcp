import { FullConfig } from '@playwright/test';

/**
 * Global Setup - Runs once before all tests
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E Test Suite');
  console.log(`📍 Target: ${process.env.TEST_TARGET || 'local'}`);
  console.log(`🔗 Base URL: ${config.projects[0].use.baseURL}`);

  // Verify target is accessible
  const baseURL = config.projects[0].use.baseURL as string;
  try {
    const response = await fetch(`${baseURL}/health`);
    if (!response.ok) {
      console.warn(`⚠️  Health check returned ${response.status}`);
    } else {
      console.log('✅ Health check passed');
    }
  } catch (error) {
    console.warn(`⚠️  Could not reach ${baseURL}/health:`, error.message);
    if (process.env.CI) {
      throw new Error(`Target ${baseURL} is not accessible`);
    }
  }

  // Set test start time for reporting
  process.env.TEST_START_TIME = Date.now().toString();

  console.log('');
}

export default globalSetup;
