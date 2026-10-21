// ============================================================================
// OpenAI-compatible transport tests - R3-Agnes (#75) provider seam
// ============================================================================
// Seam: OpenAITransport.run plus the mapping/classification helpers it is
// built from. Covers size-tier and aspect-ratio mapping, URL and base64
// image passthrough in both directions, and the retry/cooldown decision
// reused from the credential pool (#72).

import { describe, expect, test, vi } from "vitest";
import {
  AGNES_API_BASE_URL,
  buildAgnesRequestBody,
  classifyOpenAIFailure,
  mapSizeToTier,
  OpenAITransport,
  OpenAITransportError,
  publicImageUrl,
} from "./openai-transport.js";
import { ProviderPool } from "./provider-pool.js";
import { MODEL_CONFIGS } from "../config/models.js";

const MODEL = MODEL_CONFIGS["agnes-image-2.5-flash"];
const BASE_URL = "https://api.agnes.example";

/** Single-key pool, the shape the registry factory always passes. */
function oneKeyPool(apiToken: string): ProviderPool {
  return new ProviderPool(
    [
      {
        label: "a",
        accountId: "acc-a",
        apiToken,
        weight: 1,
        enabled: true,
      },
    ],
    { random: () => 0 }
  );
}

/** Two-key pool with deterministic picks (first live key wins). */
function twoKeyPool(): ProviderPool {
  return new ProviderPool(
    [
      {
        label: "a",
        accountId: "acc-a",
        apiToken: "key-a",
        weight: 1,
        enabled: true,
      },
      {
        label: "b",
        accountId: "acc-b",
        apiToken: "key-b",
        weight: 1,
        enabled: true,
      },
    ],
    { random: () => 0 }
  );
}

describe("mapSizeToTier", () => {
  test.each([
    [1024, 1024, "1K", "1:1"],
    [2048, 2048, "2K", "1:1"],
    [3072, 3072, "3K", "1:1"],
    [4096, 4096, "4K", "1:1"],
    [1312, 736, "1K", "16:9"],
    [736, 1312, "1K", "9:16"],
    [864, 1152, "1K", "3:4"],
    [1152, 864, "1K", "4:3"],
    [1568, 672, "1K", "21:9"],
  ])("%i x %i maps to %s %s", (width, height, size, ratio) => {
    expect(mapSizeToTier(width, height)).toEqual({ size, ratio });
  });

  test("missing or non-positive dimensions fall back to 1K 1:1", () => {
    expect(mapSizeToTier(0, 0)).toEqual({ size: "1K", ratio: "1:1" });
    expect(mapSizeToTier(NaN, NaN)).toEqual({ size: "1K", ratio: "1:1" });
  });
});

describe("classifyOpenAIFailure", () => {
  test.each([
    [401, "retry"],
    [403, "retry"],
    [408, "retry"],
    [429, "retry"],
    [500, "retry"],
    [503, "retry"],
    [400, "terminal"],
    [404, "terminal"],
    [422, "terminal"],
  ])("HTTP %i is %s", (status, kind) => {
    expect(classifyOpenAIFailure(status)).toBe(kind);
  });
});

describe("buildAgnesRequestBody", () => {
  test("text-to-image asks for base64 with tier and ratio from size", () => {
    const body = buildAgnesRequestBody(MODEL, {
      prompt: "a cat",
      size: "2048x2048",
    });
    expect(body.model).toBe("agnes-image-2.5-flash");
    expect(body.prompt).toBe("a cat");
    expect(body.size).toBe("2K");
    expect(body.ratio).toBe("1:1");
    expect(body.return_base64).toBe(true);
    expect(body.extra_body).toEqual({ response_format: "b64_json" });
    expect(body.extra_body.image).toBeUndefined();
  });

  test("numeric width/height take precedence over size", () => {
    const body = buildAgnesRequestBody(MODEL, {
      prompt: "x",
      width: 1312,
      height: 736,
    });
    expect(body.size).toBe("1K");
    expect(body.ratio).toBe("16:9");
  });

  test("the registry id is the upstream model name", () => {
    expect(buildAgnesRequestBody(MODEL, { prompt: "x" }).model).toBe(
      "agnes-image-2.5-flash"
    );
  });

  test("an exact-size model sends the requested WxH and no ratio", () => {
    // 2.0 publishes `size` as an exact canvas and has no `ratio` parameter,
    // so it must not receive a tier label ("1K") the way 2.5/2.1 do.
    const exact = MODEL_CONFIGS["agnes-image-2.0-flash"];
    const body = buildAgnesRequestBody(exact, {
      prompt: "a cat",
      size: "1024x768",
    });
    expect(body.model).toBe("agnes-image-2.0-flash");
    expect(body.size).toBe("1024x768");
    expect(body.ratio).toBeUndefined();
    expect(body.return_base64).toBe(true);
  });

  test("URL and data-URI images pass through; raw base64 is wrapped", () => {
    const body = buildAgnesRequestBody(
      MODEL,
      { prompt: "x", size: "1024x1024" },
      ["https://cdn.example/a.png", "data:image/webp;base64,AAAA", "QUJD"]
    );
    expect(body.extra_body.image).toEqual([
      "https://cdn.example/a.png",
      "data:image/webp;base64,AAAA",
      "data:image/png;base64,QUJD",
    ]);
    expect(body.return_base64).toBeUndefined();
  });
});

describe("publicImageUrl", () => {
  const HOST = "api.agnes.example";

  test("accepts a public https image URL on the provider host", () => {
    expect(publicImageUrl(`https://${HOST}/out.png`, HOST)).toBe(
      `https://${HOST}/out.png`
    );
  });

  test("refuses schemes, hosts, and hosts this transport does not fetch", () => {
    for (const target of [
      `http://${HOST}/out.png`,
      "data:image/png;base64,AAAA",
      "file:///etc/passwd",
      "https://127.0.0.1/out.png",
      "https://[::1]/out.png",
      "https://localhost/out.png",
      "https://images.local/out.png",
      // Public names that resolve to a private address: a Worker cannot
      // resolve DNS, so the host pin - not this check - is what refuses them.
      "https://127.0.0.1.nip.io/out.png",
      "https://169.254.169.254.nip.io/out.png",
      "https://cdn.example/out.png",
      "not a url",
    ]) {
      expect(() => publicImageUrl(target, HOST)).toThrow(OpenAITransportError);
    }
  });

  test("refuses a port or userinfo on the provider host", () => {
    // The host pin alone is not the whole origin: a different port on the
    // same hostname is a different service, and userinfo makes the URL read
    // as the provider's origin while carrying someone else's credentials.
    // Both stay confined to the one origin this transport already trusts.
    for (const target of [
      `https://${HOST}:8443/out.png`,
      `https://user:pass@${HOST}/out.png`,
      `https://user@${HOST}/out.png`,
    ]) {
      expect(() => publicImageUrl(target, HOST)).toThrow(OpenAITransportError);
    }
    // An explicit :443 is the https default, so URL drops it and the origin
    // is unchanged — that must keep working, not be mistaken for a stray
    // port. Same for a non-default path and query.
    expect(publicImageUrl(`https://${HOST}:443/out.png`, HOST)).toBe(
      `https://${HOST}/out.png`
    );
    expect(publicImageUrl(`https://${HOST}/a/b/out.png?v=1`, HOST)).toBe(
      `https://${HOST}/a/b/out.png?v=1`
    );
  });
});

describe("OpenAITransport.run", () => {
  test("returns base64 from a b64_json response with bearer auth", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ created: 1, data: [{ b64_json: "aGVsbG8=" }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const transport = new OpenAITransport({
      baseUrl: BASE_URL,
      pool: oneKeyPool("key-one"),
    });
    const result = await transport.run(MODEL.id, { prompt: "x" }, MODEL);

    expect(result).toEqual({ image: "aGVsbG8=" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${BASE_URL}/v1/images/generations`);
    expect(init.headers).toMatchObject({ Authorization: "Bearer key-one" });
    expect(init.method).toBe("POST");
  });

  test("the bound provider's base URL is the default endpoint", async () => {
    // The registry entry passes no baseUrl, so the transport must reach the
    // provider the constant names rather than an unconfigured host.
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ b64_json: "aGVsbG8=" }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const transport = new OpenAITransport({ pool: oneKeyPool("k") });
    await transport.run(MODEL.id, { prompt: "x" }, MODEL);

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${AGNES_API_BASE_URL}/v1/images/generations`);
  });

  test("downloads and returns bytes when the provider returns a URL", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn(async (input: unknown) => {
      const href = String(input);
      if (href.endsWith("/v1/images/generations")) {
        return Response.json({
          data: [
            { url: `https://${BASE_URL.replace("https://", "")}/out.png` },
          ],
        });
      }
      return new Response(bytes.buffer as ArrayBuffer, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const transport = new OpenAITransport({
      baseUrl: `${BASE_URL}/`,
      pool: oneKeyPool("k"),
    });
    const result = (await transport.run(MODEL.id, { prompt: "x" }, MODEL)) as {
      image: Uint8Array;
    };

    expect(result.image).toBeInstanceOf(Uint8Array);
    expect([...result.image]).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Redirects are not followed: the image fetch must say so explicitly.
    const [, imageInit] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(imageInit.redirect).toBe("manual");
  });

  test("refuses a public name that resolves to a private address (DNS rebinding)", async () => {
    // `https://` and not an IP literal, so only the host pin refuses it: a
    // Worker cannot resolve the name to see that it points at 127.0.0.1.
    const fetchMock = vi.fn(async (input: unknown) => {
      const href = String(input);
      if (href.endsWith("/v1/images/generations")) {
        return Response.json({
          data: [{ url: "https://127.0.0.1.nip.io/latest/meta-data" }],
        });
      }
      throw new Error(`unexpected fetch to ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const transport = new OpenAITransport({
      baseUrl: BASE_URL,
      pool: oneKeyPool("k"),
    });

    await expect(
      transport.run(MODEL.id, { prompt: "x" }, MODEL)
    ).rejects.toThrow("does not fetch");
    // Only the API call went out: the internal target was never fetched.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("does not follow a redirect off the provider host", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const href = String(input);
      if (href.endsWith("/v1/images/generations")) {
        return Response.json({
          data: [
            { url: `https://${BASE_URL.replace("https://", "")}/out.png` },
          ],
        });
      }
      // Only a manual-mode fetch may see the raw 3xx; a followed redirect
      // would have produced the 200 below.
      if (init?.redirect === "manual") {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://127.0.0.1.nip.io/steal" },
        });
      }
      return new Response(bytes.buffer as ArrayBuffer, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const transport = new OpenAITransport({
      baseUrl: BASE_URL,
      pool: oneKeyPool("k"),
    });

    await expect(
      transport.run(MODEL.id, { prompt: "x" }, MODEL)
    ).rejects.toThrow("image download failed (302)");
    // The API call and the refused download only; the redirect target is
    // never requested.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe(`${BASE_URL}/out.png`);
  });

  test("refuses to download from a target a response must not reach", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const href = String(input);
      if (href.endsWith("/v1/images/generations")) {
        return Response.json({
          data: [{ url: "http://169.254.169.254/latest/meta-data" }],
        });
      }
      throw new Error(`unexpected fetch to ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const transport = new OpenAITransport({
      baseUrl: BASE_URL,
      pool: oneKeyPool("k"),
    });

    await expect(
      transport.run(MODEL.id, { prompt: "x" }, MODEL)
    ).rejects.toThrow("not a public https location");
    // Only the API call went out: the internal target was never fetched.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  test("pool: a retryable failure parks the key and tries the next", async () => {
    const pool = twoKeyPool();
    const reportSpy = vi.spyOn(pool, "reportFailure");
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) return new Response("rate limited", { status: 429 });
      return Response.json({ data: [{ b64_json: "aGVsbG8=" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const transport = new OpenAITransport({ baseUrl: BASE_URL, pool });
    const result = await transport.run(MODEL.id, { prompt: "x" }, MODEL);

    expect(result).toEqual({ image: "aGVsbG8=" });
    expect(reportSpy).toHaveBeenCalledTimes(1);
    expect(reportSpy.mock.calls[0][0]).toBe("a");
    expect(pool.pick(Date.now())?.label).toBe("b");
  });

  test("pool: a terminal failure surfaces without parking a key", async () => {
    const pool = twoKeyPool();
    const reportSpy = vi.spyOn(pool, "reportFailure");
    const fetchMock = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const transport = new OpenAITransport({ baseUrl: BASE_URL, pool });
    await expect(
      transport.run(MODEL.id, { prompt: "x" }, MODEL)
    ).rejects.toThrow(/400/);

    expect(reportSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a pool with nothing servable is an explicit error, not a null", async () => {
    // ADR-001: the pool is the only credential source, so an exhausted pool
    // (every key cooled down) must read as such and must not call out.
    const pool = oneKeyPool("key-a");
    pool.reportFailure("a", Date.now());
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const transport = new OpenAITransport({ baseUrl: BASE_URL, pool });
    await expect(
      transport.run(MODEL.id, { prompt: "x" }, MODEL)
    ).rejects.toThrow(/no servable credential/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("credential values are scrubbed from error messages", async () => {
    const key = "agnes-secret-key-abc";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`token ${key} rejected`, { status: 500 }))
    );
    const transport = new OpenAITransport({
      baseUrl: BASE_URL,
      pool: oneKeyPool(key),
    });

    await expect(
      transport.run(MODEL.id, { prompt: "x" }, MODEL)
    ).rejects.toThrow("token [redacted] rejected");
  });

  test("encoded forms of the credential are scrubbed too", async () => {
    // Upstream error bodies are surfaced to callers, so a credential the
    // provider echoes back must not survive as an encoded variant of itself.
    const key = 'ab"cd/ef==';
    const urlEncoded = encodeURIComponent(key);
    const jsonEscaped = JSON.stringify(key).slice(1, -1);
    const slashEscaped = key.replace(/\//g, "\\/");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            `raw ${key} | url ${urlEncoded} | json ${jsonEscaped} | slash ${slashEscaped}`,
            { status: 401 }
          )
      )
    );
    const transport = new OpenAITransport({
      baseUrl: BASE_URL,
      pool: oneKeyPool(key),
    });

    let message = "";
    try {
      await transport.run(MODEL.id, { prompt: "x" }, MODEL);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("[redacted]");
    expect(message).not.toContain(key);
    expect(message).not.toContain(urlEncoded);
    expect(message).not.toContain(jsonEscaped);
    expect(message).not.toContain(slashEscaped);
  });
});
