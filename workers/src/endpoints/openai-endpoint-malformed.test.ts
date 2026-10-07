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
