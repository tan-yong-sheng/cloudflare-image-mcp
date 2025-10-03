import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BaseStorageProvider } from './base-provider.js';
import { StorageResult, ImageMetadata, StorageItem, ListOptions, CleanupOptions, CleanupResult, StorageStatistics } from '../types.js';

export class S3StorageProvider extends BaseStorageProvider {
  private client: S3Client;
  private bucket: string;
  private region: string;
  private endpoint?: string;
  private cdnUrl?: string;
  private cleanupConfig?: {
    enabled: boolean;
    olderThan?: string;
  };

  constructor(config: {
    bucket: string;
    region: string;
    accessKey?: string;
    secretKey?: string;
    endpoint?: string;
    cdnUrl?: string;
    cleanup?: {
      enabled: boolean;
      olderThan?: string;
    };
  }) {
    super(config);
    this.bucket = config.bucket;
    this.region = config.region;
    this.endpoint = config.endpoint;
    this.cdnUrl = config.cdnUrl;
    this.cleanupConfig = config.cleanup;

    this.client = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      credentials: config.accessKey && config.secretKey ? {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey
      } : undefined,
      forcePathStyle: true // Required for Cloudflare R2
    });
  }

  async save(buffer: Buffer, metadata: ImageMetadata): Promise<StorageResult> {
    const date = metadata.timestamp.toISOString().split('T')[0];
    const size = metadata.parameters?.size as string | undefined;
    const filename = this.generateFilename(size);
    const modelPath = this.generateModelPath(metadata.model, filename);
    const key = `outputs/images/generations/${date}/${modelPath}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg'
    });

    await this.client.send(command);

    // Generate URL
    let url: string;
    if (this.cdnUrl) {
      url = `${this.cdnUrl}/${key}`;
    } else if (this.endpoint?.includes('cloudflare')) {
      // Cloudflare R2 public URL pattern
      url = `https://${this.bucket}.${this.endpoint?.replace('https://', '')}/${key}`;
    } else {
      // Standard S3 URL
      url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }

    // Run automatic cleanup if enabled (blocking for reliability)
    if (this.cleanupConfig?.enabled) {
      console.log('[S3 Storage Cleanup] Starting cleanup after image save...');
      await this.runAutomaticCleanup();
      console.log('[S3 Storage Cleanup] Cleanup completed successfully');
    }

    return {
      url,
      filename,
      path: key,
      size: buffer.length,
      storageType: 's3',
      metadata
    };
  }

  async delete(filename: string): Promise<boolean> {
    try {
      // Find the key by searching for the filename
      const key = await this.findFileKey(filename);
      if (!key) return false;

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async list(options: ListOptions = {}): Promise<StorageItem[]> {
    const items: StorageItem[] = [];

    try {
      let continuationToken: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: 'outputs/images/generations/',
          ContinuationToken: continuationToken
        });

        const response = await this.client.send(command);

        if (response.Contents) {
          for (const object of response.Contents) {
            if (!object.Key || !object.LastModified || !object.Size) continue;

            // Parse date and model from key path: outputs/images/generations/YYYY-MM-DD/model/filename.jpg
            const pathMatch = object.Key.match(/outputs\/images\/generations\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/([^/]+\.jpg)$/);
            if (!pathMatch) continue;

            const [, dateDir, modelDir, filename] = pathMatch;

            if (!this.shouldIncludeDate(dateDir, options.dateRange)) continue;

            if (!this.shouldIncludeFile(modelDir, filename, { size: object.Size, mtime: object.LastModified }, options)) continue;

            // Generate URL
            let url: string;
            if (this.cdnUrl) {
              url = `${this.cdnUrl}/${object.Key}`;
            } else if (this.endpoint?.includes('cloudflare')) {
              url = `https://${this.bucket}.${this.endpoint?.replace('https://', '')}/${object.Key}`;
            } else {
              url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${object.Key}`;
            }

            items.push({
              filename,
              url,
              size: object.Size,
              createdAt: object.LastModified,
              metadata: this.extractMetadataFromFile(object.Key, object.LastModified)
            });
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);
    } catch (error) {
      console.error('Error listing S3 objects:', error);
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
          const key = await this.findFileKey(file.filename);
          if (key) {
            const command = new DeleteObjectCommand({
              Bucket: this.bucket,
              Key: key
            });

            await this.client.send(command);
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
              error: 'File not found',
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

  private async findFileKey(filename: string): Promise<string | null> {
    try {
      let continuationToken: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: 'outputs/images/generations/',
          ContinuationToken: continuationToken
        });

        const response = await this.client.send(command);

        if (response.Contents) {
          for (const object of response.Contents) {
            if (!object.Key) continue;

            // Check if this object ends with our filename
            if (object.Key.endsWith(`/${filename}`)) {
              return object.Key;
            }
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);
    } catch (error) {
      console.error('Error finding file key:', error);
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

  private shouldIncludeFile(modelDir: string, filename: string, _stats: { size: number; mtime: Date }, options: ListOptions): boolean {
    // Filter by model
    if (options.model) {
      const fileModel = this.extractModelFromFilename(`outputs/images/generations/2024-01-01/${modelDir}/${filename}`);
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
    if (!this.cleanupConfig?.enabled || !this.cleanupConfig.olderThan) {
      console.log('[S3 Storage Cleanup] Skipping - cleanup disabled or no olderThan configured');
      return;
    }

    const options: CleanupOptions = {
      dryRun: false, // Always actually delete in automatic mode
      olderThan: this.cleanupConfig.olderThan
    };

    console.log(`[S3 Storage Cleanup] Looking for files older than ${this.cleanupConfig.olderThan}...`);

    try {
      const result = await this.cleanup(options);

      // Log detailed cleanup results
      if (result.deleted > 0) {
        console.log(`[S3 Storage Cleanup] ✅ Deleted ${result.deleted} files (${this.formatFileSize(result.totalSize)})`);
        if (result.failed > 0) {
          console.warn(`[S3 Storage Cleanup] ⚠️  Failed to delete ${result.failed} files`);
        }
      } else {
        console.log(`[S3 Storage Cleanup] ✅ No files needed cleanup`);
      }

      if (result.items.length > 0) {
        const failedItems = result.items.filter(item => !item.success);
        if (failedItems.length > 0) {
          console.warn(`[S3 Storage Cleanup] Failed deletions:`, failedItems.map(item => `${item.filename}: ${item.error || 'Unknown error'}`));
        }
      }
    } catch (error) {
      console.error('[S3 Storage Cleanup] ❌ Automatic cleanup failed:', error);
      throw error; // Re-throw to make the failure visible
    }
  }
}