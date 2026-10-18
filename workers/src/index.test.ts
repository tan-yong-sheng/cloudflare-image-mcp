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

  test("generator readiness is server-rendered, not an unauthenticated health probe", async () => {
    // ADR-001 UX fix: /api/admin/health is gated, so fetching it from the
    // generator before login always 401/403s and the "no keys" warning
    // never showed. Readiness is baked into the page instead.
    const response = await worker.fetch(get("/"), env());
    const html = await response.text();

    // No PROVIDER_DB bound in this env -> no servable pool -> false.
    expect(html).toContain("const HAS_CREDENTIALS = false;");
    expect(html).toContain("applyCredentialWarning");
    // The model picker greys out with the same flag, so an unconfigured
    // pool never offers a model the user then cannot generate with.
    expect(html).toContain("modelSelect.disabled = !credentialsConfigured;");
    expect(html).not.toContain("fetch(API_BASE + '/admin/health'");
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

describe("provider credentials workbench (R2 follow-up, #91)", () => {
  test("the workbench markup, gates, and endpoints exist on /", async () => {
    const response = await worker.fetch(get("/"), env());
    expect(response.status).toBe(200);
    const html = await response.text();
    // Every element id the workbench script addresses must exist.
    for (const id of [
      "generatorView",
      "adminView",
      "adminWorkbenchButton",
      "adminBackBtn",
      "adminGate",
      "adminKey",
      "adminUnlock",
      "adminLock",
      "adminError",
      "adminPanel",
      "adminKeys",
      "adminRail",
      "adminAddKey",
      "adminNotice",
      "adminSheet",
      "adminSheetAcct",
      "adminSheetToken",
      "adminSheetWeight",
      "adminSheetEnabled",
      "adminSheetError",
      "adminSheetSave",
      "adminSheetCancel",
      "themeToggleAdmin",
      "logoutButtonAdmin",
    ]) {
      expect(html).toContain('id="' + id + '"');
    }
    // The workbench talks to the admin API with the management-key header.
    // These are the server's own constants, so renaming a route on either side
    // without the other fails here.
    expect(html).toContain(ADMIN_HEALTH_PATH);
    expect(html).toContain(ADMIN_KEYS_PATH);
    expect(html).toContain("X-Admin-Key");
    // The management key must remain memory-only: never persisted.
    expect(html).not.toMatch(/sessionStorage\.(set|get)Item\('admin/);
    expect(html).not.toMatch(/localStorage.*admin/i);
    // Locking invalidates in-flight admin requests: api() compares the
    // generation it captured against the current one before a response may
    // drive the UI, so a save that resolves after lock or logout cannot be
    // reported as success.
    const lockAt = html.indexOf("function lock()");
    expect(lockAt).toBeGreaterThan(-1);
    expect(html.slice(lockAt, lockAt + 160)).toContain(
      "adminRequestGeneration += 1"
    );
    expect(html).toContain("if (generation !== adminRequestGeneration)");
    // A 403 whose cause is a disabled admin gate (API_KEYS unset) carries
    // its own code, and the UI must show that reason rather than telling the
    // operator their management key is wrong.
    expect(html).toContain("admin_disabled");
    // /admin is routed to this same shell, so the shell has to adopt the
    // admin fragment: with a hash-only route check, visiting /admin showed
    // the generator and the route was pointless.
    expect(html).toContain("window.location.pathname === '/admin'");
    // The served UI mirrors the store's weight ceiling: it cannot import the
    // constant, so this pins the two together.
    expect(html).toContain('max="' + MAX_WEIGHT + '"');
  });

  test("each key row offers a confirmed hard delete", async () => {
    // The delete control is the only irreversible action in the workbench:
    // it must reach the delete route, not the disable one, and it must ask
    // first. Pinning the markers keeps a refactor from quietly dropping the
    // confirmation or re-pointing it at the enable/disable toggle.
    const response = await worker.fetch(get("/"), env());
    const html = await response.text();
    expect(html).toContain("api('POST', ADMIN_KEYS + '/' + k.id + '/delete')");
    expect(html).toContain("fa-solid fa-trash");
    expect(html).toContain("This cannot be undone.");
    expect(html).toContain("window.confirm(");
  });

  test("GET /admin routes to the frontend", async () => {
    const response = await worker.fetch(get("/admin"), env());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('id="adminView"');
    expect(html).toContain('id="adminGate"');
    expect(html).toContain('id="generatorView"');
  });
});
