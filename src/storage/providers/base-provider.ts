import { StorageProvider, StorageResult, ImageMetadata, StorageItem, ListOptions, CleanupOptions, CleanupResult, StorageStatistics } from '../types.js';

export abstract class BaseStorageProvider implements StorageProvider {
  protected config: Record<string, unknown>;

  constructor(config: Record<string, unknown>) {
    this.config = config;
  }

  abstract save(buffer: Buffer, metadata: ImageMetadata): Promise<StorageResult>;
  abstract delete(filename: string): Promise<boolean>;
  abstract list(options?: ListOptions): Promise<StorageItem[]>;
  abstract cleanup(options?: CleanupOptions): Promise<CleanupResult>;
  abstract getStatistics(): Promise<StorageStatistics>;

  protected generateFilename(size?: string): string {
    const shortUuid = Math.random().toString(36).substring(2, 8);
    const sizePart = size ? `_${size}` : '';
    return `${shortUuid}${sizePart}.jpg`;
  }

  protected generateModelPath(model: string, filename: string): string {
    // Extract model name from full model path (e.g., "@cf/black-forest-labs/flux-1-schnell" -> "flux-schnell")
    const modelName = model.split('/').pop() || 'unknown';
    return `${modelName}/${filename}`;
  }

  protected formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  protected extractModelFromFilename(key: string): string | null {
    // Extract model from path: "outputs/images/generations/2024-09-29/flux-schnell/abc123.jpg"
    const match = key.match(/outputs\/images\/generations\/\d{4}-\d{2}-\d{2}\/([^/]+)\/[^/]+\.jpg$/);
    return match ? match[1] : null;
  }
}