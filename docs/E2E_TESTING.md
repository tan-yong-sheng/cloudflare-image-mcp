# End-to-End Testing Guide

This document describes the E2E testing infrastructure for Cloudflare Image MCP.

## Overview

E2E tests run against **deployed** Workers (staging/production) — they need a
live backend (`TEST_BASE_URL` + `/health`). Tests use Playwright to validate:

- OpenAI-compatible endpoints (`/v1/images/*`)
- MCP endpoints (`/mcp/*`)
- Model listing and description
- Image generation, editing, and variations

## Test Structure

```
e2e/
├── tests/api/
│   ├── health.spec.ts           # Health checks
│   ├── openai/                  # /v1/* tests (models, generations, edits, variations, SDK)
│   └── mcp/                     # MCP tests (initialize, tools, SSE, SDK)
├── lib/                         # target.ts (TEST_TARGET/TEST_BASE_URL), auth.ts
├── playwright.config.ts         # Playwright configuration
├── global-setup.ts              # Global test setup
├── global-teardown.ts           # Global test teardown
└── package.json                 # Test dependencies
```

## Running Tests

### Prerequisites

```bash
cd e2e
npm ci
npx playwright install --with-deps
```

### Workers Testing

```bash
# From the repo root; tests target staging by default
npm run test:e2e:staging
npm run test:e2e:production

# Or with an explicit backend URL
cd e2e && TEST_BASE_URL=https://<your-worker>.workers.dev npx playwright test
```

### Specific Test Files

```bash
# Test OpenAI endpoints only
npx playwright test tests/api/openai

# Test MCP endpoints only
npx playwright test tests/api/mcp

# Test specific file
npx playwright test tests/api/openai/generations.spec.ts
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

| Variable        | Description                                                                          | Default            |
| --------------- | ------------------------------------------------------------------------------------ | ------------------ |
| `TEST_TARGET`   | Target environment: `staging` or `production`                                        | `staging`          |
| `TEST_BASE_URL` | Base URL for testing                                                                 | (auto-constructed) |
| `E2E_TIER`      | Live-test tier: `contract` \| `smoke` \| `canary` \| `slow` (see `e2e/lib/tiers.ts`) | (unset = contract) |
| `TEST_TIMEOUT`  | Action/navigation budget override only; per-test timeout always comes from the tier  | (tier default)     |
| `CI`            | Running in CI environment                                                            | `false`            |

Legacy flags (`E2E_SLOW` / `E2E_SMOKE` / `E2E_DRIFT`) still work as a
fallback, but `E2E_TIER` wins when set — prefer `npm run test:smoke`,
`test:canary`, `test:slow`.

### Playwright Configuration

Edit `e2e/playwright.config.ts` to customize:

```typescript
export default defineConfig({
  workers: process.env.CI ? 1 : undefined, // Parallel tests
  retries: process.env.CI ? 2 : 0, // Retry on failure
  reporter: [
    ["html"], // HTML report
    ["junit", { outputFile: "junit-results.xml" }], // JUnit for CI
  ],
});
```

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from "@playwright/test";

test.describe("Feature", () => {
  test("should do something @api", async ({ request }) => {
    const response = await request.post("/v1/images/generations", {
      data: {
        prompt: "A test image",
        model: "@cf/black-forest-labs/flux-1-schnell",
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("data");
    expect(body.data[0]).toHaveProperty("url");
  });
});
```

### Test Tags

Use tags to categorize tests:

- `@api` - API-focused tests (run in all browsers)
- `@slow` - Slow tests (may be skipped in quick runs)
- `@smoke` - Live canaries (subset of `@slow`): run on gated release
  PRs via `E2E_TIER=smoke` / `npm run test:smoke`, canary tier via
  `E2E_TIER=canary` / `npm run test:canary` on schedule,
  everything via `E2E_TIER=slow` / `npm run test:slow` on dispatch
- `@drift` - Model/SDK drift canaries (subset of `@slow`, weekly
  schedule only): per-model provider behavior + published-SDK transport
  that hermetic contract tests cannot prove

Tier → (grep, per-test timeout) lives in `e2e/lib/tiers.ts` — the single
owner. The workflow selects only the tier _name_ by trigger; spec titles
keep their `@slow`/`@smoke`/`@drift` tags because Playwright tags live in
titles.

### Test Data

Use small base64 images for testing edits/variations:

```typescript
// 1x1 pixel red PNG
const TEST_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
```

## CI/CD Integration

### GitHub Actions

The E2E workflow (`.github/workflows/e2e-tests.yml`) triggers on every PR
to `main` (no paths filter, so the `e2e`-label opt-in can't be silently
blocked), plus a weekly canary schedule and manual dispatch. Job-level
guards decide what actually runs:

1. **Release-integration PRs** (head branch `prerelease/*` or `release/*`,
   case-insensitive) and **PRs labeled `e2e`** — full gate: deploy a shared
   staging worker, run the smoke/canary tiers, delete the worker. Overlapping
   gated runs serialize on one concurrency group (`e2e-staging-worker`,
   queued, never cancelled); feature PRs wait behind an active staging run
   before their skip is reported.
2. **Other pull requests** — skip in seconds. The `E2E Gate Sentinel` check
   stays green (branch protection must require the sentinel, which can
   fail, not the raw E2E job, which reads skipped as success).
3. **Manual dispatch** (`workflow_dispatch`) — test staging, production, or a custom URL

Optional input: `test_pattern` (e.g. `tests/api/mcp/mcp-sdk.spec.ts`) to run a subset.

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

`TEST_TIMEOUT` only raises the action/navigation budget — the per-test
timeout comes from the tier (`e2e/lib/tiers.ts`: 60s contract, 180s any
live tier). If a live canary times out on a cold worker, the tier budget
is the knob, not the spec file: do not add per-file `test.setTimeout`
below the tier value, it masks drift as a timeout (see
`flux-models.spec.ts` history).

### Worker Not Responding

Check health endpoint:

```bash
curl https://cloudflare-image-workers.<account_id>.workers.dev/health
```

### Workers Tests Failing

Verify Workers deployment:

```bash
curl https://cloudflare-image-workers.<account_id>.workers.dev/health
```

The suite fails fast against `https://example.invalid`-style placeholder URLs —
this means no real `TEST_BASE_URL` was provided (see `e2e/lib/target.ts`).

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
test("feature test", async ({ request }) => {
  const response = await request.post("/endpoint");

  if (response.status() === 404) {
    test.skip(true, "Feature not available");
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
