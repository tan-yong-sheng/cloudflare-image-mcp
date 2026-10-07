// ============================================================================
// No-network guard - fail loudly on any unstubbed outbound fetch
// ============================================================================
// Contract tests must stay hermetic: every test stubs global fetch with a
// fixture response (see openai-contract.test.ts, mcp-execution.test.ts).
// This setup file installs a throwing fetch before each test, so a test
// that forgets to stub fails immediately instead of reaching
// api.cloudflare.com for real (dummy creds, but real egress).

import { beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      throw new Error(`Unstubbed fetch in contract test: ${String(input)}`);
    })
  );
});
