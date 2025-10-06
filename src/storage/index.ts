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
      bucket: 'cloudflare-image-mcp',
      region: 'auto'
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

  return config;
}