// ============================================================================
// Shared input-collection / response-shaping unit tests - no bindings, no AI
// ============================================================================
// Seam: collectInputImages + buildImageResponse exports. Expected values are
// known-good literals (RFC 4648 base64, explicit URLs), never recomputed
// through the implementation. These tests pin the contract that lets the
// generations / edits / variations handlers keep routing only: multipart
// gather, CF param extraction, and URL absolutizing live behind this module.

import { describe, expect, test } from "vitest";
import {
  buildImageResponse,
  CollectionError,
  collectInputImages,
  type CollectConfig,
} from "./image-request.js";

const EDIT_CONFIG: CollectConfig = {
  defaultModel: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  params: ["size", "steps", "seed", "guidance", "negative_prompt", "strength"],
  imageKeys: ["image", "image_b64"],
  maskKeys: ["mask", "mask_b64"],
  includeMask: true,
  includePrompt: true,
};

const VARIATION_CONFIG: CollectConfig = {
  defaultModel: "@cf/black-forest-labs/flux-2-klein-4b",
  params: ["size", "steps", "seed", "strength"],
  defaults: { strength: 0.7 },
};

const GENERATION_CONFIG: CollectConfig = {
  defaultModel: "@cf/black-forest-labs/flux-1-schnell",
  params: ["size", "steps", "seed", "guidance", "negative_prompt"],
  imageKeys: [],
  includePrompt: true,
};

function jsonRequest(path: string, body: Record<string, any>): Request {
  return new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pngFile(content: string, name = "input.png"): File {
  return new File([new TextEncoder().encode(content)], name, {
    type: "image/png",
  });
}

describe("collectInputImages from JSON", () => {
  test("gathers edit input: image array, mask_b64 alias, params, b64 format", async () => {
    const request = jsonRequest("/v1/images/edits", {
      image: ["aGVsbG8=", "d29ybGQ="],
      mask_b64: "bWFzaw==",
      prompt: "edit this",
      model: "@cf/custom/model",
      n: 2,
      response_format: "b64_json",
      steps: 6,
      strength: 0.5,
    });

    await expect(collectInputImages(request, EDIT_CONFIG)).resolves.toEqual({
      imageDataArr: ["aGVsbG8=", "d29ybGQ="],
      maskData: "bWFzaw==",
      prompt: "edit this",
      modelId: "@cf/custom/model",
      n: 2,
      returnBase64: true,
      explicitParams: { steps: 6, strength: 0.5 },
    });
  });

  test("wraps a single JSON image string into an array with defaults", async () => {
    const request = jsonRequest("/v1/images/variations", {
      image: "aGVsbG8=",
    });

    await expect(
      collectInputImages(request, VARIATION_CONFIG)
    ).resolves.toEqual({
      imageDataArr: ["aGVsbG8="],
      maskData: undefined,
      prompt: "",
      modelId: "@cf/black-forest-labs/flux-2-klein-4b",
      n: 1,
      returnBase64: false,
      explicitParams: { strength: 0.7 },
    });
  });

  test("gathers generation input: prompt, CF params, no images", async () => {
    const request = jsonRequest("/v1/images/generations", {
      prompt: "a cyberpunk cat",
      model: "@cf/custom/model",
      n: 3,
      size: "1024x1024",
      steps: 6,
    });

    await expect(
      collectInputImages(request, GENERATION_CONFIG)
    ).resolves.toEqual({
      imageDataArr: [],
      maskData: undefined,
      prompt: "a cyberpunk cat",
      modelId: "@cf/custom/model",
      n: 3,
      returnBase64: false,
      explicitParams: { size: "1024x1024", steps: 6 },
    });
  });

  test("reads the image_b64 alias for edits JSON", async () => {
    const request = jsonRequest("/v1/images/edits", {
      image_b64: "aGVsbG8=",
      prompt: "p",
    });

    const collected = await collectInputImages(request, EDIT_CONFIG);
    expect(collected.imageDataArr).toEqual(["aGVsbG8="]);
    expect(collected.prompt).toBe("p");
  });
});

describe("collectInputImages from multipart", () => {
  test("gathers Files, image[] fields, string entries, mask, coerced params", async () => {
    const formData = new FormData();
    formData.append("image", pngFile("Hello"));
    formData.append("image[]", pngFile("World", "second.png"));
    formData.append("image", "c3RyaW5n");
    formData.append("mask", pngFile("Mask", "mask.png"));
    formData.append("prompt", "edit this");
    formData.append("model", "@cf/custom/model");
    formData.append("n", "2");
    formData.append("response_format", "b64_json");
    formData.append("size", "1024x1024");
    formData.append("steps", "6");
    formData.append("seed", "42");
    formData.append("guidance", "7.5");
    formData.append("negative_prompt", "blurry");
    formData.append("strength", "0.5");
    const request = new Request("https://worker.test/v1/images/edits", {
      method: "POST",
      body: formData,
    });

    await expect(collectInputImages(request, EDIT_CONFIG)).resolves.toEqual({
      imageDataArr: ["SGVsbG8=", "c3RyaW5n", "V29ybGQ="],
      maskData: "TWFzaw==",
      prompt: "edit this",
      modelId: "@cf/custom/model",
      n: 2,
      returnBase64: true,
      explicitParams: {
        size: "1024x1024",
        steps: 6,
        seed: 42,
        guidance: 7.5,
        negative_prompt: "blurry",
        strength: 0.5,
      },
    });
  });

  test("ignores empty entries and falls back to model/n defaults", async () => {
    const formData = new FormData();
    formData.append("image", pngFile("", "empty.png"));
    formData.append("prompt", "p");
    const request = new Request("https://worker.test/v1/images/edits", {
      method: "POST",
      body: formData,
    });

    const collected = await collectInputImages(request, EDIT_CONFIG);
    expect(collected.imageDataArr).toEqual([]);
    expect(collected.modelId).toBe(
      "@cf/stabilityai/stable-diffusion-xl-base-1.0"
    );
    expect(collected.n).toBe(1);
    expect(collected.returnBase64).toBe(false);
    expect(collected.explicitParams).toEqual({});
  });

  test("variations config skips prompt and mask gathering", async () => {
    const formData = new FormData();
    formData.append("image", pngFile("Hello"));
    formData.append("prompt", "ignored");
    formData.append("mask", pngFile("Mask", "mask.png"));
    const request = new Request("https://worker.test/v1/images/variations", {
      method: "POST",
      body: formData,
    });

    const collected = await collectInputImages(request, VARIATION_CONFIG);
    expect(collected.imageDataArr).toEqual(["SGVsbG8="]);
    expect(collected.prompt).toBe("");
    expect(collected.maskData).toBeUndefined();
    expect(collected.explicitParams).toEqual({ strength: 0.7 });
  });
});

describe("count and body validation", () => {
  test("multipart zero-valued params survive (presence, not truthiness)", async () => {
    const formData = new FormData();
    formData.append("image", pngFile("Hello"));
    formData.append("prompt", "p");
    formData.append("seed", "0");
    formData.append("guidance", "0");
    const request = new Request("https://worker.test/v1/images/edits", {
      method: "POST",
      body: formData,
    });

    const collected = await collectInputImages(request, EDIT_CONFIG);
    expect(collected.explicitParams).toEqual({ seed: 0, guidance: 0 });
  });

  test("non-numeric n throws instead of producing an empty success", async () => {
    const request = jsonRequest("/v1/images/generations", {
      prompt: "p",
      n: "abc",
    });

    await expect(
      collectInputImages(request, GENERATION_CONFIG)
    ).rejects.toThrow("Invalid n");
  });

  test("fractional and non-positive n throw", async () => {
    for (const n of [2.5, 0, -1, "1.5", "2x", "abc"]) {
      const request = jsonRequest("/v1/images/generations", {
        prompt: "p",
        n,
      });
      await expect(
        collectInputImages(request, GENERATION_CONFIG)
      ).rejects.toThrow("Invalid n");
    }
  });

  test("malformed numeric strings throw instead of coercing", async () => {
    for (const [key, value] of [
      ["steps", "20junk"],
      ["seed", "42junk"],
      ["guidance", "1.2junk"],
      ["strength", "0.5junk"],
    ]) {
      const formData = new FormData();
      formData.append("image", pngFile("Hello"));
      formData.append("prompt", "p");
      formData.append(key, value);
      const request = new Request("https://worker.test/v1/images/edits", {
        method: "POST",
        body: formData,
      });
      await expect(collectInputImages(request, EDIT_CONFIG)).rejects.toThrow(
        CollectionError
      );
    }
  });

  test("non-string JSON image members are rejected, not filtered", async () => {
    const request = jsonRequest("/v1/images/edits", {
      image: ["aGVsbG8=", 42],
      prompt: "p",
    });

    await expect(collectInputImages(request, EDIT_CONFIG)).rejects.toThrow(
      CollectionError
    );
  });

  test("null JSON body throws a 400-mapped collection error", async () => {
    const request = new Request("https://worker.test/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });

    await expect(
      collectInputImages(request, GENERATION_CONFIG)
    ).rejects.toThrow("Request body must be a JSON object");
  });
});

describe("buildImageResponse", () => {
  test("shapes b64_json output with only the requested field", () => {
    expect(
      buildImageResponse([{ b64_json: "QUFB" }, { b64_json: "QkJC" }], {
        returnBase64: true,
        origin: "https://worker.test",
        created: 1700000000,
      })
    ).toEqual({
      created: 1700000000,
      data: [{ b64_json: "QUFB" }, { b64_json: "QkJC" }],
    });
  });

  test("absolutizes relative URLs against the request origin", () => {
    expect(
      buildImageResponse(
        [
          { url: "/images/abc", id: "abc" },
          { url: "https://cdn.test/y", id: "y" },
        ],
        {
          returnBase64: false,
          origin: "https://worker.test",
          created: 1700000000,
        }
      )
    ).toEqual({
      created: 1700000000,
      data: [
        { url: "https://worker.test/images/abc" },
        { url: "https://cdn.test/y" },
      ],
    });
  });

  test("generations, edits, and variations share identical output shapes", () => {
    const b64Inputs = [
      [{ b64_json: "QUFB" }], // generations-style single image
      [{ b64_json: "QUFB" }, { b64_json: "QkJC" }], // edits-style batch
      [{ b64_json: "QUFB" }], // variations-style single image
    ];
    for (const images of b64Inputs) {
      const response = buildImageResponse(images, {
        returnBase64: true,
        origin: "https://worker.test",
        created: 1700000000,
      });
      expect(Object.keys(response).sort()).toEqual(["created", "data"]);
      for (const item of response.data) {
        expect(Object.keys(item)).toEqual(["b64_json"]);
      }
    }

    const urlInputs = [
      [{ url: "/images/a", id: "a" }],
      [
        { url: "/images/b", id: "b" },
        { url: "/images/c", id: "c" },
      ],
      [{ url: "/images/d", id: "d" }],
    ];
    for (const images of urlInputs) {
      const response = buildImageResponse(images, {
        returnBase64: false,
        origin: "https://worker.test",
        created: 1700000000,
      });
      expect(Object.keys(response).sort()).toEqual(["created", "data"]);
      for (const item of response.data) {
        expect(Object.keys(item)).toEqual(["url"]);
      }
    }
  });
});
