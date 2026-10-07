// ============================================================================
// Generation transport tests - account failover behavior
// ============================================================================
// Seam: RestAITransport.run with stubbed fetch. Expected values are
// known-good literals; assertions pin the observable failover contract:
// a failing first account retries on the next account before surfacing
// an error, and a lone failing account surfaces the failure.

import { afterEach, describe, expect, test, vi } from "vitest";
import { RestAITransport } from "./generation-adapters.js";
import type { ModelConfig } from "../types.js";

const JSON_MODEL = {
  id: "@cf/test/json-model",
  inputFormat: "json",
} as ModelConfig;

function textResponse(text: string): Response {
  return new Response(text, {
    status: 500,
    headers: { "Content-Type": "text/plain" },
  });
}

function jsonResult(image: string): Response {
  return new Response(JSON.stringify({ result: { image } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RestAITransport account failover", () => {
  test("a failing first account retries on the next account", async () => {
    const transport = new RestAITransport(
      [
        { account_id: "first", api_token: "token-one" },
        { account_id: "second", api_token: "token-two" },
      ],
      "AI_ACCOUNTS"
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse("first down"))
      .mockResolvedValueOnce(jsonResult("aGVsbG8="));
    vi.stubGlobal("fetch", fetchMock);

    const result = (await transport.run(
      JSON_MODEL.id,
      { prompt: "a cat" },
      JSON_MODEL
    )) as { image: string };

    expect(result).toEqual({ image: "aGVsbG8=" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Random start offset decides which account is tried first; the
    // contract is that both accounts are tried exactly once, in some order.
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls).toHaveLength(2);
    expect(calledUrls.some((url) => url.includes("/accounts/first/"))).toBe(
      true
    );
    expect(calledUrls.some((url) => url.includes("/accounts/second/"))).toBe(
      true
    );
  });

  test("all accounts failing surfaces the last error", async () => {
    const transport = new RestAITransport(
      [{ account_id: "only", api_token: "token" }],
      "fallback"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(textResponse("still down"))
    );

    await expect(
      transport.run(JSON_MODEL.id, { prompt: "a cat" }, JSON_MODEL)
    ).rejects.toThrow("Cloudflare AI API error (500)");
  });
});
