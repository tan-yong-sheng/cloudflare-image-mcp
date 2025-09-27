import fs from 'fs/promises';
import { StorageProvider, StorageResult, ImageMetadata, StorageItem, ListOptions, CleanupOptions, CleanupResult, StorageStatistics } from '../types.js';

export abstract class BaseStorageProvider implements StorageProvider {
  protected config: any;

  constructor(config: any) {
    this.config = config;
  }

  abstract save(buffer: Buffer, metadata: ImageMetadata): Promise<StorageResult>;
  abstract delete(filename: string): Promise<boolean>;
  abstract list(options?: ListOptions): Promise<StorageItem[]>;
  abstract cleanup(options?: CleanupOptions): Promise<CleanupResult>;
  abstract getStatistics(): Promise<StorageStatistics>;

  protected generateFilename(_metadata: ImageMetadata): string {
    const shortUuid = Math.random().toString(36).substring(2, 8);
    return `${shortUuid}.jpg`;
  }

  protected formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  protected async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  protected parseDateFromFilename(filename: string): Date | null {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
    if (match) {
      return new Date(match[1].replace('T', ' ') + ':00');
    }
    return null;
  }

  protected extractModelFromFilename(filename: string): string | null {
    const match = filename.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_([^_]+)_/);
    return match ? match[1] : null;
  }
}