# Storage Architecture Design

## Overview

This document outlines the S3-based storage system for generated images, providing cloud storage with S3 or Cloudflare R2 compatibility and automated cleanup capabilities.

## Architecture

### Storage Provider

#### Interface Design
```typescript
interface StorageProvider {
  save(buffer: Buffer, metadata: ImageMetadata): Promise<StorageResult>
  delete(filename: string): Promise<boolean>
  list(options?: ListOptions): Promise<StorageItem[]>
  cleanup(options?: CleanupOptions): Promise<CleanupResult>
  getStatistics(): Promise<StorageStatistics>
}

interface StorageResult {
  url: string                    // Public URL for access
  filename: string               // Unique filename
  size: number                   // File size in bytes
  storageType: string            // Provider identifier
  metadata?: ImageMetadata
}

interface ImageMetadata {
  prompt: string
  model: string
  timestamp: Date
  category?: string
  parameters?: Record<string, unknown>
}
```

#### Available Provider

1. **S3 Storage** (`s3`)
   - Backend: AWS S3 or Cloudflare R2
   - Best for: Production, cloud deployments
   - Features: CDN URLs, scalable, global access, automated cleanup

### Implementation Structure

```
src/storage/
├── index.ts                 # Main exports and factory
├── factory.ts              # Storage provider factory
├── types.ts                # Type definitions
└── providers/
    ├── base-provider.ts    # Abstract base class
    └── s3-provider.ts      # S3/R2 cloud storage
```

### File Naming Convention

```typescript
// Format: {date}/{model-slug}/{short-uuid}_{image_size}.{ext}
// Example: 20240927/flux-schnell/abc123_1024x1024.jpg

const filename = `${timestamp}_${modelSlug}_${shortUuid}.jpg`;
```

### URL Generation

#### S3 Storage (AWS S3)
```
File: s3://bucket/generations/2024-09-27/flux-schnell/20240927_141522_flux-schnell_abc123.jpg
URL: https://bucket.s3.amazonaws.com/generations/2024-09-27/flux-schnell/abc123_1024x1024.jpg
```

#### Cloudflare R2 Storage
```
File: s3://bucket/generations/2024-09-27/flux-schnell/20240927_141522_flux-schnell_abc123.jpg
URL: https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev/generations/2024-09-27/flux-schnell/abc123_1024x1024.jpg
```

### Configuration

```typescript
interface StorageConfig {
  defaultProvider: 's3';
  providers: {
    s3: {
      bucket: string;
      region: string;
      accessKey?: string;
      secretKey?: string;
      endpoint?: string; // For R2 compatibility
      cdnUrl?: string;
      cleanup?: {
        enabled: boolean;         // Enable automatic cleanup
        olderThanDays?: number;   // Delete files older than N days
        keepCount?: number;       // Keep N most recent files
        runOnSave?: boolean;      // Run cleanup after each save
      };
    };
  };
}
```

### Implementation Status

✅ **Completed**:
- Storage interface and base provider
- S3 provider with cloud support (AWS S3 and Cloudflare R2)
- ImageService integration with storage factory
- Management tools (cleanup, listing, statistics)
- Automated cleanup with configurable policies

### Benefits

- **Cloud-Native**: Optimized for cloud storage with AWS S3 and Cloudflare R2
- **Persistent**: Images stored reliably in cloud storage
- **Scalable**: Built on highly scalable S3 infrastructure
- **Global**: CDN support for fast image access worldwide
- **Automated**: Configurable cleanup policies to manage storage costs
- **Organized**: Date and model-based categorization
- **Reliable**: Enterprise-grade storage with durability guarantees

### Management Functions

```typescript
// List images with filtering
await storage.list({
  dateRange: { start: '2024-09-01', end: '2024-09-30' },
  model: 'flux-schnell'
});

// Cleanup old images
await storage.cleanup({
  olderThan: '2024-08-01',
  keepCount: 100
});

// Get storage statistics
const stats = await storage.getStatistics();
```

## Environment Configuration

The storage system is configured entirely through environment variables:

```bash
# Required S3 Configuration
S3_BUCKET="your-bucket-name"
S3_REGION="auto"  # Use "auto" for Cloudflare R2
S3_ACCESS_KEY="your_access_key"
S3_SECRET_KEY="your_secret_key"
S3_ENDPOINT="https://your-account-id.r2.cloudflarestorage.com"  # Required for R2
S3_CDN_URL="https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev"  # Optional CDN URL

# Optional Cleanup Configuration
IMAGE_CLEANUP_ENABLED=true
IMAGE_CLEANUP_OLDER_THAN_DAYS=30
IMAGE_CLEANUP_KEEP_COUNT=100
IMAGE_CLEANUP_RUN_ON_SAVE=false
```

## Usage Examples

### Cloudflare R2 Setup
```bash
export S3_BUCKET="cloudflare-image-mcp"
export S3_REGION="auto"
export S3_ACCESS_KEY="your-r2-token"
export S3_SECRET_KEY="your-r2-secret"
export S3_ENDPOINT="https://account-id.r2.cloudflarestorage.com"
export S3_CDN_URL="https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev"
```