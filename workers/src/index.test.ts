// ============================================================================
// Worker router tests - public-route behavior at the fetch interface
// ============================================================================
// Seam: default export fetch with stubbed env. Expected values are
// literals from the documented router contract; assertions pin the
// hotspot paths that run without auth: health, frontend, unknown routes,
// and preflight — pure routing, no AI calls.

import { describe, expect, test } from "vitest";
import worker from "./index.js";
import { ADMIN_HEALTH_PATH, ADMIN_KEYS_PATH } from "./endpoints/admin.js";
import { MAX_WEIGHT } from "./services/admin-store.js";
import type { Env } from "./types.js";

function env(): Env {
  return {
    IMAGE_BUCKET: {},
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_API_TOKEN: "token",
    IMAGE_EXPIRY_HOURS: "24",
  } as unknown as Env;
}

function get(path: string): Request {
  return new Request(`https://worker.test${path}`, { method: "GET" });
}

describe("router public paths", () => {
  test("health returns a healthy JSON envelope", async () => {
    const response = await worker.fetch(get("/health"), env());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("healthy");
  });

  test("the model picker is told which providers can actually serve", async () => {
    const response = await worker.fetch(get("/api/internal/models"), env());

    expect(response.status).toBe(200);
    const models = (await response.json()) as Array<{
      provider: string;
      available: boolean;
    }>;
    expect(models.length).toBeGreaterThan(0);
    // This env has no D1 binding, so no provider row is servable and every
    // entry says so. Availability is per model, from the pool readiness
    // map — not a per-provider list the client has to join itself.
    expect(models.every((model) => model.available === false)).toBe(true);
  });

  test("unknown routes return 404", async () => {
    const response = await worker.fetch(get("/no-such-route"), env());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "Not found",
        type: "invalid_request_error",
        code: null,
      },
    });
  });

  test("OPTIONS preflight returns CORS headers", async () => {
    const request = new Request("https://worker.test/v1/models", {
      method: "OPTIONS",
    });

    const response = await worker.fetch(request, env());

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("the React client's routes", () => {
  /** An env whose asset binding answers like the asset worker. */
  function clientEnv(
    files: Record<string, string> = { "/": "<div id=root></div>" },
    apiKeys?: string
  ): Env {
    return {
      IMAGE_BUCKET: {},
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      IMAGE_EXPIRY_HOURS: "24",
      ...(apiKeys ? { API_KEYS: apiKeys } : {}),
      ASSETS: {
        fetch: async (request: Request) => {
          const path = new URL(request.url).pathname;
          const body = files[path];
          if (body === undefined)
            return new Response("Not found", { status: 404 });
          return new Response(body, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        },
      },
    } as unknown as Env;
  }

  test("the client document is served by default", async () => {
    const response = await worker.fetch(get("/"), clientEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("<div id=root></div>");
  });

  test("the client document is served on the index path", async () => {
    const response = await worker.fetch(get("/index.html"), clientEnv());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<div id=root></div>");
  });

  test("the client document is served on the /admin path", async () => {
    // /admin was the legacy shell's workbench entry point, and an
    // operator may have bookmarked it.
    const response = await worker.fetch(get("/admin"), clientEnv());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<div id=root></div>");
  });

  test("a missing client build says so instead of serving an error page", async () => {
    // No asset binding: the Worker has no frontend of its own any more,
    // so a deployment without the client build cannot serve a page.
    const response = await worker.fetch(get("/"), env());

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      error: { message: string; code: string };
    };
    expect(body.error.code).toBe("client_not_built");
    expect(body.error.message).toContain("npm --prefix client run build");
  });

  test("the client's own files are served without a key", async () => {
    const response = await worker.fetch(
      get("/assets/index-abc123.js"),
      clientEnv({ "/assets/index-abc123.js": "console.log(1)" }, "secret")
    );

    // The bundle is public: every browser downloads it, and the auth
    // gate governs the API routes.
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("console.log(1)");
  });

  test("a client file the build does not have is a 404, not a 401", async () => {
    const response = await worker.fetch(
      get("/assets/missing.js"),
      clientEnv({}, "secret")
    );

    // Falling through to the auth gate would call a missing bundle a
    // credential problem.
    expect(response.status).toBe(404);
  });

  test("the API routes are untouched by the client", async () => {
    const response = await worker.fetch(
      get("/v1/models"),
      clientEnv({}, "secret")
    );

    // The asset lookup must not swallow the API routes: an unauthenticated
    // API call still gets the 401 the auth gate produces.
    expect(response.status).toBe(401);
  });
});

describe("image proxy (CORS)", () => {
  test("the image proxy sends CORS, so Download works cross-origin", async () => {
    // Download reads the stored image with fetch(). The page can be served
    // from a different origin than the one embedded in the stored URL (a
    // proxy, a custom domain), and without this header the browser blocks
    // the response: the image renders but Download fails with an opaque
    // "Failed to fetch". The header is the fix, so pin it on both the hit
    // and the miss.
    const crossOrigin = () =>
      new Request("https://worker.test/images/2026-01-01/nope.png", {
        method: "GET",
        headers: { Origin: "https://proxy.example" },
      });

    const missing = await worker.fetch(crossOrigin(), env());
    expect(missing.headers.get("access-control-allow-origin")).toBe("*");

    // A hit needs a real object, so drive the bucket directly.
    const store = new Map<string, ArrayBuffer>();
    store.set(
      "images/2026-01-01/ok.png",
      new Uint8Array([137, 80, 78, 71]).buffer
    );
    const withBucket = {
      ...env(),
      IMAGE_BUCKET: {
        get: async (key: string) =>
          store.has(key)
            ? {
                body: store.get(key),
                httpMetadata: { contentType: "image/png" },
              }
            : null,
      },
    } as unknown as Env;
    const hit = await worker.fetch(
      new Request("https://worker.test/images/2026-01-01/ok.png", {
        method: "GET",
        headers: { Origin: "https://proxy.example" },
      }),
      withBucket
    );
    expect(hit.status).toBe(200);
    expect(hit.headers.get("access-control-allow-origin")).toBe("*");
    expect(hit.headers.get("content-type")).toBe("image/png");
  });
});
