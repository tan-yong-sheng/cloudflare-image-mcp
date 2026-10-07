// ============================================================================
// Generation adapters - injected Cloudflare REST + R2 seams
// ============================================================================
// The image generator talks to Cloudflare inference and image persistence
// only through these two interfaces. Production wires the real adapters
// (REST transport over fetch, R2 storage over the IMAGE_BUCKET binding);
// tests inject in-memory doubles. Credential selection stays with the
// service; the transport only executes calls with the accounts it is given.

import type { AIAccount, ModelConfig } from "../types.js";
import { base64ToUint8Array, cleanBase64 } from "../utils/encoding.js";

/**
 * Cloudflare Workers AI transport: run one model call, return the raw
 * result (base64 envelope, binary bytes, or stream) for the service to
 * interpret. Never throws for model-level outcomes; transport failures
 * (non-2xx) throw plain Errors naming the failing credential stage.
 */
export interface AITransport {
  run(
    modelId: string,
    payload: Record<string, any>,
    model: ModelConfig,
    images?: string[]
  ): Promise<unknown>;
}

/**
 * Image persistence: store finished bytes, return a retrievable reference.
 * Implemented by R2StorageService in production (structurally compatible),
 * in-memory in tests.
 */
export interface ImageStore {
  uploadImage(
    imageData: string | ArrayBuffer,
    metadata: { model: string; prompt: string; parameters?: object }
  ): Promise<{ id: string; url: string; expiresAt: number }>;
  cleanupExpired(): Promise<number>;
}

/**
 * Production transport: Cloudflare Workers AI via REST API.
 * Accounts (and the observability-only credential source label) come from
 * the service, which owns AI_ACCOUNTS parsing and fallback.
 */
export class RestAITransport implements AITransport {
  private aiAccounts: AIAccount[];
  private credentialSource: "AI_ACCOUNTS" | "fallback";

  constructor(
    accounts: AIAccount[],
    credentialSource: "AI_ACCOUNTS" | "fallback" = "fallback"
  ) {
    this.aiAccounts = accounts;
    this.credentialSource = credentialSource;
  }

  /**
   * Pick a random AI account for load distribution
   */
  private pickAccount(): { account: AIAccount; index: number } {
    const index = Math.floor(Math.random() * this.aiAccounts.length);
    return { account: this.aiAccounts[index], index };
  }

  async run(
    modelId: string,
    payload: Record<string, any>,
    model: ModelConfig,
    images?: string[]
  ): Promise<unknown> {
    const { account, index } = this.pickAccount();
    // Credential source tag for observability (never a secret value).
    const credentialTag =
      this.credentialSource === "AI_ACCOUNTS"
        ? `AI_ACCOUNTS[${index}]`
        : "fallback deploy credential";
    const url = `https://api.cloudflare.com/client/v4/accounts/${account.account_id}/ai/run/${modelId}`;

    let response: Response;

    if (model.inputFormat === "multipart") {
      // Multipart form data (FLUX 2 models)
      const form = new FormData();
      for (const [key, value] of Object.entries(payload)) {
        if (value !== undefined && value !== null && key !== "image") {
          form.append(key, String(value));
        }
      }

      // Append image(s) as binary blobs if provided
      if (images && images.length > 0) {
        for (const img of images) {
          const cleanedB64 = cleanBase64(img);
          const bytes = base64ToUint8Array(cleanedB64);
          form.append(
            "image",
            new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" })
          );
        }
      } else if (
        payload.image &&
        typeof payload.image === "string" &&
        payload.image.length > 100
      ) {
        // Single image in payload (text-to-image with image param)
        const cleanedB64 = cleanBase64(payload.image);
        const bytes = base64ToUint8Array(cleanedB64);
        form.append(
          "image",
          new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" })
        );
      }

      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.api_token}`,
        },
        body: form,
      });
    } else {
      // JSON format
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.api_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Cloudflare AI API error (${response.status}) [credential: ${credentialTag}]: ${errorText}`
      );
    }

    // Determine response type from content-type header
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      // JSON response — may contain { result: { image: "base64..." } } or { result: "base64..." }
      const json = (await response.json()) as any;
      // Cloudflare REST API wraps result in { result: ... }
      return json.result !== undefined ? json.result : json;
    }

    // Binary response (image/png, application/octet-stream, etc.)
    return await response.arrayBuffer();
  }
}
