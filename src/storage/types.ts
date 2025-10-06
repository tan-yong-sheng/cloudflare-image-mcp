export interface StorageProvider {
  save(buffer: Buffer, metadata: ImageMetadata): Promise<StorageResult>;
  delete(filename: string): Promise<boolean>;
  list(options?: ListOptions): Promise<StorageItem[]>;
  getStatistics(): Promise<StorageStatistics>;
}

export interface StorageResult {
  url: string;                    // Public URL for access
  filename: string;               // Unique filename
  path?: string;                  // Local file path (if applicable)
  size: number;                   // File size in bytes
  storageType: string;            // Provider identifier
  metadata?: ImageMetadata;
}

export interface ImageMetadata {
  prompt: string;
  model: string;
  timestamp: Date;
  category?: string;
  parameters?: Record<string, unknown>;
}

export interface StorageItem {
  filename: string;
  url: string;
  size: number;
  createdAt: Date;
  metadata?: ImageMetadata;
}

export interface ListOptions {
  dateRange?: {
    start: string;
    end: string;
  };
  model?: string;
  category?: string;
  limit?: number;
  offset?: number;
}


export interface StorageStatistics {
  totalFiles: number;
  totalSize: number;
  oldestFile?: Date;
  newestFile?: Date;
  filesByModel: Record<string, number>;
  filesByDate: Record<string, number>;
}

export interface StorageConfig {
  defaultProvider: 's3';
  providers: {
    s3: {
      bucket: string;
      region: string;
      accessKey?: string;
      secretKey?: string;
      endpoint?: string;          // For R2 compatibility
      cdnUrl?: string;
    };
  };
}

export interface CreateStorageResult {
  provider: StorageProvider;
  config: StorageConfig;
}