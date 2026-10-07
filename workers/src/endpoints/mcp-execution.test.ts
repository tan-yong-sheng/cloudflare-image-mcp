// ============================================================================
// MCP run_model execution contract tests - real generator, stubbed inference
// ============================================================================
// Seam: same outbound `api.cloudflare.com/.../ai/run/...` fetch stub as the
// OpenAI contract suite. Complements mcp-tools.test.ts (validation branches
// with a throwing stub generator): here the generator is REAL, so these
// tests prove execution -> markdown shaping end to end. Expected markdown
// shapes come from the live E2E matrix (e2e/tests/api/mcp/tools.spec.ts).

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  handleRunModel,
  type ToolsContext,
} from "./mcp-tools.js";
import { ImageGeneratorService } from "../services/image-generator.js";
import {
  fakeEnv,
  jsonEnvelopeImage,
} from "../test-utils/fixtures.js";

const SCHNELL = "@cf/black-forest-labs/flux-1-schnell";
const BASE_URL = "https://worker.test";

afterEach(() => {
  vi.unstubAllGlobals();
});

function liveContext(): ToolsContext {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(jsonEnvelopeImage(), {
        headers: { "Content-Type": "application/json" },
      })
    )
  );
  return {
    generator: new ImageGeneratorService(
      fakeEnv()
    ) as unknown as ToolsContext["generator"],
    baseUrl: BASE_URL,
  };
}

describe("handleRunModel execution: generations", () => {
  test("run_model generations returns markdown image with /images/ url", async () => {
    const result = await handleRunModel(
      liveContext(),
      {
        taskType: "generations",
        prompt: "A bright red apple on a wooden table",
        model_id: SCHNELL,
        n: 1,
      },
      null
    );

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain("![");
    const urlMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/);
    expect(urlMatch).not.toBeNull();
    const url = urlMatch![1];
    const path = url.startsWith("http") ? new URL(url).pathname : url;
    expect(path).toMatch(/^\/images\//);
  });

  test("run_model generations n=2 returns two markdown images", async () => {
    const result = await handleRunModel(
      liveContext(),
      {
        taskType: "generations",
        prompt: "A blue sky with clouds",
        model_id: SCHNELL,
        n: 2,
      },
      null
    );

    expect(result.isError).toBeFalsy();
    const matches = result.content[0].text.match(/!\[.*?\]\(.*?\)/g);
    expect(matches).not.toBeNull();
    expect(matches!).toHaveLength(2);
  });
});
