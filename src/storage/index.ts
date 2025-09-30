// Import types
import type { StorageConfig } from './types.js';
import { parseDurationString } from './duration-parser.js';

// Factory exports
export {
  StorageFactory,
  createStorage,
  createS3Storage
} from './factory.js';

// Provider exports
export { BaseStorageProvider } from './providers/base-provider.js';
export { S3StorageProvider } from './providers/s3-provider.js';

// Default configuration
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  defaultProvider: 's3',
  providers: {
    s3: {
      bucket: 'cloudflare-image-mcp',
      region: 'auto',
      cleanup: {
        enabled: false,
        olderThan: undefined
      }
    }
  }
};

// Environment variable configuration
export function createConfigFromEnv(): StorageConfig {
  const config = { ...DEFAULT_STORAGE_CONFIG };

  // S3 configuration from environment variables
  config.providers.s3 = {
    bucket: process.env.S3_BUCKET || 'cloudflare-image-mcp',
    region: process.env.S3_REGION || 'auto',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    endpoint: process.env.S3_ENDPOINT,
    cdnUrl: process.env.S3_CDN_URL
  };

  // S3 storage cleanup configuration from environment variables
  const cleanupEnabled = process.env.IMAGE_CLEANUP_ENABLED === 'true';
  const olderThan = process.env.IMAGE_CLEANUP_OLDER_THAN;

  let parsedOlderThan: string | undefined;
  if (olderThan) {
    try {
      const duration = parseDurationString(olderThan);
      const cutoffDate = new Date(Date.now() - duration.milliseconds);
      parsedOlderThan = cutoffDate.toISOString();
    } catch (error) {
      throw new Error(`Invalid IMAGE_CLEANUP_OLDER_THAN value: "${olderThan}". ${error instanceof Error ? error.message : 'Invalid duration format'}`);
    }
  }

  if (cleanupEnabled) {
    config.providers.s3.cleanup = {
      enabled: cleanupEnabled,
      olderThan: parsedOlderThan
    };
  }

  return config;
}