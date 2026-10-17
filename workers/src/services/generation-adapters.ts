// ============================================================================
// Generation adapters - injected Cloudflare REST + R2 seams
// ============================================================================
// The image generator talks to Cloudflare inference and image persistence
// only through these two interfaces. Production wires the real adapters
// (REST transport over fetch, R2 storage over the IMAGE_BUCKET binding);
// tests inject in-memory doubles. Credential selection stays with the
// service; the transport only executes calls with the accounts it is given.

import type { AIAccount, ModelConfig } from "../types.js";
import type { ProviderPool } from "./provider-pool.js";
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
 * Production transport: Cloudflare Workers AI via REST API. Accounts come
 * from database-only credential management (ADR-001); that is the only
 * remaining source, so the credential tag is a literal rather than a label
 * carried on the instance.
 */
export class RestAITransport implements AITransport {
  private aiAccounts: AIAccount[];
  private pool?: ProviderPool;

  constructor(accounts: AIAccount[], pool?: ProviderPool) {
    this.aiAccounts = accounts;
    this.pool = pool;
  }

  async run(
    modelId: string,
    payload: Record<string, any>,
    model: ModelConfig,
    images?: string[]
  ): Promise<unknown> {
    const { pool } = this;
    if (pool) {
      return await this.runPooled(pool, modelId, payload, model, images);
    }

    // Failover: try each configured account in turn (starting at a random
    // offset for load distribution); only the last failure is thrown.
    const start = Math.floor(Math.random() * this.aiAccounts.length);
    let lastError: unknown = null;

    for (let attempt = 0; attempt < this.aiAccounts.length; attempt++) {
      const index = (start + attempt) % this.aiAccounts.length;
      const account = this.aiAccounts[index];
      // Credential source tag for observability (never a secret value).
      const credentialTag = `D1[${index}]`;
      const url = `https://api.cloudflare.com/client/v4/accounts/${account.account_id}/ai/run/${modelId}`;

      try {
        return await this.runWithAccount(
          url,
          account,
          credentialTag,
          payload,
          model,
          images
        );
      } catch (error) {
        lastError = error;
        console.warn(
          `AI request failed [credential: ${credentialTag}], trying next account (${attempt + 1}/${this.aiAccounts.length})`
        );
      }
    }

    // Zero accounts means nothing was attempted: without this fallback the
    // bare `throw lastError` throws null, and the endpoint envelope turns
    // that into the literal string "null" (ADR-001 empty-credential path).
    throw (
      lastError ??
      new Error(
        "No AI provider credentials configured. Add credentials via admin UI at /#admin"
      )
    );
  }

  /**
   * Pool-driven attempts (#72): the weighted pick chooses every attempt's
   * credential, and each failure parks that key on the shared, isolate-
   * cached pool so later requests start elsewhere. pick() returns null
   * once every key is cooled down, which bounds the loop; only the last
   * failure is thrown.
   */
  private async runPooled(
    pool: ProviderPool,
    modelId: string,
    payload: Record<string, any>,
    model: ModelConfig,
    images?: string[]
  ): Promise<unknown> {
    let lastError: unknown = null;
    // Safety bound: a pick always parks its key on failure, so pick()
    // goes null within labels().length attempts in practice.
    const maxAttempts = pool.labels().length + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const pick = pool.pick();
      if (!pick) break;
      const url = `https://api.cloudflare.com/client/v4/accounts/${pick.accountId}/ai/run/${modelId}`;
      try {
        return await this.runWithAccount(
          url,
          { account_id: pick.accountId, api_token: pick.apiToken },
          // The label is the only observability tag: account ids and
          // tokens never reach the logs.
          pick.label,
          payload,
          model,
          images
        );
      } catch (error) {
        lastError = error;
        pool.reportFailure(pick.label, Date.now());
        console.warn(
          `AI request failed [credential: ${pick.label}], parking key and trying another`
        );
      }
    }

    throw lastError ?? new Error("provider pool: no servable credential");
  }

  /**
   * Strip credential values this transport was constructed with from
   * upstream text before it enters an Error: operational failures travel
   * verbatim into the service envelope (and from there into endpoint
   * responses and logs), so a token echoed by an upstream body must die
   * here. Shape is unchanged when no secret is embedded (pinned by
   * contract tests). Empty values are skipped — splitting on "" would
   * shred the string.
   */
  private scrubSecrets(text: string): string {
    let out = text;
    for (const account of this.aiAccounts) {
      if (account.api_token) {
        out = out.split(account.api_token).join("[redacted]");
      }
      if (account.account_id) {
        out = out.split(account.account_id).join("[redacted]");
      }
    }
    return out;
  }

  private async runWithAccount(
    url: string,
    account: AIAccount,
    credentialTag: string,
    payload: Record<string, any>,
    model: ModelConfig,
    images?: string[]
  ): Promise<unknown> {
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
        `Cloudflare AI API error (${response.status}) [credential: ${credentialTag}]: ${this.scrubSecrets(errorText)}`
      );
    }

    // Determine response type from content-type header
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      // JSON response — may contain { result: { image: "base64..." } } or { result: "base64..." }
      // Parse failures are operational (upstream), so rethrow as plain
      // Error: a raw SyntaxError here would be misclassified as malformed
      // caller JSON by the endpoint's handle() catch.
      let json: any;
      try {
        json = await response.json();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Cloudflare AI API returned unparseable JSON [credential: ${credentialTag}]: ${this.scrubSecrets(detail)}`
        );
      }
      // Cloudflare REST API wraps result in { result: ... }
      return json.result !== undefined ? json.result : json;
    }

    // Binary response (image/png, application/octet-stream, etc.)
    return await response.arrayBuffer();
  }
}
