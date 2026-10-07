// ============================================================================
// Shared CORS utils unit tests - pure logic, no bindings, no network
// ============================================================================
// Seam: corsHeaders record + withCors helper. Header values are literals
// from the router contract (MCP session headers must stay allow-listed or
// browser preflights fail before the request fires).

import { describe, expect, test } from "vitest";
import { corsHeaders, withCors } from "./cors.js";

describe("corsHeaders", () => {
  test("allows any origin", () => {
    expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("*");
  });

  test("allows the router method set", () => {
    expect(corsHeaders["Access-Control-Allow-Methods"]).toBe(
      "GET, POST, DELETE, OPTIONS"
    );
  });

  test("allow-lists MCP session and transport headers", () => {
    const allowed = (corsHeaders["Access-Control-Allow-Headers"] ?? "").split(
      ", "
    );
    for (const header of [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "Mcp-Protocol-Version",
      "Last-Event-ID",
      "MCP-Transport",
    ]) {
      expect(allowed).toContain(header);
    }
  });

  test("exposes session id and auth challenge", () => {
    expect(corsHeaders["Access-Control-Expose-Headers"]).toBe(
      "Mcp-Session-Id, WWW-Authenticate"
    );
  });
});

describe("withCors", () => {
  test("applies CORS headers while preserving status, body, content type", async () => {
    const inner = new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
    const response = withCors(inner);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("preserves the auth challenge header on 401s", () => {
    const inner = new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
    const response = withCors(inner);
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
