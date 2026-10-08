// ============================================================================
// Shared image-request utils
// Single home for OpenAI image input collection and response shaping so the
// generations, edits, and variations handlers keep routing only. Multipart
// and JSON image inputs behave identically, and URL versus base64 output
// shaping changes in one place. Pure collection/shaping, no AI bindings.
// ============================================================================

import type { OpenAIImageResponse } from "../types.js";
import { arrayBufferToBase64 } from "./encoding.js";

/**
 * Which inputs to gather for one image route. Params are the CF-specific
 * keys extracted only when explicitly provided (so --key=value prompt
 * parsing in ParamParser can fill the gaps downstream).
 */
export interface CollectConfig {
  defaultModel: string;
  params: string[];
  imageKeys?: string[];
  maskKeys?: string[];
  includeMask?: boolean;
  includePrompt?: boolean;
  defaults?: Record<string, any>;
}

/**
 * Collected image-route input with multipart and JSON normalized
 * to the same shape.
 */
export interface CollectedInput {
  imageDataArr: string[];
  maskData: string | undefined;
  prompt: string;
  modelId: string;
  n: number;
  returnBase64: boolean;
  explicitParams: Record<string, any>;
}

/**
 * Generated image as returned by ImageGeneratorService result lists:
 * either a stored URL reference or inline base64.
 */
export type GeneratedImage = { url: string; id: string } | { b64_json: string };

// FormData string coercions mirror the previous per-handler extraction:
// steps/seed are integers, guidance/strength are floats, everything else
// passes through as a string. JSON bodies keep their parsed values as-is.
function coerceFormParam(key: string, value: string): any {
  if (key === "steps" || key === "seed") return parseInt(value);
  if (key === "guidance" || key === "strength") return parseFloat(value);
  return value;
}

/**
 * Caller-input failure during collection (bad count, non-object body,
 * malformed multipart). The endpoint's handle() catch maps this to 400;
 * every other collection-phase throw stays a 500.
 */
export class CollectionError extends Error {}

/**
 * Normalize the image count: absent/blank means 1; anything else must be
 * a positive integer. Throws CollectionError (400 via handle's catch)
 * instead of letting NaN flow into runMany, where it previously produced
 * a successful response with no images.
 */
function parseCount(value: unknown): number {
  if (value === null || value === undefined || value === "") return 1;
  // Number(), not parseInt: "1.5" must not truncate to 1 and "2x" must
  // not parse as 2 — the whole value has to be an integer.
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CollectionError(
      `Invalid n: must be a positive integer, got ${value}`
    );
  }
  return parsed;
}

/**
 * Read a File/Blob from FormData and convert to base64 string
 */
async function fileToBase64(
  file: File | Blob | null
): Promise<string | undefined> {
  if (!file) return undefined;
  const arrayBuffer = await file.arrayBuffer();
  return arrayBufferToBase64(arrayBuffer);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function collectJsonImages(
  body: Record<string, any>,
  keys: string[]
): string[] {
  for (const key of keys) {
    const raw = body[key];
    if (Array.isArray(raw)) {
      return raw.filter(isNonEmptyString);
    }
    if (isNonEmptyString(raw)) {
      return [raw];
    }
  }
  return [];
}

async function collectMultipartImages(
  entries: (File | Blob | string)[]
): Promise<string[]> {
  const imageDataArr: string[] = [];
  for (const entry of entries) {
    if (entry instanceof Blob) {
      const b64 = await fileToBase64(entry);
      if (b64) imageDataArr.push(b64);
    } else if (isNonEmptyString(entry)) {
      imageDataArr.push(entry);
    }
  }
  return imageDataArr;
}

/**
 * Collect image-route input from either a multipart form or a JSON body
 * into one normalized shape. Multipart gather, CF param extraction, and
 * defaults live here so handlers keep routing only.
 */
export async function collectInputImages(
  request: Request,
  config: CollectConfig
): Promise<CollectedInput> {
  const contentType = request.headers.get("content-type") || "";
  const imageKeys = config.imageKeys ?? ["image", "image_b64"];
  const maskKeys =
    config.maskKeys ?? (config.includeMask ? ["mask", "mask_b64"] : []);

  let imageDataArr: string[] = [];
  let maskData: string | undefined;
  let prompt = "";
  let modelId = config.defaultModel;
  let n = 1;
  let returnBase64 = false;
  const explicitParams: Record<string, any> = {};

  if (contentType.includes("multipart/form-data")) {
    // Malformed multipart is caller input (400), not a service failure.
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new CollectionError(`Invalid multipart body: ${detail}`);
    }

    // Support both single "image" and array "image[]" fields (OpenAI style)
    const imageEntries = [
      ...(formData.getAll("image") as (File | Blob | string)[]),
      ...(formData.getAll("image[]") as (File | Blob | string)[]),
    ];
    imageDataArr = await collectMultipartImages(imageEntries);

    if (config.includeMask) {
      const maskEntry = formData.get("mask") as File | Blob | string | null;
      if (maskEntry instanceof Blob) {
        maskData = (await fileToBase64(maskEntry)) || undefined;
      } else if (isNonEmptyString(maskEntry)) {
        maskData = maskEntry;
      }
    }

    if (config.includePrompt) {
      prompt = (formData.get("prompt") as string) ?? "";
    }
    modelId = (formData.get("model") as string) || config.defaultModel;
    n = parseCount(formData.get("n"));
    returnBase64 = formData.get("response_format") === "b64_json";

    for (const key of config.params) {
      const value = formData.get(key) as string | null;
      // Presence check, not truthiness: form fields arrive as strings so
      // "0" must survive (matching the JSON path's !== undefined).
      if (value !== null && value !== "") {
        explicitParams[key] = coerceFormParam(key, value);
      }
    }
  } else {
    const parsed: unknown = await request.json();
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new CollectionError("Request body must be a JSON object");
    }
    const body = parsed as Record<string, any>;

    imageDataArr = collectJsonImages(body, imageKeys);
    for (const key of maskKeys) {
      if (isNonEmptyString(body[key])) {
        maskData = body[key];
        break;
      }
    }

    if (config.includePrompt) {
      prompt = body.prompt ?? "";
    }
    modelId = body.model || config.defaultModel;
    n = parseCount(body.n);
    returnBase64 = body.response_format === "b64_json";

    for (const key of config.params) {
      if (body[key] !== undefined) explicitParams[key] = body[key];
    }
  }

  for (const [key, value] of Object.entries(config.defaults ?? {})) {
    if (explicitParams[key] === undefined) explicitParams[key] = value;
  }

  return {
    imageDataArr,
    maskData,
    prompt,
    modelId,
    n,
    returnBase64,
    explicitParams,
  };
}

/**
 * Shape generator output into the OpenAI-compatible response envelope.
 * OpenAI spec: return only the requested format field (url OR b64_json).
 * Relative stored URLs are absolutized against the request origin.
 */
export function buildImageResponse(
  images: GeneratedImage[],
  options: { returnBase64: boolean; origin: string; created?: number }
): OpenAIImageResponse {
  let responseData;
  if (options.returnBase64) {
    responseData = images.map((img) => ({
      b64_json: "b64_json" in img ? img.b64_json : "",
    }));
  } else {
    responseData = images.map((img) => {
      const url = "url" in img ? img.url : "";
      const absoluteUrl = url.startsWith("/")
        ? new URL(url, options.origin).toString()
        : url;
      return { url: absoluteUrl };
    });
  }

  return {
    created: options.created ?? Math.floor(Date.now() / 1000),
    data: responseData,
  };
}
