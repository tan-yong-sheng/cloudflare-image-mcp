import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BaseStorageProvider } from './base-provider.js';
import { StorageResult, ImageMetadata, StorageItem, ListOptions, CleanupOptions, CleanupResult, StorageStatistics } from '../types.js';
import { parseDurationString } from '../duration-parser.js';
import { createLogger } from '../../utils/logger.js';

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
  private logger = createLogger('S3 Storage');

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

    this.logger.debug('Initializing S3 Storage provider', {
      bucket: this.bucket,
      region: this.region,
      endpoint: this.endpoint || 'default',
      cleanup: {
        enabled: this.cleanupConfig?.enabled || false,
        olderThan: this.cleanupConfig?.olderThan || 'not set'
      }
    });

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
      this.logger.cleanup('Starting cleanup after image save');
      await this.runAutomaticCleanup();
      this.logger.cleanup('Cleanup completed successfully');
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
            // More flexible regex to handle various image formats and edge cases
            const pathMatch = object.Key.match(/outputs\/images\/generations\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/([^/]+\.(jpg|jpeg|png|webp))$/i);
            if (!pathMatch) {
              this.logger.debug('Skipping file that doesn\'t match expected pattern', { key: object.Key });
              continue;
            }

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
    this.logger.cleanup('Starting cleanup', options);

    const allFiles = await this.list();
    this.logger.info(`Found ${allFiles.length} total files in S3`);

    if (allFiles.length === 0) {
      this.logger.cleanup('No files found to clean up');
      return { deleted: 0, failed: 0, totalSize: 0, items: [] };
    }

    // Log some sample files for debugging
    this.logger.debug('Sample files found:', allFiles.slice(0, 5).map(file => ({
      filename: file.filename,
      createdAt: file.createdAt.toISOString()
    })));

    const filesToDelete = this.selectFilesForCleanup(allFiles, options);

    const result: CleanupResult = {
      deleted: 0,
      failed: 0,
      totalSize: 0,
      items: []
    };

    this.logger.cleanup(`Processing ${filesToDelete.length} files for ${options.dryRun ? 'dry run' : 'deletion'}`,
      filesToDelete.map(file => ({
        filename: file.filename,
        size: this.formatFileSize(file.size),
        createdAt: file.createdAt.toISOString()
      }))
    );

    for (const file of filesToDelete) {
      try {
        this.logger.debug(`${options.dryRun ? 'Would delete' : 'Deleting'}: ${file.filename}`);

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
            this.logger.cleanup(`Deleted: ${file.filename}`);
          } else {
            result.failed++;
            result.items.push({
              filename: file.filename,
              success: false,
              error: 'File not found',
              size: file.size
            });
            this.logger.warn(`File not found: ${file.filename}`);
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
          this.logger.cleanup(`Dry run: Would delete ${file.filename}`);
        }
      } catch (error) {
        result.failed++;
        result.items.push({
          filename: file.filename,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          size: file.size
        });
        this.logger.error(`Failed to delete ${file.filename}:`, error instanceof Error ? error.message : String(error));
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
      let cutoffDate: Date;

      if (typeof options.olderThan === 'string') {
        // Check if it's a duration string (e.g., "30min", "1h", "7d")
        const durationRegex = /^(\d+)(s|min|h|d|w|mon|y)$/i;
        if (durationRegex.test(options.olderThan)) {
          try {
            const duration = parseDurationString(options.olderThan);
            cutoffDate = new Date(Date.now() - duration.milliseconds);
            this.logger.cleanup(`Parsed duration: ${options.olderThan} -> ${duration.milliseconds}ms, cutoff: ${cutoffDate.toISOString()}`);
          } catch (error) {
            this.logger.error(`Invalid duration format: ${options.olderThan}`, error);
            return []; // Return empty list if duration is invalid
          }
        } else {
          // Try to parse as ISO date string
          cutoffDate = new Date(options.olderThan);
          if (isNaN(cutoffDate.getTime())) {
            this.logger.error(`Invalid date format: ${options.olderThan}. Expected duration (e.g., "30min") or ISO date string`);
            return [];
          }
          this.logger.cleanup(`Using cutoff date: ${cutoffDate.toISOString()}`);
        }
      } else {
        cutoffDate = new Date(options.olderThan);
        this.logger.cleanup(`Using cutoff date: ${cutoffDate.toISOString()}`);
      }

      const beforeFilter = filesToDelete.length;
      filesToDelete = filesToDelete.filter(file => {
        const shouldDelete = file.createdAt < cutoffDate;
        if (!shouldDelete) {
          this.logger.debug(`Keeping file: ${file.filename}`, {
            createdAt: file.createdAt.toISOString(),
            cutoffDate: cutoffDate.toISOString()
          });
        }
        return shouldDelete;
      });
      this.logger.cleanup(`Filtered ${beforeFilter} -> ${filesToDelete.length} files for deletion`);
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
      this.logger.debug('Skipping automatic cleanup - disabled or no olderThan configured');
      return;
    }

    const options: CleanupOptions = {
      dryRun: false, // Always actually delete in automatic mode
      olderThan: this.cleanupConfig.olderThan
    };

    this.logger.cleanup(`Starting automatic cleanup for files older than ${this.cleanupConfig.olderThan}`);

    try {
      const result = await this.cleanup(options);

      // Log detailed cleanup results
      if (result.deleted > 0) {
        this.logger.cleanup(`Automatic cleanup completed: ${result.deleted} files deleted (${this.formatFileSize(result.totalSize)})`);
        if (result.failed > 0) {
          this.logger.warn(`Failed to delete ${result.failed} files during automatic cleanup`);
        }
      } else {
        this.logger.cleanup('Automatic cleanup completed: No files needed cleanup');
      }

      if (result.items.length > 0) {
        const failedItems = result.items.filter(item => !item.success);
        if (failedItems.length > 0) {
          this.logger.warn('Failed deletions:', failedItems.map(item => `${item.filename}: ${item.error || 'Unknown error'}`));
        }
      }

      this.logger.cleanup('Automatic cleanup finished');
    } catch (error) {
      this.logger.error('Automatic cleanup failed:', error);
      throw error; // Re-throw to make the failure visible
    }
  }
}