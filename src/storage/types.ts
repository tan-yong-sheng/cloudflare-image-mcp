export interface StorageProvider {
  save(buffer: Buffer, metadata: ImageMetadata): Promise<StorageResult>;
  delete(filename: string): Promise<boolean>;
  list(options?: ListOptions): Promise<StorageItem[]>;
  cleanup(options?: CleanupOptions): Promise<CleanupResult>;
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
  parameters?: Record<string, any>;
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

export interface CleanupOptions {
  olderThan?: string;              // ISO date string
  keepCount?: number;             // Keep N most recent files
  dryRun?: boolean;               // Preview without deleting
}

export interface CleanupResult {
  deleted: number;
  failed: number;
  totalSize: number;              // Total size of deleted files in bytes
  items: {
    filename: string;
    success: boolean;
    error?: string;
    size: number;
  }[];
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
  defaultProvider: 'local' | 's3';
  providers: {
    local?: {
      basePath: string;           // Default: './outputs'
      cleanup?: {
        enabled: boolean;         // Enable automatic cleanup
        olderThanDays?: number;   // Delete files older than N days
        keepCount?: number;       // Keep N most recent files
        runOnSave?: boolean;      // Run cleanup after each save
      };
    };
    s3?: {
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