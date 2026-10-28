// ============================================================================
// Tests: static asset serving for the React client
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import { isClientAssetPath, serveClientAsset } from "./spa.js";
import type { Env } from "../types.js";

function envWithAssets(fetchImpl: (request: Request) => Promise<Response>) {
  return { ASSETS: { fetch: vi.fn(fetchImpl) } } as unknown as Env;
}

describe("isClientAssetPath", () => {
  it("claims the client's own build output", () => {
    expect(isClientAssetPath("/assets/index-abc123.js")).toBe(true);
    expect(isClientAssetPath("/assets/index-abc123.css")).toBe(true);
  });

  it("leaves every other path to the Worker", () => {
    expect(isClientAssetPath("/")).toBe(false);
    expect(isClientAssetPath("/admin")).toBe(false);
    expect(isClientAssetPath("/v1/models")).toBe(false);
    expect(isClientAssetPath("/api/internal/models")).toBe(false);
    expect(isClientAssetPath("/images/abc.png")).toBe(false);
    // A path that merely starts with the same letters is not the client's.
    expect(isClientAssetPath("/assetsomething")).toBe(false);
  });
});

describe("serveClientAsset", () => {
  it("returns null when no asset binding is configured", async () => {
    const response = await serveClientAsset(
      new Request("https://example.com/assets/app.js"),
      {} as Env
    );
    expect(response).toBeNull();
  });

  it("returns null when the asset worker does not have the path", async () => {
    const env = envWithAssets(
      async () => new Response("Not found", { status: 404 })
    );
    const response = await serveClientAsset(
      new Request("https://example.com/assets/missing.js"),
      env
    );
    expect(response).toBeNull();
  });

  it("serves the asset when the client has it", async () => {
    const env = envWithAssets(
      async () => new Response("console.log(1)", { status: 200 })
    );
    const response = await serveClientAsset(
      new Request("https://example.com/assets/app.js"),
      env
    );
    expect(response).not.toBeNull();
    expect(await response!.text()).toBe("console.log(1)");
  });

  it("asks the asset worker for the requested path", async () => {
    const seen: string[] = [];
    const env = envWithAssets(async (request) => {
      seen.push(new URL(request.url).pathname);
      return new Response("ok", { status: 200 });
    });
    await serveClientAsset(
      new Request("https://example.com/assets/app-abc123.js"),
      env
    );
    expect(seen).toEqual(["/assets/app-abc123.js"]);
  });

  it("does not forward a request body to the asset worker", async () => {
    let method = "";
    const env = envWithAssets(async (request) => {
      method = request.method;
      return new Response("ok", { status: 200 });
    });
    await serveClientAsset(
      new Request("https://example.com/assets/app.js", { method: "POST" }),
      env
    );
    expect(method).toBe("GET");
  });

  it("forwards conditional cache headers to the asset worker", async () => {
    let forwardedIfNoneMatch: string | null = null;
    let forwardedIfModifiedSince: string | null = null;
    let forwardedAuth: string | null = null;
    const env = envWithAssets(async (request) => {
      forwardedIfNoneMatch = request.headers.get("if-none-match");
      forwardedIfModifiedSince = request.headers.get("if-modified-since");
      forwardedAuth = request.headers.get("authorization");
      return new Response(null, { status: 304 });
    });
    const response = await serveClientAsset(
      new Request("https://example.com/assets/app.js", {
        headers: {
          "if-none-match": '"etag-123"',
          "if-modified-since": "Wed, 21 Oct 2026 07:28:00 GMT",
          authorization: "Bearer secret",
        },
      }),
      env
    );
    expect(response?.status).toBe(304);
    expect(forwardedIfNoneMatch).toBe('"etag-123"');
    expect(forwardedIfModifiedSince).toBe("Wed, 21 Oct 2026 07:28:00 GMT");
    expect(forwardedAuth).toBeNull();
  });
});
