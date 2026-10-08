// ============================================================================
// R2 Storage Service - Upload, resolve, and clean up generated images
// Auto-delete after configured expiry period
// ============================================================================

import type { Env, ImageMetadata } from "../types.js";

export class R2StorageService {
  private bucket: R2Bucket;
  private expiryHours: number;
  private timezone: string;

  constructor(env: Env) {
    this.bucket = env.IMAGE_BUCKET;
    this.expiryHours = parseInt(env.IMAGE_EXPIRY_HOURS || "24", 10);
    // Default to UTC if TZ is not set
    this.timezone = env.TZ || "UTC";
  }

  /**
   * Upload generated image to R2. Returns its id, URL, and expiry.
   */
  async uploadImage(
    imageData: string | ArrayBuffer,
    metadata: Omit<ImageMetadata, "id" | "expiresAt" | "createdAt">
  ): Promise<{ id: string; url: string; expiresAt: number }> {
    const id = this.generateId();
    const timestamp = Date.now();
    const expiresAt = timestamp + this.expiryHours * 60 * 60 * 1000;

    const fullMetadata: ImageMetadata = {
      ...metadata,
      id,
      createdAt: timestamp,
      expiresAt,
    };

    // Convert base64 to ArrayBuffer if needed
    let body: ArrayBuffer;
    if (typeof imageData === "string") {
      // Check if it's a data URI
      if (imageData.startsWith("data:")) {
        const base64 = imageData.split(",")[1];
        body = this.base64ToArrayBuffer(base64);
      } else {
        body = this.base64ToArrayBuffer(imageData);
      }
    } else {
      body = imageData;
    }

    // Generate key with date-based prefix for organization (timezone-aware)
    const datePrefix = this.getDatePrefix(timestamp);
    const key = `images/${datePrefix}/${id}.png`;

    // Upload to R2
    await this.bucket.put(key, body, {
      httpMetadata: {
        contentType: "image/png",
        cacheControl: `public, max-age=${this.expiryHours * 3600}`,
      },
      customMetadata: {
        model: fullMetadata.model,
        prompt: fullMetadata.prompt.substring(0, 500), // Truncate for metadata
        createdAt: String(fullMetadata.createdAt),
        expiresAt: String(fullMetadata.expiresAt),
      },
    });

    // Generate URL - use worker proxy URL
    const url = `/${key}`;

    return { id, url, expiresAt };
  }

  /**
   * Resolve one image by exact id. The id is the full key suffix
   * (images/<date>/<id>.png); substring matches never resolve.
   */
  async resolveImage(
    id: string
  ): Promise<{ metadata: ImageMetadata; data: ArrayBuffer } | null> {
    // Search for the image (note: in production, you'd want an index)
    const listed = await this.bucket.list({
      prefix: "images/",
      limit: 100,
    });

    const matchingObject = listed.objects.find(
      (obj) => this.extractIdFromKey(obj.key) === id
    );
    if (!matchingObject) {
      return null;
    }

    const object = await this.bucket.get(matchingObject.key);
    if (!object) {
      return null;
    }

    const custom = object.customMetadata || {};
    const metadata: ImageMetadata = {
      id,
      model: custom.model,
      prompt: custom.prompt,
      createdAt: parseInt(custom.createdAt, 10),
      expiresAt: parseInt(custom.expiresAt, 10),
      parameters: {},
    };

    return {
      metadata,
      data: await object.arrayBuffer(),
    };
  }

  /**
   * Delete expired images. Objects with missing or invalid expiry
   * timestamps are skipped so corrupt metadata cannot delete live data.
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    let deleted = 0;
    let cursor: string | undefined = undefined;

    do {
      const listOptions: R2ListOptions = {
        prefix: "images/",
        limit: 1000,
      };
      if (cursor) {
        listOptions.cursor = cursor;
      }

      const listed = await this.bucket.list(listOptions);

      const expiredKeys: string[] = [];

      for (const obj of listed.objects) {
        const custom = obj.customMetadata || {};
        // Number(), not parseInt: a corrupt "0garbage" timestamp must not
        // parse as 0 and get deleted — the guard keeps anything that is
        // not a finite integer expiry. Trim first: whitespace-only
        // metadata ("   ") would otherwise become 0 and get deleted.
        const expiresAtText = (custom.expiresAt ?? "").trim();
        const expiresAt = expiresAtText ? Number(expiresAtText) : NaN;

        // Guard: missing or unparseable expiry is kept, never deleted.
        if (!Number.isInteger(expiresAt)) {
          continue;
        }

        if (expiresAt < now) {
          expiredKeys.push(obj.key);
        }
      }

      if (expiredKeys.length > 0) {
        await this.bucket.delete(expiredKeys);
        deleted += expiredKeys.length;
      }

      // Handle cursor for truncated results
      if (listed.truncated && "cursor" in listed) {
        cursor = (listed as any).cursor;
      } else {
        cursor = undefined;
      }
    } while (cursor !== undefined);

    return deleted;
  }

  // ===== Helper Methods =====

  /**
   * Get date prefix for folder organization (timezone-aware)
   * @param timestamp Unix timestamp in milliseconds
   * @returns Date string in YYYY-MM-DD format in configured timezone
   */
  private getDatePrefix(timestamp: number): string {
    try {
      // Use Intl.DateTimeFormat for timezone support
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: this.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const parts = formatter.formatToParts(new Date(timestamp));
      const year = parts.find((p) => p.type === "year")?.value;
      const month = parts.find((p) => p.type === "month")?.value;
      const day = parts.find((p) => p.type === "day")?.value;

      return `${year}-${month}-${day}`;
    } catch (err) {
      // Fallback to UTC if timezone is invalid
      console.error(
        `Invalid timezone "${this.timezone}", falling back to UTC:`,
        err
      );
      return new Date(timestamp).toISOString().split("T")[0];
    }
  }

  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
  }

  private extractIdFromKey(key: string): string {
    // Extract ID from key like "images/2024-01-26/abc123-xyz789.png"
    const match = key.match(/images\/[\d-]+\/([^.]+)\.png/);
    return match ? match[1] : key;
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
