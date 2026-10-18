// ============================================================================
// OpenAI-compatible transport - non-Cloudflare provider (R3-Agnes, #75)
// ============================================================================
// Second implementation of the AITransport seam for providers that speak the
// OpenAI Images wire format. The registry (services/transports.ts) binds a
// transport key to this class per ADR-002, so nothing here branches on a
// provider name, and credentials arrive only as a ProviderPool: there is no
// environment fallback (ADR-001).
//
// It reuses the existing credential pool and cooldown semantics (#72): a
// retryable failure parks the key via ProviderPool.reportFailure, a terminal
// failure surfaces at once without burning the remaining credentials. Size
// tiers and aspect ratios are derived from the requested WxH so the caller
// keeps using the OpenAI `size` field.

import type { ModelConfig } from "../types.js";
import type { ProviderPool } from "./provider-pool.js";
import type { AITransport } from "./generation-adapters.js";
import { cleanBase64 } from "../utils/encoding.js";

/**
 * Base URL of the provider bound to the `openai-compat` registry key (Agnes
 * AI). The transport is protocol-shaped, so the vendor binding lives here
 * next to the wire format it speaks, and the registry entry imports it; a
 * second provider on this seam needs its own bound URL, not a shared one.
 */
export const AGNES_API_BASE_URL = "https://apihub.agnes-ai.com";

/** Output size tiers published by the Agnes Images API. */
export type SizeTier = "1K" | "2K" | "3K" | "4K";

/** Aspect ratios published by the Agnes Images API. */
export type AspectRatio =
  "1:1" | "3:4" | "4:3" | "16:9" | "9:16" | "2:3" | "3:2" | "21:9";

/** Square base edge per tier; tiers scale by area, not by long edge. */
const TIER_BASE: Record<SizeTier, number> = {
  "1K": 1024,
  "2K": 2048,
  "3K": 3072,
  "4K": 4096,
};

const TIERS: SizeTier[] = ["1K", "2K", "3K", "4K"];

const RATIOS: { ratio: AspectRatio; value: number }[] = [
  { ratio: "1:1", value: 1 },
  { ratio: "3:4", value: 3 / 4 },
  { ratio: "4:3", value: 4 / 3 },
  { ratio: "16:9", value: 16 / 9 },
  { ratio: "9:16", value: 9 / 16 },
  { ratio: "2:3", value: 2 / 3 },
  { ratio: "3:2", value: 3 / 2 },
  { ratio: "21:9", value: 21 / 9 },
];

/**
 * Map a requested pixel size to the nearest published tier and aspect
 * ratio. Tier is chosen by area (the tiers are equal-area bands), ratio by
 * log-distance so 16:9 does not drift toward 2:1. Never throws: a missing
 * or malformed size falls back to 1K 1:1.
 */
export function mapSizeToTier(
  width: number,
  height: number
): { size: SizeTier; ratio: AspectRatio } {
  const w = Number.isFinite(width) && width > 0 ? width : 1024;
  const h = Number.isFinite(height) && height > 0 ? height : 1024;

  const targetBase = Math.sqrt(w * h);
  const size = TIERS.reduce((best, tier) =>
    Math.abs(TIER_BASE[tier] - targetBase) <
    Math.abs(TIER_BASE[best] - targetBase)
      ? tier
      : best
  );

  const wanted = Math.log(w / h);
  const ratio = RATIOS.reduce((best, candidate) =>
    Math.abs(Math.log(candidate.value) - wanted) <
    Math.abs(Math.log(best.value) - wanted)
      ? candidate
      : best
  ).ratio;

  return { size, ratio };
}

/** How a failed provider call should be handled by the retry loop. */
export type FailureKind = "retry" | "terminal";

/**
 * Classify an HTTP status into the existing cooldown decision: retryable
 * failures park the key and try the next one; terminal failures (a request
 * the provider will always reject) surface immediately instead of burning
 * the remaining credentials.
 */
export function classifyOpenAIFailure(status: number): FailureKind {
  if (status === 401 || status === 403) return "retry";
  if (status === 408 || status === 425 || status === 429) return "retry";
  if (status >= 500) return "retry";
  return "terminal";
}

/**
 * A provider failure tagged with its retry classification. Transport-level
 * failures (non-2xx, network errors, malformed envelopes) are Errors naming
 * the credential stage; the tag is what the loop reads.
 */
export class OpenAITransportError extends Error {
  readonly kind: FailureKind;

  constructor(message: string, kind: FailureKind) {
    super(message);
    this.name = "OpenAITransportError";
    this.kind = kind;
  }
}

export interface OpenAITransportOptions {
  /** Shared credential pool (#72); it owns key selection. */
  pool: ProviderPool;
  /** Endpoint override; defaults to the bound provider's base URL. */
  baseUrl?: string;
}

const DEFAULT_SIZE = "1024x1024";

/**
 * Read the caller's requested pixel size from the CF-shaped payload: prefer
 * numeric width/height when both are present, else the WxH `size` string,
 * else the documented default.
 */
function readRequestedSize(payload: Record<string, any>): {
  width: number;
  height: number;
} {
  const width = Number(payload.width);
  const height = Number(payload.height);
  if (
    Number.isFinite(width) &&
    width > 0 &&
    Number.isFinite(height) &&
    height > 0
  ) {
    return { width, height };
  }
  if (typeof payload.size === "string") {
    const match = payload.size.match(/^(\d+)x(\d+)$/);
    if (match) {
      return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }
  }
  const [w, h] = DEFAULT_SIZE.split("x").map(Number);
  return { width: w, height: h };
}

/**
 * Pass input images through in the form the caller supplied them: public
 * URLs and data-URIs are sent verbatim, raw base64 is wrapped as a
 * data-URI. The `images` argument wins; a single `payload.image` is the
 * fallback for paths that build the payload directly.
 */
function normalizeInputImages(
  images: string[] | undefined,
  payloadImage: unknown
): string[] {
  const list =
    images && images.length > 0
      ? images
      : typeof payloadImage === "string"
        ? [payloadImage]
        : [];
  return list.map((img) => {
    if (/^https?:\/\//i.test(img)) return img;
    if (/^data:/i.test(img)) return img;
    return `data:image/png;base64,${cleanBase64(img)}`;
  });
}

/**
 * Build the Agnes request body from the CF-shaped payload. Text-to-image
 * asks for base64 via return_base64; image-to-image asks for it through
 * extra_body.response_format. Input images (URL or data-URI) ride in
 * extra_body.image.
 */
export function buildAgnesRequestBody(
  model: ModelConfig,
  payload: Record<string, any>,
  images?: string[]
): Record<string, any> {
  const { width, height } = readRequestedSize(payload);
  const { size, ratio } = mapSizeToTier(width, height);

  const body: Record<string, any> = {
    // Upstream name is the registry id without its namespace: the model is
    // "@agnes/agnes-image-2.5-flash" here and "agnes-image-2.5-flash" there.
    model: model.id.replace(/^@[^/]+\//, ""),
    prompt:
      typeof payload.prompt === "string"
        ? payload.prompt
        : String(payload.prompt ?? ""),
    size,
    ratio,
  };

  const inputImages = normalizeInputImages(images, payload.image);
  const extraBody: Record<string, any> = { response_format: "b64_json" };
  if (inputImages.length > 0) {
    extraBody.image = inputImages;
  } else {
    body.return_base64 = true;
  }
  body.extra_body = extraBody;

  return body;
}

/**
 * Production transport for OpenAI-compatible image providers. Credential
 * selection belongs to the provider's pool (ADR-001): a key that fails
 * retryably is parked there, so the next request starts elsewhere.
 */
export class OpenAITransport implements AITransport {
  private readonly baseUrl: string;
  private readonly pool: ProviderPool;

  constructor(options: OpenAITransportOptions) {
    this.baseUrl = (options.baseUrl ?? AGNES_API_BASE_URL).replace(/\/+$/, "");
    this.pool = options.pool;
  }

  async run(
    _modelId: string,
    payload: Record<string, any>,
    model: ModelConfig,
    images?: string[]
  ): Promise<unknown> {
    const body = buildAgnesRequestBody(model, payload, images);
    const url = `${this.baseUrl}/v1/images/generations`;
    return await this.runPooled(url, body);
  }

  /**
   * Pool-driven attempts (#72): each failure parks its key on the shared
   * pool so later requests start elsewhere, but only retryable failures do
   * so — a terminal failure is surfaced without touching the other keys.
   */
  private async runPooled(
    url: string,
    body: Record<string, any>
  ): Promise<unknown> {
    // Safety bound: a pick always parks its key on failure, so pick() goes
    // null within labels().length attempts in practice.
    let lastError: unknown = null;
    const maxAttempts = this.pool.labels().length + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const pick = this.pool.pick();
      if (!pick) break;
      try {
        return await this.attemptOnce(url, pick.apiToken, pick.label, body);
      } catch (error) {
        if (
          error instanceof OpenAITransportError &&
          error.kind === "terminal"
        ) {
          throw error;
        }
        lastError = error;
        this.pool.reportFailure(pick.label, Date.now());
        console.warn(
          `Agnes request failed [credential: ${pick.label}], parking key and trying another`
        );
      }
    }

    throw lastError ?? new Error("provider pool: no servable credential");
  }

  private async attemptOnce(
    url: string,
    apiKey: string,
    credentialTag: string,
    body: Record<string, any>
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OpenAITransportError(
        `Agnes API request failed [credential: ${credentialTag}]: ${this.scrub(message, apiKey)}`,
        "retry"
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new OpenAITransportError(
        `Agnes API error (${response.status}) [credential: ${credentialTag}]: ${this.scrub(errorText, apiKey)}`,
        classifyOpenAIFailure(response.status)
      );
    }

    let json: any;
    try {
      json = await response.json();
    } catch {
      throw new OpenAITransportError(
        `Agnes API returned invalid JSON [credential: ${credentialTag}]`,
        "retry"
      );
    }

    const item = Array.isArray(json?.data) ? json.data[0] : undefined;
    if (!item) {
      throw new OpenAITransportError(
        "Agnes API response contained no image data",
        "retry"
      );
    }
    if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
      return { image: item.b64_json };
    }
    if (typeof item.url === "string" && item.url.length > 0) {
      const imageResponse = await fetch(item.url);
      if (!imageResponse.ok) {
        throw new OpenAITransportError(
          `Agnes image download failed (${imageResponse.status})`,
          "retry"
        );
      }
      return { image: new Uint8Array(await imageResponse.arrayBuffer()) };
    }
    throw new OpenAITransportError(
      "Agnes API response contained no image URL or base64",
      "retry"
    );
  }

  /**
   * Strip the credential value from upstream text before it enters an
   * Error: non-2xx bodies travel into the service envelope (and endpoint
   * responses and logs), so a key echoed by the provider must die here.
   */
  private scrub(text: string, apiKey: string): string {
    if (!apiKey) return text;
    // The upstream body reaches callers, so redact every form a provider
    // could echo back: the literal value, its URL-encoded form, its
    // JSON-escaped form (quotes and backslashes), and the escaped slash some
    // serializers emit where JSON.stringify leaves the slash alone.
    let out = text;
    const variants = [
      apiKey,
      encodeURIComponent(apiKey),
      JSON.stringify(apiKey).slice(1, -1),
      apiKey.replace(/\//g, "\\/"),
    ];
    for (const variant of variants) {
      out = out.split(variant).join("[redacted]");
    }
    return out;
  }
}
