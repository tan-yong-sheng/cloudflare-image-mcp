// ============================================================================
// Vitest configuration - plain node pool, zero network
// ============================================================================
// Contract tests (Phase 3, input to #11) stub the Worker's outbound AI
// call with a committed fixture image: no inference, no R2, no deploy.
// Integration tests meaning Workers-runtime bindings (R2, Miniflare)
// belong behind @cloudflare/vitest-pool-workers (Phase 4, not started).

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Fail loudly on any real network: contract tests must stay hermetic.
    // (fetch is stubbed per-test; an unstubbed call surfaces here, not
    // as a silent live inference charge.)
  },
});
