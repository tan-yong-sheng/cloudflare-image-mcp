import { StorageProvider, StorageConfig, CreateStorageResult } from './types.js';
import { S3StorageProvider } from './providers/s3-provider.js';

export class StorageFactory {
  private static instance: StorageFactory;
  private providers: Map<string, StorageProvider> = new Map();

  static getInstance(): StorageFactory {
    if (!StorageFactory.instance) {
      StorageFactory.instance = new StorageFactory();
    }
    return StorageFactory.instance;
  }

  createStorage(config: StorageConfig): CreateStorageResult {
    const provider = this.createProvider(config.defaultProvider, config.providers[config.defaultProvider]);

    return {
      provider,
      config
    };
  }

  createProvider(type: string, config: Record<string, unknown>): StorageProvider {
    const cacheKey = `${type}-${JSON.stringify(config)}`;

    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey) as StorageProvider;
    }

    let provider: StorageProvider;

    switch (type) {
      case 's3':
        provider = new S3StorageProvider((config || {
          bucket: process.env.S3_BUCKET || 'cloudflare-image-mcp',
          region: process.env.S3_REGION || 'auto',
          accessKey: process.env.S3_ACCESS_KEY,
          secretKey: process.env.S3_SECRET_KEY,
          endpoint: process.env.S3_ENDPOINT,
          cdnUrl: process.env.S3_CDN_URL
        }) as ConstructorParameters<typeof S3StorageProvider>[0]);
        break;
      default:
        throw new Error(`Unknown storage provider: ${type}`);
    }

    this.providers.set(cacheKey, provider);
    return provider;
  }

  clearCache(): void {
    this.providers.clear();
  }
}

export function createStorage(config: StorageConfig): CreateStorageResult {
  return StorageFactory.getInstance().createStorage(config);
}

export function createS3Storage(config?: Record<string, unknown>): StorageProvider {
  return StorageFactory.getInstance().createProvider('s3', config || {
    bucket: process.env.S3_BUCKET || 'cloudflare-image-mcp',
    region: process.env.S3_REGION || 'auto'
  });
}