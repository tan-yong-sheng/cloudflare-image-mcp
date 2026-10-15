// ============================================================================
// MCP capability tests - R1b (#72), exposure propagation (listChanged)
// ============================================================================
// Seam: initialize through the real handleMcpRequest. Story 19: exposure
// changes must propagate with listChanged semantics, so the server
// advertises the tools listChanged capability and every session's
// tools/list reflects the version-poll-cached overlay. Pushing
// notifications over persistent connections is deferred (Durable Objects
// are out of scope per #68) — the capability + per-session freshness is
// the R1b contract.

import { describe, expect, test } from "vitest";
import { handleMcpRequest } from "./mcp-sdk-server.js";
import { fakeEnv } from "../test-utils/fixtures.js";

function initializeRequest(origin = "https://worker.test"): Request {
  return new Request(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "capability-probe", version: "0.0.0" },
      },
    }),
  });
}

describe("MCP capabilities (listChanged)", () => {
  test("initialize advertises tools listChanged", async () => {
    const res = await handleMcpRequest(initializeRequest(), {
      env: fakeEnv(),
      baseUrl: "https://worker.test",
      mode: "multi-model",
    });

    const text = await res.text();
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
      expect(
        dataLine,
        `unexpected MCP response: ${text.slice(0, 300)}`
      ).toBeDefined();
      payload = JSON.parse(dataLine!.slice("data: ".length));
    }
    expect(payload.result.capabilities.tools.listChanged).toBe(true);
  });
});
