// ============================================================================
// S3 Storage Provider - R2 and S3 compatible storage
// ============================================================================

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, StorageConfig, StorageResult } from '../types.js';

export interface S3StorageConfig extends StorageConfig {
  /** Optional: Days until object expiration (R2 lifecycle) */
  expiresInDays?: number;
}

/**
 * Create an S3/R2 storage provider
 * @param config - Storage configuration
 * @returns Storage provider instance
 */
export function createS3StorageProvider(config: S3StorageConfig): StorageProvider {
  // Create S3 client
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

  const bucket = config.bucket;
  const cdnUrl = config.cdnUrl.replace(/\/$/, ''); // Remove trailing slash

  /**
   * Generate a unique image ID
   */
  function generateImageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random}`;
  }

  /**
   * Parse dimensions from size string (e.g., "1024x1024")
   */
  function parseDimensions(size?: string): { width: number; height: number } | null {
    if (!size) return null;
    const match = size.match(/^(\d+)x(\d+)$/);
    if (!match) return null;
    return { width: parseInt(match[1]), height: parseInt(match[2]) };
  }

  return {
    async uploadImage(
      base64Data: string,
      metadata: Record<string, string>
    ): Promise<StorageResult> {
      try {
        const imageId = generateImageId();
        const dimensions = parseDimensions(metadata.size);
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');

        // Determine key structure
        const key = `images/${year}/${month}/${imageId}.png`;

        // Decode base64 and upload
        const imageBuffer = Buffer.from(base64Data, 'base64');

        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: imageBuffer,
          ContentType: 'image/png',
          Metadata: {
            ...metadata,
            createdAt: new Date().toISOString(),
          },
        });

        await client.send(command);

        const url = `${cdnUrl}/${key}`;

        return {
          success: true,
          url,
          id: imageId,
        };
      } catch (error) {
        console.error('Upload error:', error);
        return {
          success: false,
          error: `Failed to upload image: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    async deleteImage(id: string): Promise<boolean> {
      try {
        // Find the image by ID
        const listCommand = new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `images/`,
        });

        const response = await client.send(listCommand);

        const matchingKey = response.Contents?.find((obj) =>
          obj.Key?.includes(`-${id}.png`) || obj.Key?.endsWith(`/${id}.png`)
        )?.Key;

        if (!matchingKey) {
          return false;
        }

        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucket,
          Key: matchingKey,
        });

        await client.send(deleteCommand);
        return true;
      } catch (error) {
        console.error('Delete error:', error);
        return false;
      }
    },

    async cleanupExpired(): Promise<number> {
      // Note: For R2, expiration should be configured via lifecycle rules
      // This method can be used for manual cleanup if needed
      let deleted = 0;

      try {
        const listCommand = new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: 'images/',
        });

        const response = await client.send(listCommand);

        if (response.Contents) {
          const now = Date.now();
          const expiryMs = (config.expiresInDays || 1) * 24 * 60 * 60 * 1000;

          for (const obj of response.Contents) {
            if (obj.Key && obj.LastModified) {
              const ageMs = now - obj.LastModified.getTime();
              if (ageMs > expiryMs) {
                const deleteCommand = new DeleteObjectCommand({
                  Bucket: bucket,
                  Key: obj.Key,
                });
                await client.send(deleteCommand);
                deleted++;
              }
            }
          }
        }
      } catch (error) {
        console.error('Cleanup error:', error);
      }

      return deleted;
    },

    async listImages(prefix?: string): Promise<string[]> {
      try {
        const listCommand = new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix || 'images/',
        });

        const response = await client.send(listCommand);

        return response.Contents?.map((obj) => {
          const key = obj.Key || '';
          const match = key.match(/images\/\d+\/\d+\/([^.]+)\.png/);
          return match ? match[1] : key;
        }) || [];
      } catch (error) {
        console.error('List error:', error);
        return [];
      }
    },
  };
}
