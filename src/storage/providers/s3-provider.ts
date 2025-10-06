import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BaseStorageProvider } from './base-provider.js';
import { StorageResult, ImageMetadata, StorageItem, ListOptions, StorageStatistics } from '../types.js';
import { createLogger } from '../../utils/logger.js';

export class S3StorageProvider extends BaseStorageProvider {
  private client: S3Client;
  private bucket: string;
  private region: string;
  private endpoint?: string;
  private cdnUrl?: string;
  private logger = createLogger('S3 Storage');

  constructor(config: {
    bucket: string;
    region: string;
    accessKey?: string;
    secretKey?: string;
    endpoint?: string;
    cdnUrl?: string;
  }) {
    super(config);
    this.bucket = config.bucket;
    this.region = config.region;
    this.endpoint = config.endpoint;
    this.cdnUrl = config.cdnUrl;

    this.logger.debug('Initializing S3 Storage provider', {
      bucket: this.bucket,
      region: this.region,
      endpoint: this.endpoint || 'default'
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

  
  private extractMetadataFromFile(filename: string, createdAt: Date): ImageMetadata | undefined {
    const model = this.extractModelFromFilename(filename);
    if (!model) return undefined;

    return {
      prompt: '', // Not stored in filename
      model: `@cf/${model}`,
      timestamp: createdAt
    };
  }
}