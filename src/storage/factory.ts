import { StorageProvider, StorageConfig, CreateStorageResult } from './types.js';
import { LocalStorageProvider } from './providers/local-storage.js';

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

  createProvider(type: string, config: any): StorageProvider {
    const cacheKey = `${type}-${JSON.stringify(config)}`;

    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey)!;
    }

    let provider: StorageProvider;

    switch (type) {
      case 'local':
        provider = new LocalStorageProvider(config || { basePath: './outputs' });
        break;
      case 's3':
        throw new Error('S3 provider not implemented yet');
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

export function createLocalStorage(config?: { basePath: string }): StorageProvider {
  return StorageFactory.getInstance().createProvider('local', config || { basePath: './outputs' });
}