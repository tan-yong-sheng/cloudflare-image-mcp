# Reducing E2E maintenance and image-generation network calls in CI

**Status:** Research / proposal
**Date:** 2026-10-07
**Branch:** `feat/e2e-gate-hardening`
**Repo:** `tan-yong-sheng/cloudflare-image-mcp` (public)
**Scope:** How to gate image-generation behavior in CI with minimal real Workers AI inference and minimal human maintenance. Companion to issues #10 (honest + safe gate) and #11 (trim the full-matrix content, measurement-driven).

All factual claims are cited inline. Where a claim is an estimate or an inference from the repo, it is labelled.

---

## 1. Problem

The E2E suite is a Playwright API suite that runs against a **deployed** Worker (staging or production); it needs a live backend (`TEST_BASE_URL` + `/health`). See `docs/E2E_TESTING.md`.

Current shape (verified in this worktree):

| Fact                                                                                                                              | Evidence                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Fast PR gate exists and is network-free (`tsc`, prettier, unit tests)                                                             | `.github/workflows/pr-checks.yml`                                            |
| The live E2E matrix runs only on release-integration PRs (`prerelease/*`, `release/*`) to `main`, on the `e2e` label, or manually | `.github/workflows/e2e-tests.yml` (`on.pull_request`, job `if:` guards)      |
| A release-gated PR deploys a **shared** staging Worker, runs E2E, then deletes it                                                 | `e2e-tests.yml` jobs `deploy_staging`, `e2e-tests`, `cleanup-staging`        |
| The shared staging Worker is serialized by one repo-wide concurrency group                                                        | `e2e-tests.yml` `concurrency: { group: e2e-staging-worker, queue: max }`     |
| **36** tests are tagged `@slow` and make real Workers AI calls                                                                    | `grep -c "@slow" e2e/tests/**/*.spec.ts`                                     |
| `@slow` is skipped unless `E2E_SLOW=1`; the release gate always sets `E2E_SLOW=1`                                                 | `e2e/playwright.config.ts` (`grepInvert`), `e2e-tests.yml` ("Run E2E tests") |
| Full matrix is `workers: 1`, `retries: 2` on CI, `timeout: 180000`                                                                | `e2e/playwright.config.ts`                                                   |
| Full-matrix budget is 30 min                                                                                                      | `e2e-tests.yml` job `timeout-minutes: 30`; user context (~30 min)            |
| 12 image models are configured                                                                                                    | `workers/src/config/models.json`                                             |

Two distinct costs are conflated in the current gate:

1. **Inference cost / provider dependency.** `@slow` tests exercise `POST /v1/images/{generations,edits,variations}` and the MCP `run_model` tool, which the Worker forwards to `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{modelId}` (`workers/src/services/image-generator.ts:154`). Workers AI has a free allocation of **10,000 neurons/day** and costs **$0.011 / 1,000 neurons** beyond it ([Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)). Example image prices on that page: `@cf/black-forest-labs/flux-1-schnell` **$0.0000528 per 512x512 tile**, `flux-2-dev` **$0.00021/image**, `flux-2-klein-9b` **$0.015 / first MP**. Dollar cost per full matrix is small (single-digit cents to low cents), but the wall-clock cost and flakiness are not: 36 tests × up to real inference, serialized, with 2 retries.
2. **Human maintenance.** A globally serialized shared staging Worker, a deploy/cleanup pair per gated run, and a `queue: max` tuning knob that must not silently drop a release gate (`e2e-tests.yml` comments; issue #10).

The user's goal: **(a)** minimize real image-generation network requests in CI while still gating what is necessary, **(b)** pick mechanisms that minimize human maintenance, **(c)** get a ranked, effort-to-value recommendation.

---

## 2. What actually needs to be gated

Not all `@slow` assertions need a live model. They cluster into three classes:

- **Shape / contract** (OpenAI response schema, `url` vs `b64_json`, `n` capping, CORS headers, SDK compliance, MCP tool result shape). These need _a_ valid image response, not a _fresh_ one from a real model. See `generations.spec.ts`, `openai-sdk-compliance.spec.ts`, `variations.spec.ts`, `edits.spec.ts`.
- **Provider availability / model drift** (does a given model ID still return a decodable image; did a model get retired or change output format). This is the only class that genuinely needs real inference.
- **Plumbing across the real deployment** (auth to the deployed Worker, R2 upload/serve round-trip, MCP transport over the deployed Worker). Needs the deployed Worker, but only a **single** real image.

The current matrix spends the expensive class-C budget (real inference) on class-A assertions. That is the main lever.

A useful secondary check on cost: the Worker exposes an image proxy at `/images/...` backed by R2 (`workers/src/services/r2-storage.ts`, `IMAGE_BUCKET` R2 binding). Shape tests can be served by **one** generated image reused across assertions instead of one inference per assertion.

---

## 3. Options

Effort scale: **S** < 0.5 dev-day, **M** 0.5–2 days, **L** > 2 days.

### Option A — Finish the smoke-vs-matrix split; move the exhaustive live matrix off per-PR

**What.** Keep a tiny `@smoke` live canary (one real generation per surface: generations-URL, generations-b64, edits, variations, MCP `run_model`) in the release gate, and run the full `@slow` matrix on a **schedule** and on **manual dispatch** rather than on every release PR push.

**Evidence.**

- Playwright tags and `--grep/--grep-invert` (and config `grep`/`grepInvert`) are the supported filtering mechanism; `test.slow()` triples the timeout ([Annotations](https://playwright.dev/docs/test-annotations)). The repo already uses `@slow` + `grepInvert`.
- GitHub `schedule` runs on the **default branch only**, and in a **public repository scheduled workflows are automatically disabled after 60 days of no repository activity** ([Events that trigger workflows — `schedule`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)). `workflow_dispatch` allows an on-demand run against any branch/tag ([`workflow_dispatch`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)).

**Pros.** Lowest effort of the changes; near-zero per-PR inference; schedule catches provider/model drift on `main`; manual dispatch preserves an escape hatch.
**Cons.** A scheduled job tests the **default branch**, not the release branch — it is a _regression monitor_, not a merge gate. So it cannot fully replace the live signal for a release PR; you still need a (small) live canary in the gate. The 60-day auto-disable is a silent-failure trap for a low-activity public repo.
**Effort:** S. **Value:** High.

### Option B — Contract tests with recorded/mocked AI responses at the Worker boundary

**What.** Migrate the Worker test suite to the Cloudflare Workers Vitest integration and intercept the **outbound** `api.cloudflare.com/.../ai/run/...` request with MSW, returning a recorded, valid image response. Assert the full Worker path (param parsing → AI call → R2 upload → `/images/` serve → OpenAI/MCP response shaping) with **no real inference and no network**.

**Evidence.**

- The Workers Vitest integration exports `exports.default.fetch()` and notes "The main Worker runs in the same isolate/context as tests so any global mocks will apply to it too" ([Test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)). So the whole `worker.fetch()` handler can be driven in-process.
- Outbound HTTP mocking is supported via MSW: `@msw/cloudflare` + `network.use(http.get(...))`; the integration supports both unit tests calling the handler and integration tests calling `exports.default.fetch()` ([Mock outbound requests](https://developers.cloudflare.com/workers/testing/vitest-integration/mock-outbound-requests/)).
- R2 is a native binding (`IMAGE_BUCKET`); the Workers Vitest/Miniflare runtime simulates it locally, so the R2 round-trip is real without touching Cloudflare.
- Prerequisite: `@cloudflare/vitest-plugin` requires **Vitest 4.1+** ([Write your first test](https://developers.cloudflare.com/workers/testing/vitest-integration/get-started/)); the repo pins `vitest@^3.2.7` (`workers/package.json`) and currently runs plain `vitest run` with no pool plugin. There is no `workers/vitest.config.ts`.

**Pros.** Deterministic, fast, free; covers the **majority** of `@slow` class-A assertions; recordings are committed artifacts (VCR-style) that fail loudly if the Worker's response contract changes; eliminates most `@slow` tests entirely.
**Cons.** One-time migration (Vitest 4 bump + `vitest.config.ts` + `@msw/cloudflare` + recorded fixtures). A mock can drift from the real provider; it proves the Worker, not Workers AI.
**Effort:** M. **Value:** High.

### Option C — VCR / HAR replay in Playwright itself

**What.** Record real responses once (Playwright HAR) and replay them in the E2E suite.

**Evidence / why it does not fit today.**

- Playwright's HAR replay is `page.routeFromHAR()` / `browserContext.routeFromHAR()`, with `update: true` to record ([Mock APIs](https://playwright.dev/docs/mock)). Those methods exist on **Page** and **BrowserContext** ([`Page.routeFromHAR`](https://playwright.dev/docs/api/class-page#page-route-from-har), [`BrowserContext.routeFromHAR`](https://playwright.dev/docs/api/class-browsercontext#browser-context-route-from-har)).
- The current suite is API-only and uses the **`request` fixture** (an `APIRequestContext`). `APIRequestContext` exposes `addCookies`, `clearCookies`, `cookies`, `createFormData`, `delete`, `dispose`, `fetch`, `get`, `head`, `patch`, `post`, `put`, `storageState` — **no `route` and no `routeFromHAR`** ([`APIRequestContext`](https://playwright.dev/docs/api/class-apirequestcontext)). Playwright's own wording scopes mocking to "Any requests that a page does" ([Mock APIs](https://playwright.dev/docs/mock)).
- Therefore HAR replay would require rewriting the API tests to drive traffic through a browser context/page — a poor fit for an API contract suite, and it would still need a deployed Worker for everything HAR does not cover.

**Pros.** Genuinely zero inference if adopted, no Worker-level test infra.
**Cons.** Wrong layer for this suite (requires browser-context plumbing); larger rewrite than Option B; recordings go stale against provider drift just like B. **Effort:** M–L. **Value:** Low/Medium (only worthwhile if browser/UI tests are added later).

### Option D — Ephemeral per-branch deployments instead of one shared staging Worker

**What.** Replace the shared `cloudflare-image-workers-staging` Worker + global serialization with a **per-PR/per-branch** environment, so gated runs no longer contend for one resource and cleanup is per-branch.

**Evidence.**

- Cloudflare **Previews**: "Running `npx wrangler preview` creates or updates a Preview for your current branch under the same Worker," each with its own variables, secrets, bindings, and URL; there is a documented "delete closed pull request Previews" example (`npx wrangler preview delete --name`). Requires **Wrangler 4.135.0+**; limits are 100 Previews/Worker (Free) and 500 (Paid) ([Previews](https://developers.cloudflare.com/workers/previews/)).
- Cloudflare **Version URLs** (formerly preview URLs): `wrangler versions upload` returns a `--preview-alias` URL, e.g. `staging-<worker>.<subdomain>.workers.dev`; notes these are **not** generated for Workers with Durable Objects ([Version URLs](https://developers.cloudflare.com/workers/configuration/previews/)). This Worker has no Durable Objects, so it qualifies.
- GitHub concurrency semantics confirm the current design's cost: a group allows one running workflow, `queue: max` allows up to 100 `pending`, processed FIFO, and `queue: max` + `cancel-in-progress: true` is rejected ([Using concurrency](https://docs.github.com/en/actions/using-jobs/using-concurrency)). Every gated run therefore waits behind the shared Worker.

**Pros.** Removes the shared-resource race class (issue #10) and the queue-tuning maintenance; per-branch isolation surfaces branch-specific failures; cleanup is per-PR rather than a global delete.
**Cons.** The repo generates `workers/wrangler.toml` at deploy time from secrets and deletes it (`AGENTS.md`; `deploy-workers.yml`), so a `previews` block and pinned `wrangler@4.135.0+` (repo pins `4.60.0`, `workers/package.json`) must be added to that generated config. More Cloudflare objects to manage; still runs real inference unless combined with A/B.
**Effort:** M. **Value:** Medium–High (mainly a maintenance reduction; inference reduction comes from A/B).

### Option E — AI Gateway response caching for canary prompts

**What.** Route the canary's inference through Cloudflare AI Gateway with caching enabled, and use fixed prompts/params so repeat runs are cache HITs.

**Evidence.** AI Gateway caching serves identical requests from cache; "caching is supported only for text and image responses, and it applies only to identical requests." The cache key is SHA-256 of provider + endpoint + model + **provider auth header** + **full request body**; `cf-aig-cache-status: HIT|MISS` reports cache state ([AI Gateway — Caching](https://developers.cloudflare.com/ai-gateway/features/caching/)).

**Pros.** Near-zero inference cost/latency for repeat runs of a fixed-prompt canary; no test rewrite.
**Cons.** Adds a gateway resource and changes the inference URL; a cache HIT can **mask a live provider outage**, which is exactly what the canary exists to detect; the varied prompts in today's matrix would mostly MISS anyway. **Effort:** M. **Value:** Low–Medium (a cost lever, not a correctness lever).

### Option F — Merge queue (`merge_group`) as the gate trigger

**What.** Trigger the live gate on `merge_group` rather than on `prerelease/*`/`release/*` branch prefixes.

**Evidence.** A merge queue runs required checks on the PR applied to the latest target branch plus queued PRs; workflows must add `merge_group` to `on:` or required checks will not be reported and the merge fails; unavailable with wildcard branch-protection patterns ([Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)).

**Pros.** Stronger, branch-model-independent correctness signal ("tests the merged result"); removes the custom branch-prefix gate and the sentinel's prefix matching.
**Cons.** Changes the repo's branching/release model and branch protection; couples the gate to GitHub merge-queue availability; orthogonal to inference reduction. **Effort:** M. **Value:** Medium (gating honesty), out of scope for cost reduction.

### Option G — Shrink the `@slow` set itself

**What.** Deduplicate to **one real call per surface/model**, and share a single generated image via a Playwright fixture for all shape assertions instead of regenerating per test.

**Evidence / repo facts.** 36 `@slow` tests map onto a handful of distinct behaviors; several request `n: 2` (`generations.spec.ts` "all parameters"), `n: 10` (capped at 8, "respects n parameter limit"), and "generate multiple images". Each distinct model in `flux-models.spec.ts` needs its own real call to prove that model still works, but the OpenAI **shape** is model-independent and can be asserted once. Playwright fixtures/global setup support one-time setup reuse — the repo already has `e2e/global-setup.ts`, which today only checks `/health`.

**Pros.** Directly cuts inference count; no new infrastructure; composes with A and B.
**Cons.** Requires care not to lose coverage; the `n`/multi-image tests specifically exercise caps, so keep one of each.
**Effort:** S. **Value:** High.

---

## 4. Recommended target architecture

Three tiers, each with a single responsibility:

1. **Per-PR, no network (blocking, seconds).** `pr-checks.yml` (typecheck, format, unit) **plus** Option B's Worker-level mocked contract tests. This absorbs the class-A `@slow` shape assertions (`/v1/images/*`, OpenAI SDK compliance, MCP tool result shape).
2. **Release gate, one ephemeral deployment, tiny live canary (blocking, minutes).** Deploy the PR branch to a **per-branch Preview / Version URL** (Option D) and run ~5 `@smoke` real calls (Option G) behind a fixed prompt set. This is the only place that proves "Workers AI + this deployment actually produce an image".
3. **Scheduled + manual, full live matrix (non-blocking).** Nightly `schedule` on `main` (Option A) runs the full `@slow` matrix against staging as a **regression/availability monitor**, with `workflow_dispatch` for on-demand deep runs. Document the 60-day auto-disable and keep a low-cost heartbeat (or accept the re-enable).

Flow:

```
feature PR ──► pr-checks.yml (typecheck/unit)  +  worker contract tests (mocked AI, no network)
release PR ──► ephemeral Preview deploy ──► @smoke live canary (~5 real calls)  ──► sentinel gate
nightly    ──► full @slow matrix vs staging  (monitor, non-blocking, on main)
manual     ──► workflow_dispatch: full matrix / pattern / custom URL
```

Why this shape: the merge gate keeps a _real_ signal tied to the exact branch being merged (a scheduled job cannot do that — it runs on the default branch), while almost all inference and flakiness move to deterministic layers or to a non-blocking schedule.

---

## 5. Ranked recommendation (effort → value)

| Rank  | Action                                                                                                                                                                                         | Effort  | Value        | Main effect                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------ | -------------------------------------------------------------------------------------------- |
| **1** | **Option G + A:** dedupe `@slow` to one live call per surface/model, add `@smoke`, move the exhaustive matrix to `schedule` + `workflow_dispatch`, keep a tiny live canary in the release gate | **S**   | **High**     | Largest inference cut for least change; no new infra                                         |
| **2** | **Option B:** Worker-level contract tests with recorded AI responses (Cloudflare Vitest integration + MSW `fetch` mock)                                                                        | **M**   | **High**     | Moves most assertions to deterministic/free/fast; removes a whole tier of network dependence |
| **3** | **Option D:** per-branch ephemeral Previews/Version URLs instead of shared staging + global serialization                                                                                      | **M**   | **Med–High** | Deletes the race + queue-tuning + shared-cleanup maintenance class                           |
| **4** | **Option F:** merge queue (`merge_group`) as the gate trigger                                                                                                                                  | **M**   | **Medium**   | Cleaner, model-independent gating; not a cost lever                                          |
| **5** | **Option E:** AI Gateway caching with fixed canary prompts                                                                                                                                     | **M**   | **Low–Med**  | Cost/latency lever; can mask provider outages                                                |
| **6** | **Option C:** Playwright HAR/VCR replay                                                                                                                                                        | **M–L** | **Low**      | Wrong layer for an `APIRequestContext` suite; revisit only if UI tests appear                |

Suggested sequencing: do **1** immediately (it is bounded to test tags/config plus a small `global-setup` fixture). Then **2** as the durable structural fix. Treat **3** as the follow-up to #10's serialization, and **4–6** as optional/on-demand.

---

## 6. Human-maintenance assessment

- **Option 1** adds one scheduled workflow and one `@smoke` tag; the only recurring human task is knowing that public-repo schedules auto-disable after 60 days of inactivity ([GitHub `schedule`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)).
- **Option 2** trades "re-run flaky live tests" toil for "update a committed recording when the response contract intentionally changes" — a single, deterministic artifact.
- **Option 3** removes the `queue: max` tuning and the shared staging deploy/cleanup coupling, at the cost of managing Preview objects (auto-evicted at 100/500 limits, [Previews](https://developers.cloudflare.com/workers/previews/)) and pinning a newer Wrangler.
- **Option 5** adds a gateway to operate and can hide outages; keep it out of the canary path if used at all.

---

## 7. Risks, gaps, and unverified items

- **Dollar cost is small; wall-clock/flake is the real cost.** The recommendation optimizes for determinism and review latency, not for a large bill. If the intent is strictly dollars, Option E dominates; if the intent is CI wall-clock and maintenance, Options 1–3 dominate.
- **Scheduled coverage ≠ branch coverage.** A `schedule` job cannot gate a release branch; do not remove the live canary from the release gate.
- **Option B migration cost is real.** It requires Vitest 4.1+ and a `vitest.config.ts` that does not exist yet; the repo currently runs plain `vitest run` (`workers/package.json`). The R2 binding is simulated by the Workers/Miniflare runtime, so the R2 round-trip can be tested without Cloudflare — but this was reasoned from the binding usage in `workers/src/services/r2-storage.ts`, not yet executed.
- **`@aws-sdk/client-s3` appears in `workers/package.json` but is imported nowhere in `workers/src`** (grep returned no imports). Unverified whether it is dead weight or used indirectly; flagged as an adjacent observation only.
- **No measurement yet of the actual per-run inference count or neuron spend.** Issue #11 is explicitly blocked on measured gate timings; this document deliberately does not assume numbers beyond the verified test count (36 `@slow`).
- **Nothing here was executed end-to-end.** No workflow, Cloudflare Preview, Vitest-pool test, or scheduled run was created or run in this task; all evidence is primary-source documentation plus static inspection of the current worktree.

---

## 8. Sources

Playwright:

- Mock APIs (route/fulfill, HAR record + replay, strict URL/method/payload matching): https://playwright.dev/docs/mock
- Annotations (tags, `--grep`/`--grep-invert`, `test.slow()`): https://playwright.dev/docs/test-annotations
- `APIRequestContext` (method list; no `route`/`routeFromHAR`): https://playwright.dev/docs/api/class-apirequestcontext
- `Page.routeFromHAR`: https://playwright.dev/docs/api/class-page#page-route-from-har
- `BrowserContext.routeFromHAR`: https://playwright.dev/docs/api/class-browsercontext#browser-context-route-from-har

Cloudflare:

- Workers AI pricing (10,000 neurons/day free, $0.011/1k neurons, per-image model prices): https://developers.cloudflare.com/workers-ai/platform/pricing/
- Workers Previews (per-branch isolation, `wrangler preview`, Wrangler 4.135.0+, limits, PR cleanup): https://developers.cloudflare.com/workers/previews/
- Version URLs / preview aliases (`wrangler versions upload`, `--preview-alias`, no-DO caveat): https://developers.cloudflare.com/workers/configuration/previews/
- Workers Vitest integration — Test APIs (`exports.default.fetch()`, global mocks apply): https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/
- Workers Vitest integration — Mock outbound requests (MSW `@msw/cloudflare`): https://developers.cloudflare.com/workers/testing/vitest-integration/mock-outbound-requests/
- Workers Vitest integration — Write your first test (`@cloudflare/vitest-plugin`, Vitest 4.1+): https://developers.cloudflare.com/workers/testing/vitest-integration/get-started/
- AI Gateway caching (identical requests only; cache key; `cf-aig-cache-status`): https://developers.cloudflare.com/ai-gateway/features/caching/

GitHub Actions:

- Events that trigger workflows (`schedule` default-branch-only, 60-day inactivity disable; `workflow_dispatch` inputs): https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Control concurrency (`queue: single|max`, FIFO, `cancel-in-progress` rule): https://docs.github.com/en/actions/using-jobs/using-concurrency
- Reuse workflows (`workflow_call`, secrets/environment limits): https://docs.github.com/en/actions/using-workflows/reusing-workflows
- Managing environments for deployment (protection rules, environment secrets): https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment
- Managing a merge queue (`merge_group` requirement): https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue

Repository (this worktree):

- `docs/E2E_TESTING.md`, `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/tests/**`
- `.github/workflows/pr-checks.yml`, `.github/workflows/e2e-tests.yml`, `.github/workflows/deploy-workers.yml`
- `workers/package.json`, `workers/src/config/models.json`, `workers/src/services/image-generator.ts`, `workers/src/services/r2-storage.ts`
