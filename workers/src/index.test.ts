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

  test("login modal validates the key against an authenticated route", async () => {
    const response = await worker.fetch(get("/"), env());
    const html = await response.text();
    // /health is public by design, so validating login against it lets
    // any key dismiss the modal (#49). /v1/models requires auth when
    // API_KEYS is set (and stays 200 in open-by-default mode).
    expect(html).toContain("fetch(API_BASE + '/models'");
    expect(html).not.toContain("fetch('/health'");
  });

  test("frontend model controls come from /api/internal/models (#50)", async () => {
    const response = await worker.fetch(get("/"), env());
    const html = await response.text();
    // Dropdown populated at runtime: no hardcoded model <option>s.
    expect(html).not.toContain('<option value="@cf/');
    expect(html).toContain("/api/internal/models");
    // Dead copyParamsButton removed; result image has an error path.
    expect(html).not.toContain("copyParamsButton");
    expect(html).toContain("aiImage.onerror");
    // Generation failures surface inline, not via alert().
    expect(html).not.toContain("alert('Error: '");
    // Slice A: submit disables while loading (double-submit guard).
    expect(html).toContain("submitButton.disabled = true");
    // OCR follow-ups: abort recovery + prior-source restore.
    expect(html).toContain("AbortController");
    expect(html).toContain("priorSrc");
    expect(html).toContain("restoring");
    // #65+#66: single Size select driven by per-model supportedSizes
    // (no w/h sliders), fixed 1-8 count select (no free number input).
    expect(html).toContain('id="size"');
    expect(html).not.toContain('id="width"');
    expect(html).not.toContain('id="height"');
    expect(html).toContain('id="n"');
    expect(html).toContain("<select");
    // Slice D: labels associated, live regions announced, toggle exposes state.
    // #65+#66: width/height sliders gone; size + steps labels remain.
    expect(html).toContain('for="size"');
    expect(html).toContain('for="steps"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('role="status"');
    expect(html).toContain("aria-expanded");
    // Prompt-only UI excludes image-to-image-only models; num_steps
    // models get the declared key, not the steps alias.
    expect(html).toContain("includes('text-to-image')");
    expect(html).toContain("body.num_steps");
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
