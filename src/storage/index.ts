// Import types
import type { StorageConfig } from './types.js';

// Factory exports
export {
  StorageFactory,
  createStorage,
  createLocalStorage
} from './factory.js';

// Provider exports
export { BaseStorageProvider } from './providers/base-provider.js';
export { LocalStorageProvider } from './providers/local-storage.js';

// Default configuration
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  defaultProvider: 'local',
  providers: {
    local: {
      basePath: './outputs',
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

  // Local storage cleanup configuration from environment variables
  const cleanupEnabled = process.env.IMAGE_CLEANUP_ENABLED === 'true';
  const olderThanDays = process.env.IMAGE_CLEANUP_OLDER_THAN_DAYS ?
    parseInt(process.env.IMAGE_CLEANUP_OLDER_THAN_DAYS, 10) : undefined;
  const keepCount = process.env.IMAGE_CLEANUP_KEEP_COUNT ?
    parseInt(process.env.IMAGE_CLEANUP_KEEP_COUNT, 10) : undefined;
  const runOnSave = process.env.IMAGE_CLEANUP_RUN_ON_SAVE === 'true';

  if (cleanupEnabled) {
    config.providers.local!.cleanup = {
      enabled: cleanupEnabled,
      olderThanDays,
      keepCount,
      runOnSave
    };
  }

  return config;
}