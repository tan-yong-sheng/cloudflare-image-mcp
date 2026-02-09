# End-to-End Testing Guide

This document describes the E2E testing infrastructure for Cloudflare Image MCP.

## Overview

E2E tests ensure the API works correctly across both local and Cloudflare Workers deployments. Tests use Playwright to validate:

- OpenAI-compatible endpoints (`/v1/images/*`)
- MCP endpoints (`/mcp/*`)
- Model listing and description
- Image generation, editing, and variations

## Test Structure

```
e2e/
├── tests/
│   ├── health.spec.ts           # Health checks
│   ├── openai/
│   │   ├── models.spec.ts       # /v1/models tests
│   │   ├── generations.spec.ts  # /v1/images/generations tests
│   │   ├── edits.spec.ts        # /v1/images/edits tests
│   │   └── variations.spec.ts   # /v1/images/variations tests
│   └── mcp/
│       ├── initialize.spec.ts   # MCP initialization
│       ├── tools.spec.ts        # MCP tools tests
│       └── sse.spec.ts          # MCP SSE transport
├── playwright.config.ts         # Playwright configuration
├── global-setup.ts              # Global test setup
├── global-teardown.ts           # Global test teardown
└── package.json                 # Test dependencies
```

## Running Tests

### Prerequisites

```bash
cd e2e
npm install
npx playwright install --with-deps
```

### Workers Testing

```bash
# Deploy to Workers first
cd workers && npm run deploy

# Run tests against Workers
TEST_TARGET=staging npm test
```

### Specific Test Files

```bash
# Test OpenAI endpoints only
npx playwright test tests/openai

# Test MCP endpoints only
npx playwright test tests/mcp

# Test specific file
npx playwright test tests/openai/generations.spec.ts
```

### Debugging

```bash
# Run in headed mode (see browser)
npx playwright test --headed

# Run with UI
npx playwright test --ui

# Debug specific test
npx playwright test --debug

# Show report
npx playwright show-report
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEST_TARGET` | Target environment: `staging` or `production` | `staging` |
| `TEST_BASE_URL` | Base URL for testing | (auto-constructed) |
| `TEST_TIMEOUT` | Test timeout in ms | `60000` |
| `CI` | Running in CI environment | `false` |

### Playwright Configuration

Edit `e2e/playwright.config.ts` to customize:

```typescript
export default defineConfig({
  workers: process.env.CI ? 1 : undefined,  // Parallel tests
  retries: process.env.CI ? 2 : 0,          // Retry on failure
  reporter: [
    ['html'],                               // HTML report
    ['junit', { outputFile: 'junit-results.xml' }],  // JUnit for CI
  ],
});
```

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature', () => {
  test('should do something @api', async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        prompt: 'A test image',
        model: '@cf/black-forest-labs/flux-1-schnell',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(body.data[0]).toHaveProperty('url');
  });
});
```

### Test Tags

Use tags to categorize tests:

- `@api` - API-focused tests (run in all browsers)
- `@slow` - Slow tests (may be skipped in quick runs)

### Test Data

Use small base64 images for testing edits/variations:

```typescript
// 1x1 pixel red PNG
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
```

## CI/CD Integration

### GitHub Actions

The E2E workflow (`.github/workflows/e2e-tests.yml`) runs on:

1. **Pull Requests** - Tests local changes
2. **Manual Dispatch** - Test specific deployments

### Workflow Triggers

```yaml
on:
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment: { staging, production }
```

### Test Artifacts

On failure, GitHub Actions uploads:

- Playwright HTML report
- JUnit XML results
- Screenshots
- Videos
- Traces

Access artifacts from the Actions run summary.

### PR Comments

E2E results are posted as PR comments:

```
## E2E Test Results ✅ PASSED

**Target:** local

| Metric | Count |
|--------|-------|
| Total Tests | 25 |
| Passed | 25 |
| Failures | 0 |
| Errors | 0 |
```

## Troubleshooting

### Tests Time Out

Increase timeout:

```bash
TEST_TIMEOUT=120000 npm test
```

### Worker Not Responding

Check health endpoint:

```bash
curl https://cloudflare-image-workers.<account_id>.workers.dev/health
```

### Workers Tests Failing

Verify Workers deployment:

```bash
curl https://cloudflare-image-workers.tanyongsheng-net.workers.dev/health
```

### Browser Installation Issues

Reinstall browsers:

```bash
npx playwright install --with-deps
```

## Best Practices

1. **Use `@api` tag** for API tests
2. **Test both success and error cases**
3. **Use descriptive test names**
4. **Keep tests independent**
5. **Clean up resources in teardown**
6. **Skip unavailable features gracefully**:

```typescript
test('feature test', async ({ request }) => {
  const response = await request.post('/endpoint');

  if (response.status() === 404) {
    test.skip(true, 'Feature not available');
    return;
  }

  // Rest of test
});
```

## Adding New Tests

1. Create test file in appropriate directory
2. Import Playwright test utilities
3. Write tests with clear descriptions
4. Run tests locally before committing
5. Update this documentation if needed

## Coverage

Current E2E coverage includes:

- ✅ All OpenAI endpoints
- ✅ All MCP methods
- ✅ Model listing and description
- ✅ Image generation with all supported models
- ✅ Error handling
- ✅ CORS headers
- ✅ Response formats (URL and base64)
