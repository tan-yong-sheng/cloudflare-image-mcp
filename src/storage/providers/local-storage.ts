import fs from 'fs/promises';
import path from 'path';
import { BaseStorageProvider } from './base-provider.js';
import { StorageResult, ImageMetadata, StorageItem, ListOptions, CleanupOptions, CleanupResult, StorageStatistics } from '../types.js';

export class LocalStorageProvider extends BaseStorageProvider {
  private basePath: string;
  private generationsPath: string;
  private cleanupConfig?: {
    enabled: boolean;
    olderThanDays?: number;
    keepCount?: number;
    runOnSave?: boolean;
  };

  constructor(config: { basePath: string; cleanup?: any } = { basePath: './outputs' }) {
    super(config);
    this.basePath = path.resolve(config.basePath);
    this.generationsPath = path.join(this.basePath, 'images', 'generations');
    this.cleanupConfig = config.cleanup;
  }

  async save(buffer: Buffer, metadata: ImageMetadata): Promise<StorageResult> {
    const date = metadata.timestamp.toISOString().split('T')[0];
    const datePath = path.join(this.generationsPath, date);

    await this.ensureDirectory(datePath);

    const filename = this.generateFilename(metadata);
    const filePath = path.join(datePath, filename);

    await fs.writeFile(filePath, buffer);
    const stats = await fs.stat(filePath);

    // Run automatic cleanup if enabled
    if (this.cleanupConfig?.enabled && this.cleanupConfig?.runOnSave) {
      await this.runAutomaticCleanup();
    }

    return {
      url: `/outputs/images/generations/${date}/${filename}`,
      filename,
      path: filePath,
      size: stats.size,
      storageType: 'local',
      metadata
    };
  }

  async delete(filename: string): Promise<boolean> {
    try {
      const filePath = await this.findFilePath(filename);
      if (!filePath) return false;

      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async list(options: ListOptions = {}): Promise<StorageItem[]> {
    const items: StorageItem[] = [];

    try {
      const dateDirs = await fs.readdir(this.generationsPath);

      for (const dateDir of dateDirs) {
        if (!this.shouldIncludeDate(dateDir, options.dateRange)) continue;

        const datePath = path.join(this.generationsPath, dateDir);
        const files = await fs.readdir(datePath);

        for (const file of files) {
          if (!file.endsWith('.jpg')) continue;

          const filePath = path.join(datePath, file);
          const stats = await fs.stat(filePath);

          if (!this.shouldIncludeFile(file, stats, options)) continue;

          items.push({
            filename: file,
            url: `/outputs/images/generations/${dateDir}/${file}`,
            size: stats.size,
            createdAt: stats.mtime,
            metadata: this.extractMetadataFromFile(file, stats.mtime)
          });
        }
      }
    } catch {
      // Directory doesn't exist or other error
    }

    return this.sortAndPaginate(items, options);
  }

  async cleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
    const allFiles = await this.list();
    const filesToDelete = this.selectFilesForCleanup(allFiles, options);

    const result: CleanupResult = {
      deleted: 0,
      failed: 0,
      totalSize: 0,
      items: []
    };

    for (const file of filesToDelete) {
      try {
        if (!options.dryRun) {
          const success = await this.delete(file.filename);
          if (success) {
            result.deleted++;
            result.totalSize += file.size;
            result.items.push({
              filename: file.filename,
              success: true,
              size: file.size
            });
          } else {
            result.failed++;
            result.items.push({
              filename: file.filename,
              success: false,
              error: 'Failed to delete file',
              size: file.size
            });
          }
        } else {
          // Dry run - just count
          result.deleted++;
          result.totalSize += file.size;
          result.items.push({
            filename: file.filename,
            success: true,
            size: file.size
          });
        }
      } catch (error) {
        result.failed++;
        result.items.push({
          filename: file.filename,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          size: file.size
        });
      }
    }

    return result;
  }

  async getStatistics(): Promise<StorageStatistics> {
    const allFiles = await this.list();

    const stats: StorageStatistics = {
      totalFiles: allFiles.length,
      totalSize: allFiles.reduce((sum, file) => sum + file.size, 0),
      filesByModel: {},
      filesByDate: {}
    };

    if (allFiles.length > 0) {
      stats.oldestFile = new Date(Math.min(...allFiles.map(f => f.createdAt.getTime())));
      stats.newestFile = new Date(Math.max(...allFiles.map(f => f.createdAt.getTime())));
    }

    for (const file of allFiles) {
      const date = file.createdAt.toISOString().split('T')[0];
      stats.filesByDate[date] = (stats.filesByDate[date] || 0) + 1;

      const model = file.metadata?.model || 'unknown';
      stats.filesByModel[model] = (stats.filesByModel[model] || 0) + 1;
    }

    return stats;
  }

  private async findFilePath(filename: string): Promise<string | null> {
    try {
      const dateDirs = await fs.readdir(this.generationsPath);

      for (const dateDir of dateDirs) {
        const datePath = path.join(this.generationsPath, dateDir);
        const filePath = path.join(datePath, filename);

        try {
          await fs.access(filePath);
          return filePath;
        } catch {
          // File doesn't exist in this directory
        }
      }
    } catch {
      // Generations directory doesn't exist
    }

    return null;
  }

  private shouldIncludeDate(dateDir: string, dateRange?: { start: string; end: string }): boolean {
    if (!dateRange) return true;

    const date = new Date(dateDir);
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);

    return date >= startDate && date <= endDate;
  }

  private shouldIncludeFile(filename: string, _stats: any, options: ListOptions): boolean {
    // Filter by model
    if (options.model) {
      const fileModel = this.extractModelFromFilename(filename);
      if (fileModel !== options.model) return false;
    }

    return true;
  }

  private sortAndPaginate(items: StorageItem[], options: ListOptions): StorageItem[] {
    // Sort by creation date (newest first)
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    if (options.offset || options.limit) {
      const offset = options.offset || 0;
      const limit = options.limit || items.length;
      return items.slice(offset, offset + limit);
    }

    return items;
  }

  private selectFilesForCleanup(files: StorageItem[], options: CleanupOptions): StorageItem[] {
    let filesToDelete = [...files];

    // Filter by date
    if (options.olderThan) {
      const cutoffDate = new Date(options.olderThan);
      filesToDelete = filesToDelete.filter(file => file.createdAt < cutoffDate);
    }

    // Keep N most recent files
    if (options.keepCount) {
      filesToDelete.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      filesToDelete = filesToDelete.slice(0, Math.max(0, filesToDelete.length - options.keepCount));
    }

    return filesToDelete;
  }

  private extractMetadataFromFile(filename: string, createdAt: Date): ImageMetadata | undefined {
    const model = this.extractModelFromFilename(filename);
    if (!model) return undefined;

    return {
      prompt: '', // Not stored in filename
      model: `@cf/${model}`,
      timestamp: createdAt
    };
  }

  private async runAutomaticCleanup(): Promise<void> {
    if (!this.cleanupConfig?.enabled) return;

    const options: CleanupOptions = {
      dryRun: false // Always actually delete in automatic mode
    };

    if (this.cleanupConfig.olderThanDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.cleanupConfig.olderThanDays);
      options.olderThan = cutoffDate.toISOString();
    }

    if (this.cleanupConfig.keepCount) {
      options.keepCount = this.cleanupConfig.keepCount;
    }

    try {
      const result = await this.cleanup(options);

      // Log cleanup results (in production, you might want to use a proper logger)
      if (result.deleted > 0) {
        console.log(`[Storage Cleanup] Deleted ${result.deleted} files (${this.formatFileSize(result.totalSize)})`);
      }
    } catch (error) {
      console.error('[Storage Cleanup] Automatic cleanup failed:', error);
    }
  }
}