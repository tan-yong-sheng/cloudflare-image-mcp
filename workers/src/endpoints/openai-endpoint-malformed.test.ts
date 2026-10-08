// ============================================================================
// OpenAI endpoint malformed-JSON tests - 400 contract for bad bodies
// ============================================================================
// Seam: OpenAIEndpoint.handle with a stub JSON body. Expected envelopes are
// literals from the OpenAI error contract; assertions pin that a body
// that cannot parse returns 400 invalid_request_error, never a 500.

import { describe, expect, test } from "vitest";
import { OpenAIEndpoint } from "./openai-endpoint.js";
import type { Env } from "../types.js";

function endpoint(): OpenAIEndpoint {
  const env = {
    IMAGE_BUCKET: {},
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_API_TOKEN: "token",
    IMAGE_EXPIRY_HOURS: "24",
  } as unknown as Env;
  return new OpenAIEndpoint(env);
}

function malformedRequest(path: string): Request {
  return new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Invalid JSON: `.json()` rejects, which must map to the 400 envelope.
    body: "{not-json",
  });
}

describe("malformed JSON bodies", () => {
  test("generations returns 400 invalid_request_error", async () => {
    const response = await endpoint().handle(
      malformedRequest("/v1/images/generations")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "Invalid JSON in request body",
        type: "invalid_request_error",
        code: null,
      },
    });
  });

  test("edits returns 400 invalid_request_error", async () => {
    const response = await endpoint().handle(
      malformedRequest("/v1/images/edits")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "Invalid JSON in request body",
        type: "invalid_request_error",
        code: null,
      },
    });
  });

  test("variations returns 400 invalid_request_error", async () => {
    const response = await endpoint().handle(
      malformedRequest("/v1/images/variations")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "Invalid JSON in request body",
        type: "invalid_request_error",
        code: null,
      },
    });
  });
});

describe("collection-phase caller input", () => {
  function jsonRequest(path: string, body: Record<string, any>): Request {
    return new Request(`https://worker.test${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  test("invalid n maps to 400, not 500", async () => {
    const response = await endpoint().handle(
      jsonRequest("/v1/images/generations", { prompt: "p", n: "abc" })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.code).toBeNull();
    expect(String(body.error.message)).toMatch(/Invalid n/);
  });

  test("null JSON body maps to 400 with its specific message", async () => {
    const response = await endpoint().handle(
      new Request("https://worker.test/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "null",
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toBe("Request body must be a JSON object");
  });

  test("malformed multipart maps to 400, not 500", async () => {
    const response = await endpoint().handle(
      new Request("https://worker.test/v1/images/edits", {
        method: "POST",
        // Claims multipart but carries a body formData() cannot parse.
        headers: { "Content-Type": "multipart/form-data; boundary=xyz" },
        body: "this is not multipart",
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.code).toBeNull();
    expect(String(body.error.message)).toMatch(/multipart/i);
  });
});
