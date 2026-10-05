// ============================================================================
// Parameter Parser unit tests - pure logic, no bindings, no network
// ============================================================================
// Seam: ParamParser public interface (parse / toCFPayload / formatHelp).
// Expected values below are independent literals from the documented
// --key=value contract, not recomputations of the implementation.

import { describe, expect, test } from "vitest";
import { ParamParser } from "./param-parser.js";
import type { ModelConfig } from "../types.js";

const fluxConfig: ModelConfig = {
  id: "@cf/black-forest-labs/flux-1-schnell",
  name: "FLUX.1 [schnell]",
  description: "test model",
  provider: "black-forest-labs",
  apiVersion: 2,
  inputFormat: "json",
  responseFormat: "base64",
  supportedTasks: ["text-to-image"],
  parameters: {
    prompt: { cfParam: "prompt", type: "string", required: true },
    steps: { cfParam: "steps", type: "integer", default: 4, min: 1, max: 8 },
    seed: { cfParam: "seed", type: "integer" },
  },
  limits: {
    maxPromptLength: 2048,
    defaultSteps: 4,
    maxSteps: 8,
    minWidth: 512,
    maxWidth: 2048,
    minHeight: 512,
    maxHeight: 2048,
    supportedSizes: ["512x512", "768x768", "1024x1024"],
  },
};

describe("ParamParser.parse with string input", () => {
  test("plain prompt carries through with rawPrompt preserved", () => {
    const result = ParamParser.parse("a cyberpunk cat");
    expect(result.prompt).toBe("a cyberpunk cat");
    expect(result.rawPrompt).toBe("a cyberpunk cat");
  });

  test("embedded --steps and --seed parse to integers", () => {
    const result = ParamParser.parse(
      "cyberpunk cat --steps=6 --seed=12345",
      {},
      fluxConfig
    );
    expect(result.prompt).toBe("cyberpunk cat");
    expect(result.steps).toBe(6);
    expect(result.seed).toBe(12345);
  });

  test("explicit params win over embedded params", () => {
    const result = ParamParser.parse("cat --steps=6", { steps: 4 }, fluxConfig);
    expect(result.steps).toBe(4);
  });

  test("size string parses to WxH literal", () => {
    const result = ParamParser.parse("cat --size=1024x768");
    expect(result.size).toBe("1024x768");
  });

  test("invalid size format throws with WxH guidance", () => {
    expect(() => ParamParser.parse("cat --size=huge")).toThrow(
      "Invalid size format: huge. Use WxH format (e.g., 1024x1024)"
    );
  });

  test("out-of-range steps throws between bounds", () => {
    expect(() => ParamParser.parse("cat --steps=99", {}, fluxConfig)).toThrow(
      "steps must be between 1 and 8"
    );
  });

  test("non-integer steps throws integer error", () => {
    expect(() => ParamParser.parse("cat --steps=many")).toThrow(
      "Invalid steps: must be an integer"
    );
  });

  test("steps beyond model maxSteps throws between model bounds", () => {
    const limited = {
      ...fluxConfig,
      limits: { ...fluxConfig.limits, maxSteps: 4 },
    };
    expect(() => ParamParser.parse("cat --steps=6", {}, limited)).toThrow(
      "steps must be between 1 and 4"
    );
  });

  test("width and height clamp to model bounds within parse range", () => {
    const result = ParamParser.parse(
      "cat --width=300 --height=2000",
      {},
      fluxConfig
    );
    expect(result.width).toBe(512);
    expect(result.height).toBe(2000);
  });

  test("width outside hard parse bounds throws before clamping", () => {
    expect(() => ParamParser.parse("cat --width=100", {}, fluxConfig)).toThrow(
      "width must be between 256 and 2048"
    );
  });

  test("guidance out of range throws", () => {
    expect(() => ParamParser.parse("cat --guidance=99")).toThrow(
      "guidance must be between 1 and 30"
    );
  });

  test("strength out of range throws", () => {
    expect(() => ParamParser.parse("cat --strength=2")).toThrow(
      "strength must be between 0 and 1"
    );
  });

  test("data-URI image extracts base64 payload", () => {
    const result = ParamParser.parse("cat --image=data:image/png;base64,QUJD");
    expect(result.image_b64).toBe("QUJD");
  });

  test("invalid input type throws", () => {
    expect(() => ParamParser.parse(42 as unknown as string)).toThrow(
      "Invalid input type: number"
    );
  });
});

describe("ParamParser.parse with object input", () => {
  test("OpenAI JSON maps prompt, n, size to width/height", () => {
    const result = ParamParser.parse(
      { prompt: "a cat", n: 2, size: "1024x1024" },
      {},
      fluxConfig
    );
    expect(result.prompt).toBe("a cat");
    expect(result.n).toBe(2);
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
  });

  test("n out of range throws", () => {
    expect(() => ParamParser.parse({ prompt: "cat", n: 99 })).toThrow(
      "n must be between 1 and 10"
    );
  });
});

describe("ParamParser.toCFPayload", () => {
  test("maps parsed params through model cfParam names", () => {
    const params = ParamParser.parse("cat --steps=6 --seed=7", {}, fluxConfig);
    const payload = ParamParser.toCFPayload(params, fluxConfig);
    expect(payload).toEqual({ prompt: "cat", steps: 6, seed: 7 });
  });

  test("unknown keys are dropped from payload", () => {
    const payload = ParamParser.toCFPayload(
      { prompt: "cat", rawPrompt: "cat", bogus: 1 },
      fluxConfig
    );
    expect(payload).toEqual({ prompt: "cat" });
  });
});

describe("ParamParser.formatHelp", () => {
  test("help lists model name and parameter flags", () => {
    const help = ParamParser.formatHelp(fluxConfig);
    expect(help).toContain("## FLUX.1 [schnell] Parameters");
    expect(help).toContain("--prompt (required)");
    expect(help).toContain("--steps [default: 4] [1-8]");
  });
});
