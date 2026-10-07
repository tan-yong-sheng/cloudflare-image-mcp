// ============================================================================
// Worker router tests - public-route behavior at the fetch interface
// ============================================================================
// Seam: default export fetch with stubbed env. Expected values are
// literals from the documented router contract; assertions pin the
// hotspot paths that run without auth: health, frontend, unknown routes,
// and preflight — pure routing, no AI calls.

import { describe, expect, test } from "vitest";
import worker from "./index.js";
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

  test("root serves the frontend HTML page", async () => {
    const response = await worker.fetch(get("/"), env());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("<!DOCTYPE html>");
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
