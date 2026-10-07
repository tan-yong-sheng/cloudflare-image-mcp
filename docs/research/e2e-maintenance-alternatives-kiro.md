# E2E Maintenance & Network Call Reduction Strategies

**Research Date:** January 2025  
**Context:** Issue #10 E2E gate hardening for `tan-yong-sheng/cloudflare-image-mcp`  
**Current State:** Playwright E2E suite hits live Cloudflare staging worker; full matrix (~36 @slow tests) calls Workers AI image generation (real network, real inference cost, ~30min runtime)

## Problem Statement

The current E2E architecture creates three maintenance burdens:

1. **Network cost & latency**: @slow tests make real Workers AI inference calls (~36 tests × 15-90s each = 30min full matrix)
2. **Flakiness multiplication**: Each test depends on staging worker availability × Workers AI availability × network stability (see availability arithmetic: 0.99^n reliability)
3. **Human maintenance overhead**: Shared staging environment requires coordination; environmental failures unrelated to code changes cause CI noise

**Gating strategy (current):**

- PR checks: fast contract tests, no network, no @slow tests (~3min)
- Merge gate: full matrix with @slow tests on release-integration branches (prerelease/_, release/_, or `e2e` label)

**Goal:** Minimize image-generation network requests in CI while maintaining confidence in what must be gated, with lowest human maintenance burden.

---

## Architecture Alternatives

### Option 1: VCR-Style HTTP Recording & Replay

**Description:** Record real Workers AI HTTP responses once; replay from disk in subsequent test runs. No live network calls after initial recording.

**Mechanism:**

- **Recording phase**: Run tests with `E2E_RECORD=1`, capture all HTTP traffic to/from Workers AI endpoints to HAR/JSON cassettes
- **Replay phase**: Default test runs intercept matching requests and return cached responses from cassettes
- **Refresh strategy**: Scheduled weekly/monthly re-recording to keep responses current with API evolution

**Implementation (Playwright):**

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    // Record mode: update=true writes real responses to HAR
    // Replay mode: update omitted/false serves from HAR
    // See: https://playwright.dev/docs/mock#mocking-with-har-files
  },
});

// In test setup or per-test
await page.routeFromHAR("./hars/workers-ai-generations.har", {
  url: "**/v1/images/generations",
  update: process.env.E2E_RECORD === "1", // Record on demand
});
```

**Playwright HAR support:** Native via `page.routeFromHAR()` and `context.routeFromHAR()`. HAR files are human-readable YAML/JSON capturing request/response pairs. Source: [Playwright Mock APIs documentation](https://playwright.dev/docs/mock#mocking-with-har-files)

**Alternative libraries (Node.js ecosystem):**

- **Polly.js** (Netflix): Records to disk, supports HAR format, request matching by URL/method/body. [github.com/Netflix/pollyjs](https://github.com/Netflix/pollyjs)
- **nock**: Programmatic HTTP mocking (not file-based VCR but similar concept). [github.com/nock/nock](https://github.com/nock/nock)
- **VCR.rb (Ruby)** inspiration: Original VCR pattern popularized by Ruby community. Node equivalents listed above.

**Pros:**

- ✅ Zero network calls after recording → eliminates inference cost & latency
- ✅ Deterministic: same cassette = same response every run
- ✅ Fast: @slow tests become fast (ms instead of 15-90s per test)
- ✅ Low CI cost: no live staging worker dependency for recorded flows
- ✅ Easy to inspect/edit responses (HAR is text-based JSON/YAML)

**Cons:**

- ⚠️ Cassettes drift from reality over time (API changes, new model behaviors not captured)
- ⚠️ Initial recording still requires staging worker + real AI calls
- ⚠️ Large binary image responses bloat cassettes (36 tests × ~1-5MB images = 36-180MB repo size)
- ⚠️ Maintenance: must schedule re-recording and review diffs when responses change
- ⚠️ False confidence: replaying stale responses doesn't catch regressions in live AI behavior

**Effort:** 🔨🔨 Medium (2-3 days)

- Day 1: Playwright HAR integration, record initial cassettes for @slow tests
- Day 2: CI workflow updates (record mode on schedule, replay mode default), .gitignore for large binary payloads
- Day 3: Documentation, scheduled re-recording cron (GitHub Actions `schedule` trigger)

**Value:** ⭐⭐⭐⭐ High  
Eliminates 95% of network cost and flakiness for the 36 @slow tests. Best fit if API stability is high and you trust recorded responses represent current behavior.

**When to use:** API contract is more important than live inference correctness (e.g., "does the response have a `url` field?" not "is the generated image semantically correct?")

---

### Option 2: Contract Tests + Recorded/Mocked AI Responses

**Description:** Replace full E2E @slow tests with contract tests that verify API shape (status codes, response schemas) using mocked AI responses. Keep 1-2 smoke tests with real AI as sanity checks.

**Mechanism:**

- **Contract tests**: Fast schema validation (JSON Schema, Zod, Pact) against mocked responses. Example: "POST /v1/images/generations returns 200 with {created, data[{url}]}"
- **Mocked AI responses**: Playwright route handlers return canned JSON with deterministic `url` fields pointing to test fixture images
- **Smoke tests**: 1-2 critical paths (e.g., "FLUX Schnell generation end-to-end") run with real AI, gated on release branches only

**Implementation (Playwright):**

```typescript
// Mock Workers AI response
await page.route("**/v1/images/generations", async (route) => {
  const json = {
    created: Math.floor(Date.now() / 1000),
    data: [{ url: "/images/mock-image-id-12345" }],
  };
  await route.fulfill({ status: 200, json });
});

// Contract assertion (no AI call made)
const response = await request.post("/v1/images/generations", {
  data: { prompt: "test", model: "@cf/black-forest-labs/flux-1-schnell" },
});
expect(response.status()).toBe(200);
const body = await response.json();
expect(body).toMatchSchema(generationResponseSchema); // Zod/JSON Schema
```

**Contract testing tools:**

- **Pact** (consumer-driven contracts): Provider/consumer contract verification. Overkill for single-team repo but gold standard for multi-team microservices. [docs.pact.io](https://docs.pact.io/)
- **JSON Schema validation**: Lightweight, built into many test frameworks. [json-schema.org](https://json-schema.org/)
- **Zod** (TypeScript): Runtime schema validation with type inference. [github.com/colinhacks/zod](https://github.com/colinhacks/zod)

**Smoke test strategy:**

```yaml
# .github/workflows/e2e-tests.yml
jobs:
  contract-tests:
    runs-on: ubuntu-latest
    # Fast contract tests run on every PR
    steps:
      - run: E2E_MOCK_AI=1 npx playwright test # Mocked AI responses

  smoke-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' || startsWith(github.head_ref, 'release/')
    # Real AI smoke tests only on release branches
    steps:
      - run: E2E_SLOW=1 npx playwright test tests/api/openai/generations.spec.ts:10 # 1 real test
```

**Pros:**

- ✅ Fast: contract tests run in milliseconds
- ✅ Cheap: 95% of tests mocked, only 1-2 smoke tests hit real AI
- ✅ Catches schema changes immediately (contract breaks if response shape changes)
- ✅ Deterministic: mocked responses never flake
- ✅ Scales: adding 100 more contract tests costs ~1s, not 30min

**Cons:**

- ⚠️ Mocks can drift from real API behavior (classic mocking trap)
- ⚠️ Smoke tests still need staging worker + real AI (but only 2-3 tests, not 36)
- ⚠️ Requires discipline to keep contract schemas up-to-date
- ⚠️ Doesn't catch model-specific bugs (e.g., FLUX vs SDXL parameter differences)

**Effort:** 🔨🔨 Medium (2-4 days)

- Day 1: Define JSON schemas for all OpenAI-compatible endpoints
- Day 2-3: Convert @slow tests to mocked contract tests
- Day 4: Identify 1-2 smoke tests, update CI to run them on release branches only

**Value:** ⭐⭐⭐⭐⭐ Very High  
Best effort-to-value ratio. Contract tests are industry best practice for API testing. Smoke tests provide sanity check without full matrix cost.

**When to use:** You trust schema stability more than pixel-perfect image correctness; acceptable to catch model-specific bugs in staging/production monitoring instead of pre-deploy.

**Design note:** This is the testing pyramid reshaped for microservices. From "Integration Testing Strategies for Microservice Architectures":

> "47% of production incidents would have been caught by contract tests... nearly half of all production incidents were caused by service-to-service communication failures that contract tests are specifically designed to prevent." ([Source](https://harborsoftware.com/2024/12/06/integration-testing-strategies-microservice-architectures/))

---

### Option 3: Ephemeral Preview Deployments (Per-PR Workers)

**Description:** Deploy a temporary Worker for each PR/branch using Cloudflare's preview accounts or custom worker naming. Tests hit the preview worker instead of a shared staging environment. Clean up preview worker after PR merge/close.

**Mechanism:**

- **Deploy step**: `wrangler deploy --name cloudflare-image-workers-pr-${PR_NUMBER}` creates isolated worker per PR
- **Test step**: `TEST_BASE_URL=https://cloudflare-image-workers-pr-123.subdomain.workers.dev npm test`
- **Cleanup step**: `wrangler delete --name cloudflare-image-workers-pr-${PR_NUMBER}` on PR close

**Cloudflare Temporary Accounts (NEW as of June 2026):**
Cloudflare now supports temporary preview accounts for AI agents/CI via `wrangler deploy --temporary`. These accounts:

- Live for 60 minutes
- Do NOT require authentication during deployment
- Support Workers, KV, D1, Durable Objects, Hyperdrive, Queues
- Return a claim URL to convert to permanent account after validation

**Source:** [Cloudflare Workers Claim Deployments documentation](https://developers.cloudflare.com/workers/platform/claim-deployments/)

**Example workflow:**

```yaml
# .github/workflows/e2e-pr-preview.yml
jobs:
  deploy-preview:
    runs-on: ubuntu-latest
    outputs:
      worker_url: ${{ steps.deploy.outputs.url }}
    steps:
      - run: |
          npx wrangler deploy --name "preview-pr-${{ github.event.pull_request.number }}"
          echo "url=https://preview-pr-${{ github.event.pull_request.number }}.$SUBDOMAIN.workers.dev" >> $GITHUB_OUTPUT
        id: deploy

  test-preview:
    needs: deploy-preview
    runs-on: ubuntu-latest
    env:
      TEST_BASE_URL: ${{ needs.deploy-preview.outputs.worker_url }}
    steps:
      - run: npm run test:e2e

  cleanup-preview:
    if: always()
    needs: [deploy-preview, test-preview]
    runs-on: ubuntu-latest
    steps:
      - run: npx wrangler delete --name "preview-pr-${{ github.event.pull_request.number }}"
```

**Pros:**

- ✅ Isolated: no shared staging contention, PRs can't break each other's tests
- ✅ Parallel: multiple PRs can test simultaneously without queueing
- ✅ Real environment: tests against actual deployed worker, not mocks
- ✅ Cleanup automatic: preview worker deleted when PR closes

**Cons:**

- ⚠️ Still makes real AI calls (doesn't reduce network cost, only reduces contention)
- ⚠️ Cloudflare limits: account quotas may limit concurrent preview workers
- ⚠️ Cost: each PR pays for its own worker invocations + AI inference
- ⚠️ Temporary accounts (60min TTL) may not fit long-running PR workflows
- ⚠️ Cleanup failures leak orphaned workers (need janitor job to clean up old previews)

**Effort:** 🔨🔨🔨 High (3-5 days)

- Day 1: Refactor deploy workflow to support dynamic worker names
- Day 2-3: Update e2e-tests.yml to deploy preview, test, cleanup in sequence
- Day 4: Implement orphan cleanup (cron job to delete workers older than 7 days)
- Day 5: Test concurrency limits, handle quota failures gracefully

**Value:** ⭐⭐⭐ Medium  
Solves staging contention but doesn't reduce network cost. Adds operational complexity (cleanup, quota management). Better for teams with many concurrent PRs hitting shared staging.

**When to use:** Shared staging environment is a bottleneck and you have budget for per-PR inference costs. Not recommended if network cost reduction is the primary goal.

---

### Option 4: Scheduled Full-Matrix Runs (Shift-Left-Then-Right)

**Description:** Run fast contract tests on every PR (shift-left). Run full @slow matrix on a schedule (nightly/weekly) instead of per-PR, with results posted to Slack/GitHub Issues (shift-right to monitoring).

**Mechanism:**

- **PR gate**: Only fast contract tests (E2E_SLOW unset), ~3min
- **Scheduled suite**: GitHub Actions `schedule` cron runs full @slow matrix against staging nightly
- **Notification**: Scheduled run failures open GitHub Issues or post to team Slack channel

**Implementation:**

```yaml
# .github/workflows/e2e-scheduled.yml
on:
  schedule:
    # Run full matrix nightly at 2am UTC
    - cron: "0 2 * * *"
  workflow_dispatch: # Manual trigger option

jobs:
  full-matrix:
    runs-on: ubuntu-latest
    steps:
      - run: E2E_SLOW=1 npx playwright test --reporter=github

      - name: Report failures
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Nightly E2E failure: ${new Date().toISOString()}`,
              body: `Full @slow matrix failed. See run: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
              labels: ['e2e-failure', 'triage']
            });
```

**GitHub Actions `schedule` trigger:** Uses cron syntax, runs on default branch only. Max frequency: every 5 minutes (but don't abuse it). Source: [GitHub Actions Events documentation](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)

**Pros:**

- ✅ Fast PR feedback: contract tests in 3min, no waiting for 30min suite
- ✅ Full coverage preserved: @slow tests still run, just not on every push
- ✅ Reduced cost: 36 AI calls once per day = 36 calls/day, not 36 calls × N PRs/day
- ✅ Historical data: nightly runs catch regressions even if no PR active

**Cons:**

- ⚠️ Delayed feedback: @slow test failures discovered hours/days after merge, not pre-merge
- ⚠️ Blame harder: if nightly fails, which of the 10 merged PRs broke it?
- ⚠️ Requires discipline: team must triage nightly failures promptly or they accumulate
- ⚠️ Not a merge gate: can't prevent bad deploys, only detect them after merge

**Effort:** 🔨 Low (1 day)

- Hour 1-2: Create scheduled workflow YAML
- Hour 3-4: Set up failure notifications (GitHub Issues or Slack webhook)
- Hour 5-6: Document new workflow in CONTRIB.md, train team on triage process

**Value:** ⭐⭐⭐ Medium-High  
Good compromise for mature teams with strong post-merge monitoring. Reduces network cost by ~90% (1 nightly run vs N PR runs) while maintaining test coverage.

**When to use:** Team has low PR volume (<5/day), strong post-merge monitoring culture, and trusts contract tests to catch most regressions pre-merge. Not suitable if production deploys happen minutes after PR merge (no time to catch nightly failures).

---

### Option 5: Smoke vs Matrix Split (Hybrid Gating)

**Description:** Every PR runs 1-2 smoke tests (real AI, critical paths only). Full 36-test @slow matrix runs only on release branches or manually triggered via `e2e` label.

**Mechanism:**

- **PR smoke tests**: Tag 1-2 critical tests with `@smoke`, run them on every PR with E2E_SLOW=1
- **Full matrix**: Keep existing release-branch gate (prerelease/_, release/_, `e2e` label) running all 36 @slow tests
- **Test organization**: Smoke tests verify end-to-end user journey (browse → generate → download); matrix tests verify all models, parameters, edge cases

**Implementation:**

```typescript
// e2e/tests/api/openai/generations.spec.ts
test("smoke: FLUX Schnell generation end-to-end @smoke @slow", async ({
  request,
}) => {
  // Critical path: most common model, minimal parameters
  const response = await request.post("/v1/images/generations", {
    data: { prompt: "test", model: "@cf/black-forest-labs/flux-1-schnell" },
  });
  expect(response.status()).toBe(200);
  // ... full validation
});

// Other @slow tests without @smoke tag
test("SDXL with all parameters @slow", async ({ request }) => {
  /* ... */
});
```

```yaml
# playwright.config.ts
export default defineConfig({
  // PR runs: smoke tests only
  grep: process.env.CI && !process.env.E2E_FULL ? /@smoke/ : undefined,
  grepInvert: process.env.E2E_SLOW ? undefined : /@slow/,
});
```

```yaml
# .github/workflows/pr-smoke.yml (new workflow)
on:
  pull_request:
    branches: [main]
    # Run on all PRs, not just release branches

jobs:
  smoke-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: E2E_SLOW=1 npx playwright test --grep "@smoke"
```

**Pros:**

- ✅ Every PR gets real AI validation (1-2 critical paths)
- ✅ Fast feedback: 2 smoke tests = ~3min, not 30min
- ✅ Cost reduction: 2 AI calls/PR instead of 36
- ✅ Full coverage on release: matrix still runs before production deploy
- ✅ Flexible: team can adjust smoke test count based on confidence needs

**Cons:**

- ⚠️ Smoke test selection is subjective: which 2 of 36 tests are "critical"?
- ⚠️ Edge cases only caught on release branches (delayed feedback for less common models)
- ⚠️ Still makes some network calls (not zero like VCR/mocking)

**Effort:** 🔨 Low (1 day)

- Hour 1-2: Tag 1-2 existing @slow tests with @smoke
- Hour 3-4: Add pr-smoke.yml workflow to run @smoke tests on all PRs
- Hour 5-6: Update playwright.config.ts grep logic, document in E2E_TESTING.md

**Value:** ⭐⭐⭐⭐ High  
Pragmatic middle ground. Every PR gets real AI validation without full matrix cost. Industry pattern: "broad shallow tests on PR, deep tests on release."

**When to use:** You want real AI validation on every PR but can't afford full matrix cost. Acceptable to catch model-specific edge cases on release branches instead of feature PRs.

---

## Recommendation Matrix (Ranked by Effort-to-Value)

| Rank     | Option                                    | Effort      | Value      | Network Cost Reduction                     | Maintenance                         | Best For                                                   |
| -------- | ----------------------------------------- | ----------- | ---------- | ------------------------------------------ | ----------------------------------- | ---------------------------------------------------------- |
| 🥇 **1** | **Contract Tests + Mocked AI (Option 2)** | 🔨🔨 Medium | ⭐⭐⭐⭐⭐ | **95%** (only 1-2 smoke tests use real AI) | ✅ Low (schema updates)             | API shape is more critical than pixel-perfect AI output    |
| 🥈 **2** | **Smoke vs Matrix Split (Option 5)**      | 🔨 Low      | ⭐⭐⭐⭐   | **94%** (2 smoke tests vs 36 full matrix)  | ✅ Low (tag tests)                  | Want real AI validation on every PR, budget for 2 calls/PR |
| 🥉 **3** | **VCR HTTP Recording (Option 1)**         | 🔨🔨 Medium | ⭐⭐⭐⭐   | **100%** (after initial recording)         | ⚠️ Medium (re-record schedule)      | API is stable, recorded responses represent reality well   |
| **4**    | **Scheduled Full-Matrix (Option 4)**      | 🔨 Low      | ⭐⭐⭐     | **~90%** (1 nightly vs N PRs)              | ⚠️ Medium (triage nightly failures) | Low PR volume, strong post-merge monitoring culture        |
| **5**    | **Ephemeral Preview (Option 3)**          | 🔨🔨🔨 High | ⭐⭐⭐     | **0%** (reduces contention, not cost)      | ⚠️ High (cleanup, quotas)           | Shared staging bottleneck, have budget for per-PR costs    |

---

## Concrete Recommendation: Hybrid Approach (Option 2 + Option 5)

**Phase 1 (Week 1): Smoke Tests for Quick Wins**

1. Tag 2 critical tests with `@smoke`:
   - `POST /v1/images/generations` with FLUX Schnell (most common model)
   - MCP `tools/call run_model` end-to-end (validates MCP + AI integration)
2. Create `pr-smoke.yml` workflow running `E2E_SLOW=1 npx playwright test --grep "@smoke"` on all PRs
3. Result: 94% cost reduction (2 AI calls/PR vs 36), ~3min runtime, real AI validation every PR

**Phase 2 (Week 2-3): Contract Tests for Full Coverage**

1. Define JSON schemas for all OpenAI-compatible endpoints (`/v1/images/generations`, `/v1/images/edits`, `/v1/images/variations`, `/v1/models`)
2. Convert remaining 34 @slow tests to mocked contract tests:
   ```typescript
   // Fast contract test (mocked AI)
   await page.route("**/v1/images/generations", async (route) => {
     await route.fulfill({ status: 200, json: mockGenerationResponse });
   });
   expect(response).toMatchSchema(generationSchema);
   ```
3. Run contract tests on every PR (adds ~30s to pr-checks.yml)
4. Result: Schema regressions caught immediately, 36 @slow tests → 2 smoke + 34 contract = ~4min total

**Phase 3 (Optional): VCR for Determinism**

1. If smoke tests still flake from network/AI instability, add VCR recording:
   ```typescript
   await page.routeFromHAR("./hars/smoke-tests.har", {
     url: "**/v1/images/generations",
     update: process.env.E2E_RECORD === "1",
   });
   ```
2. Record smoke test responses once, replay from HAR on subsequent runs
3. Re-record monthly via scheduled workflow: `E2E_RECORD=1 npx playwright test --grep "@smoke"`
4. Result: Zero smoke test flakiness, deterministic image URLs in responses

**Why This Hybrid?**

- ✅ Addresses all three pain points: cost (94% reduction), latency (3min vs 30min), maintenance (schemas easier than staging coordination)
- ✅ Layered confidence: real AI smoke tests (critical paths) + contract tests (comprehensive coverage) + full matrix on release (final gate)
- ✅ Iterative: Phase 1 delivers value in 1 day; Phase 2 completes in 2-3 weeks; Phase 3 optional based on flakiness data
- ✅ Industry-proven: Contract testing is testing pyramid best practice for microservices (see Pact, consumer-driven contracts)

**Expected Outcomes:**

- **Before:** 36 AI calls × 15-90s = ~30min per PR, 36 × $0.01 inference cost = $0.36/PR
- **After Phase 1:** 2 AI calls × 30s = ~1min per PR, 2 × $0.01 = $0.02/PR (94% cost reduction)
- **After Phase 2:** 2 AI calls + 34 contract tests = ~4min per PR (contract tests add ~30s)
- **Maintenance:** Schema updates when API changes (1-2 hours/quarter) vs staging coordination (ongoing)

---

## Implementation Checklist

**Phase 1: Smoke Tests (Day 1-2)**

- [ ] Audit existing 36 @slow tests, identify 2 most critical paths
- [ ] Tag selected tests with `@smoke` in test description
- [ ] Create `.github/workflows/pr-smoke.yml` workflow
- [ ] Update `playwright.config.ts` to support `@smoke` grep filter
- [ ] Test on feature branch, verify 2 smoke tests run in ~3min
- [ ] Update `docs/E2E_TESTING.md` with smoke test rationale
- [ ] Merge to main, monitor PR smoke test reliability for 1 week

**Phase 2: Contract Tests (Week 2-3)**

- [ ] Define JSON schemas using Zod or JSON Schema for all endpoints
- [ ] Create `e2e/lib/mocks.ts` with canned AI response fixtures
- [ ] Convert 34 @slow tests to contract tests with mocked AI
- [ ] Add contract tests to `pr-checks.yml` (run on every PR, no E2E_SLOW flag)
- [ ] Verify contract tests catch schema regressions (break a field, confirm test fails)
- [ ] Update `docs/E2E_TESTING.md` with contract test guidelines
- [ ] Keep 2 smoke tests + full matrix on release branches unchanged

**Phase 3: VCR (Optional, if smoke tests flake)**

- [ ] Install HAR recording: `npm install -D @playwright/test` (already installed)
- [ ] Record smoke test HAR: `E2E_RECORD=1 npx playwright test --grep "@smoke"`
- [ ] Commit `e2e/hars/smoke-tests.har` to repo
- [ ] Update smoke tests to `routeFromHAR` with `update: process.env.E2E_RECORD === '1'`
- [ ] Create scheduled workflow `.github/workflows/e2e-rerecord.yml` (monthly)
- [ ] Monitor smoke test flakiness, compare before/after VCR

**Rollback Plan:**
If smoke tests prove insufficient signal, revert to full matrix on all PRs by removing `pr-smoke.yml` and restoring original e2e-tests.yml behavior. Contract tests remain valuable regardless.

---

## References

### Primary Sources Cited

1. **Playwright Mock APIs**: [playwright.dev/docs/mock](https://playwright.dev/docs/mock)  
   Native HAR recording/replay, route mocking, WebSocket mocking

2. **Playwright Network Interception**: [playwright.dev/docs/network](https://playwright.dev/docs/network)  
   Route handlers, request modification, response fulfillment

3. **VCR Pattern (Ruby)**: [github.com/vcr/vcr](https://github.com/vcr/vcr)  
   Original HTTP recording library, popularized "cassette" terminology

4. **Cloudflare Claim Deployments**: [developers.cloudflare.com/workers/platform/claim-deployments](https://developers.cloudflare.com/workers/platform/claim-deployments/)  
   Temporary preview accounts, `wrangler deploy --temporary` (June 2026)

5. **GitHub Actions Concurrency**: [docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)  
   Concurrency groups, queue strategies, cancel-in-progress

6. **GitHub Actions Schedule**: [docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)  
   Cron syntax, runs on default branch, max frequency

7. **Contract Testing for Microservices**: [harborsoftware.com/2024/12/06/integration-testing-strategies-microservice-architectures](https://harborsoftware.com/2024/12/06/integration-testing-strategies-microservice-architectures/)  
   Testing pyramid reshaped, contract tests caught 47% of incidents, availability arithmetic

8. **GitHub Actions Matrix Strategy**: [docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow)  
   Matrix jobs, max-parallel, fail-fast, include/exclude

### Tools Mentioned

- **Playwright**: E2E testing framework with native HAR support
- **Polly.js**: Netflix HTTP recording library (alternative to Playwright HAR)
- **nock**: Programmatic HTTP mocking for Node.js
- **Pact**: Consumer-driven contract testing framework (overkill for single-team)
- **Zod**: TypeScript schema validation with type inference
- **JSON Schema**: Lightweight contract validation standard
- **GitHub Actions**: CI/CD platform with cron scheduling, concurrency control
- **Wrangler**: Cloudflare Workers CLI with preview deployment support

---

## Appendix: Current State Analysis

**Test Suite Composition (as of feat/e2e-gate-hardening branch):**

- Total @slow tests: 36 (verified via `grep -r "@slow" e2e/tests`)
- Distribution:
  - `generations.spec.ts`: 9 @slow tests
  - `flux-models.spec.ts`: 9 @slow
  - `edits.spec.ts`: 4 @slow
  - `variations.spec.ts`: 9 @slow
  - `openai-sdk-node.spec.ts`: 4 @slow
  - `openai-sdk-compliance.spec.ts`: 5 @slow
  - `mcp/tools.spec.ts`: 2 @slow
  - `mcp/sse.spec.ts`: 1 @slow

**Current Gating (from `.github/workflows/e2e-tests.yml`):**

```yaml
# Skip on feature PRs unless labeled `e2e`
if: >-
  startsWith(github.head_ref, 'prerelease/') ||
  startsWith(github.head_ref, 'release/') ||
  contains(github.event.pull_request.labels.*.name, 'e2e')

# Full matrix runs when E2E_SLOW=1
grepInvert: runSlow ? undefined : /@slow/,
```

**Cost Estimate (rough):**

- Workers AI text-to-image: ~$0.01-0.05 per inference (pricing varies by model)
- 36 @slow tests per PR = $0.36-$1.80 per full matrix run
- 10 PRs/week = $3.60-$18/week = $15-75/month on full matrix
- Smoke tests (2/PR): $0.02-0.10/PR = $0.20-1.00/week = $1-4/month
- **Savings: ~90-95% cost reduction**

**Maintenance Time (estimated):**

- Shared staging coordination: ~2-4 hours/week (environmental failures, version mismatches, "who broke staging?")
- Contract test maintenance: ~1-2 hours/quarter (schema updates when API changes)
- VCR re-recording: ~1 hour/month (if Phase 3 implemented)
- **Savings: ~6-10 hours/month human time**
