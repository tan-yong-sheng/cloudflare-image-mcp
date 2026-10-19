// ============================================================================
// Tests: static asset serving for the React client
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import { serveClientAsset, wantsSpa } from "./spa.js";
import type { Env } from "../types.js";

function envWithAssets(fetchImpl: (request: Request) => Promise<Response>) {
  return { ASSETS: { fetch: vi.fn(fetchImpl) } } as unknown as Env;
}

describe("wantsSpa", () => {
  it("opts in when the flag is present with any truthy value", () => {
    expect(wantsSpa(new URL("https://example.com/?spa"))).toBe(true);
    expect(wantsSpa(new URL("https://example.com/?spa=1"))).toBe(true);
    expect(wantsSpa(new URL("https://example.com/?spa=true"))).toBe(true);
    expect(wantsSpa(new URL("https://example.com/?spa=YES"))).toBe(true);
  });

  it("stays on the legacy frontend when the flag is absent or disabled", () => {
    expect(wantsSpa(new URL("https://example.com/"))).toBe(false);
    expect(wantsSpa(new URL("https://example.com/?spa=0"))).toBe(false);
    expect(wantsSpa(new URL("https://example.com/?spa=false"))).toBe(false);
    expect(wantsSpa(new URL("https://example.com/?spa=no"))).toBe(false);
  });

  it("ignores an unrelated query parameter", () => {
    expect(wantsSpa(new URL("https://example.com/?other=spa"))).toBe(false);
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
});
