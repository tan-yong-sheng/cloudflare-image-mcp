// ============================================================================
// R2 Storage Service - Upload, retrieve, and manage generated images
// Auto-delete after configured expiry period
// ============================================================================

import type { Env, ImageMetadata } from '../types.js';

export class R2StorageService {
  private bucket: R2Bucket;
  private expiryHours: number;
  private cdnUrl: string;
  private accountId: string;
  private timezone: string;
  private bucketName: string;
  private apiToken: string;

  constructor(env: Env) {
    this.bucket = env.IMAGE_BUCKET;
    this.expiryHours = parseInt(env.IMAGE_EXPIRY_HOURS || '24', 10);
    this.accountId = env.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = env.CLOUDFLARE_API_TOKEN;
    this.bucketName = env.BUCKET_NAME || '';
    // Default to UTC if TZ is not set
    this.timezone = env.TZ || 'UTC';

    // Auto-detect CDN URL if not provided
    this.cdnUrl = env.S3_CDN_URL || '';
  }

  /**
   * Get or fetch the public CDN URL for the R2 bucket
   * If S3_CDN_URL is not set, fetch it from Cloudflare API
   */
  private async getCdnUrl(): Promise<string> {
    if (this.cdnUrl) {
      return this.cdnUrl;
    }

    // If bucket name is not available, we can't fetch the CDN URL
    if (!this.bucketName) {
      console.warn('BUCKET_NAME not set, using worker proxy URLs instead of CDN');
      return '';
    }

    try {
      // Fetch R2 public domain configuration from Cloudflare API
      // The public domain is managed via cloudflare_r2_managed_domain resource
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/r2/buckets/${this.bucketName}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json() as any;
        // Check if public access is enabled (R2 managed domain)
        // The public URL format is: https://pub-{hash}.r2.dev
        // Try to get it from the bucket location and construct it
        const bucketName = data.result?.name;
        if (bucketName) {
          // Note: The actual public domain hash is not available via API
          // We need to construct it or get it from Terraform outputs
          // For now, log and return empty to fall back to worker proxy
          console.log(`Bucket found: ${bucketName}, but public domain not available via API`);
          console.log('Tip: Set S3_CDN_URL secret manually for full CDN URLs');
        }
      }
    } catch (error) {
      console.error('Failed to auto-detect CDN URL:', error);
    }

    // Fallback to empty string (will use worker proxy)
    return '';
  }

  /**
   * Upload generated image to R2
   */
  async uploadImage(
    imageData: string | ArrayBuffer,
    metadata: Omit<ImageMetadata, 'id' | 'expiresAt' | 'createdAt'>
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
    if (typeof imageData === 'string') {
      // Check if it's a data URI
      if (imageData.startsWith('data:')) {
        const base64 = imageData.split(',')[1];
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
        contentType: 'image/png',
        cacheControl: `public, max-age=${this.expiryHours * 3600}`,
      },
      customMetadata: {
        model: fullMetadata.model,
        prompt: fullMetadata.prompt.substring(0, 500), // Truncate for metadata
        createdAt: String(fullMetadata.createdAt),
        expiresAt: String(fullMetadata.expiresAt),
      },
    });

    // Generate URL - try to get CDN URL (auto-detect if not configured), otherwise fall back to worker proxy
    const cdnUrl = await this.getCdnUrl();
    const url = cdnUrl ? `${cdnUrl}/${key}` : `/${key}`;

    return { id, url, expiresAt };
  }

  /**
   * Retrieve image metadata
   */
  async getImage(id: string): Promise<{ metadata: ImageMetadata; data: ArrayBuffer } | null> {
    // Search for the image (note: in production, you'd want an index)
    const listed = await this.bucket.list({
      prefix: 'images/',
      limit: 100,
    });

    const matchingObject = listed.objects.find((obj) => obj.key.includes(id));
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
   * Delete expired images
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    let deleted = 0;
    let cursor: string | undefined = undefined;

    do {
      const listOptions: R2ListOptions = {
        prefix: 'images/',
        limit: 1000,
      };
      if (cursor) {
        listOptions.cursor = cursor;
      }

      const listed = await this.bucket.list(listOptions);

      const expiredKeys: string[] = [];

      for (const obj of listed.objects) {
        const custom = obj.customMetadata || {};
        const expiresAt = parseInt(custom.expiresAt, 10);

        if (expiresAt < now) {
          expiredKeys.push(obj.key);
        }
      }

      if (expiredKeys.length > 0) {
        await this.bucket.delete(expiredKeys);
        deleted += expiredKeys.length;
      }

      // Handle cursor for truncated results
      if (listed.truncated && 'cursor' in listed) {
        cursor = (listed as any).cursor;
      } else {
        cursor = undefined;
      }
    } while (cursor !== undefined);

    return deleted;
  }

  /**
   * List all images (with pagination)
   */
  async listImages(options: { limit?: number; prefix?: string } = {}): Promise<{
    images: Array<{ id: string; url: string; createdAt: number; expiresAt: number }>;
    truncated: boolean;
    cursor?: string;
  }> {
    const listOptions: R2ListOptions = {
      prefix: options.prefix || 'images/',
      limit: options.limit || 100,
    };

    const listed = await this.bucket.list(listOptions);

    // Get CDN URL once for all images
    const cdnUrl = await this.getCdnUrl();

    const images = listed.objects.map((obj) => {
      const custom = obj.customMetadata || {};
      const id = this.extractIdFromKey(obj.key);

      // Generate URL - use CDN URL if available, otherwise fall back to worker proxy
      const url = cdnUrl ? `${cdnUrl}/${obj.key}` : `/${obj.key}`;

      return {
        id,
        url,
        createdAt: parseInt(custom.createdAt, 10),
        expiresAt: parseInt(custom.expiresAt, 10),
      };
    });

    // Handle cursor for truncated results
    let cursor: string | undefined = undefined;
    if (listed.truncated && 'cursor' in listed) {
      cursor = (listed as any).cursor;
    }

    return {
      images,
      truncated: listed.truncated,
      cursor,
    };
  }

  /**
   * Delete a specific image
   */
  async deleteImage(id: string): Promise<boolean> {
    const listed = await this.bucket.list({
      prefix: 'images/',
      limit: 100,
    });

    const matchingObject = listed.objects.find((obj) => obj.key.includes(id));
    if (!matchingObject) {
      return false;
    }

    await this.bucket.delete(matchingObject.key);
    return true;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalImages: number;
    totalSize: number;
    oldestImage?: number;
    newestImage?: number;
  }> {
    let total = 0;
    let size = 0;
    let oldest: number | undefined;
    let newest: number | undefined;
    let cursor: string | undefined = undefined;

    do {
      const listOptions: R2ListOptions = {
        prefix: 'images/',
        limit: 1000,
      };
      if (cursor) {
        listOptions.cursor = cursor;
      }

      const listed = await this.bucket.list(listOptions);

      for (const obj of listed.objects) {
        total++;
        size += obj.size;

        const custom = obj.customMetadata || {};
        const createdAt = parseInt(custom.createdAt, 10);

        if (!oldest || createdAt < oldest) oldest = createdAt;
        if (!newest || createdAt > newest) newest = createdAt;
      }

      // Handle cursor for truncated results
      if (listed.truncated && 'cursor' in listed) {
        cursor = (listed as any).cursor;
      } else {
        cursor = undefined;
      }
    } while (cursor !== undefined);

    return { totalImages: total, totalSize: size, oldestImage: oldest, newestImage: newest };
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
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: this.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      const parts = formatter.formatToParts(new Date(timestamp));
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;

      return `${year}-${month}-${day}`;
    } catch (err) {
      // Fallback to UTC if timezone is invalid
      console.error(`Invalid timezone "${this.timezone}", falling back to UTC:`, err);
      return new Date(timestamp).toISOString().split('T')[0];
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
