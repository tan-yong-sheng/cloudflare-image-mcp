// Import types
import type { StorageConfig } from './types.js';

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
      bucket: 'default-bucket',
      region: 'us-east-1',
      cleanup: {
        enabled: false,
        olderThanDays: undefined,
        keepCount: undefined,
        runOnSave: false
      }
    }
  }
};

// Environment variable configuration
export function createConfigFromEnv(): StorageConfig {
  const config = { ...DEFAULT_STORAGE_CONFIG };

  // S3 configuration from environment variables
  config.providers.s3 = {
    bucket: process.env.S3_BUCKET || 'default-bucket',
    region: process.env.S3_REGION || 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    endpoint: process.env.S3_ENDPOINT,
    cdnUrl: process.env.S3_CDN_URL
  };

  // S3 storage cleanup configuration from environment variables
  const cleanupEnabled = process.env.IMAGE_CLEANUP_ENABLED === 'true';
  const olderThanDays = process.env.IMAGE_CLEANUP_OLDER_THAN_DAYS ?
    parseInt(process.env.IMAGE_CLEANUP_OLDER_THAN_DAYS, 10) : undefined;
  const keepCount = process.env.IMAGE_CLEANUP_KEEP_COUNT ?
    parseInt(process.env.IMAGE_CLEANUP_KEEP_COUNT, 10) : undefined;
  const runOnSave = process.env.IMAGE_CLEANUP_RUN_ON_SAVE === 'true';

  if (cleanupEnabled) {
    config.providers.s3.cleanup = {
      enabled: cleanupEnabled,
      olderThanDays,
      keepCount,
      runOnSave
    };
  }

  return config;
}