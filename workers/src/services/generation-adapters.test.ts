// ============================================================================
// Generation transport tests - account failover behavior
// ============================================================================
// Seam: RestAITransport.run with stubbed fetch. Expected values are
// known-good literals; assertions pin the observable failover contract:
// a failing first account retries on the next account before surfacing
// an error, and a lone failing account surfaces the failure.

import { afterEach, describe, expect, test, vi } from "vitest";
import { RestAITransport } from "./generation-adapters.js";
import { ProviderPool } from "./provider-pool.js";
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

  test("malformed upstream JSON throws plain Error (never SyntaxError)", async () => {
    // A SyntaxError here would be misclassified as malformed caller JSON
    // by the endpoint's handle() catch (400); operational failures must
    // stay plain Errors so they map to 500.
    const transport = new RestAITransport(
      [{ account_id: "only", api_token: "token" }],
      "fallback"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>gateway blew up</html>", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const failure = await transport
      .run(JSON_MODEL.id, { prompt: "a cat" }, JSON_MODEL)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(SyntaxError);
    expect((failure as Error).message).toMatch("unparseable JSON");
  });
});

// Spec-review fix (#72 AC: "Weighted selection + failure cooldown on the
// pool"): pick() and reportFailure() existed but had no production caller —
// traffic used the transport's uniform-random failover with no cross-request
// memory. The pool is now injected into the transport: its weighted pick
// decides the first attempt, and a failed key is reported so the shared,
// isolate-cached pool parks it for later requests.
describe("pool-driven weighted selection + cooldown", () => {
  const ACCOUNTS = [
    { account_id: "heavy-acc", api_token: "t-heavy" },
    { account_id: "light-acc", api_token: "t-light" },
  ];

  function poolWith(random: () => number): ProviderPool {
    return new ProviderPool(
      [
        {
          label: "heavy",
          accountId: "heavy-acc",
          apiToken: "t-heavy",
          weight: 9,
          enabled: true,
        },
        {
          label: "light",
          accountId: "light-acc",
          apiToken: "t-light",
          weight: 1,
          enabled: true,
        },
      ],
      { random, source: "d1" }
    );
  }

  test("the pool's weighted pick decides the first attempt", async () => {
    const transport = new RestAITransport(
      ACCOUNTS,
      "d1",
      poolWith(() => 0.0)
    );
    const fetchMock = vi.fn().mockResolvedValue(jsonResult("aGVsbG8="));
    vi.stubGlobal("fetch", fetchMock);

    await transport.run(JSON_MODEL.id, { prompt: "a cat" }, JSON_MODEL);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/accounts/heavy-acc/"
    );
  });

  test("a failed key is parked so later requests start elsewhere", async () => {
    const pool = poolWith(() => 0.0);
    const transport = new RestAITransport(ACCOUNTS, "d1", pool);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse("heavy down"))
      .mockResolvedValueOnce(jsonResult("aGVsbG8="));
    vi.stubGlobal("fetch", fetchMock);

    // Request 1: heavy first (weight 9, roll 0), fails, light saves it.
    await transport.run(JSON_MODEL.id, { prompt: "a cat" }, JSON_MODEL);
    expect(pool.pick(0)?.label).toBe("light"); // cooldown parked "heavy"

    // Request 2: even with roll 0, the cooled key is no longer first.
    fetchMock.mockResolvedValueOnce(jsonResult("aGVsbG8="));
    await transport.run(JSON_MODEL.id, { prompt: "a cat" }, JSON_MODEL);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[urls.length - 1]).toContain("/accounts/light-acc/");
  });

  test("failure logs carry the key label, never token values", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const transport = new RestAITransport(
        ACCOUNTS,
        "d1",
        poolWith(() => 0.0)
      );
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse("down")));

      await expect(
        transport.run(JSON_MODEL.id, { prompt: "a cat" }, JSON_MODEL)
      ).rejects.toThrow();

      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toContain("heavy");
      expect(said).not.toContain("t-heavy");
      expect(said).not.toContain("heavy-acc");
    } finally {
      warn.mockRestore();
    }
  });
});
