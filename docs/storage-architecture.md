# Storage Architecture Design

## Overview

This document outlines the modular storage system for generated images, providing persistent storage with multiple backend options and professional directory organization.


## Proposed Architecture

### Directory Structure

```
./outputs/
├── images/
│   ├── generations/          # Image generation results
│   │   ├── 2024-09-27/      # Date-based organization
│   │   └── [date]/
└── metadata/                # Image metadata and logs
```

### Storage Providers

#### Interface Design
```typescript
interface StorageProvider {
  save(buffer: Buffer, metadata: ImageMetadata): Promise<StorageResult>
  delete(filename: string): Promise<boolean>
  list(options?: ListOptions): Promise<StorageItem[]>
  cleanup(options?: CleanupOptions): Promise<CleanupResult>
}

interface StorageResult {
  url: string                    // Public URL for access
  filename: string               // Unique filename
  path?: string                  // Local file path (if applicable)
  size: number                   // File size in bytes
  storageType: string            // Provider identifier
  metadata?: ImageMetadata
}

interface ImageMetadata {
  prompt: string
  model: string
  timestamp: Date
  category?: string
  parameters?: Record<string, any>
}
```

#### Available Providers

1. **Local Storage** (`local`)
   - Location: `./outputs/images/`
   - Best for: Development, local projects
   - Features: Date-based organization, persistent

2. **S3 Storage** (`s3`)
   - Backend: AWS S3 or Cloudflare R2
   - Best for: Production, cloud deployments
   - Features: CDN URLs, scalable, global access

### Implementation Structure

```
src/storage/
├── index.ts                 # Main exports and factory
├── factory.ts              # Storage provider factory
├── types.ts                # Type definitions
└── providers/
    ├── base-provider.ts    # Abstract base class
    ├── local-storage.ts    # Local storage provider
    └── s3-provider.ts      # S3/R2 cloud storage
```

### File Naming Convention

```typescript
// Format: {timestamp}_{model-slug}_{short-uuid}.{ext}
// Example: 20240927_141522_flux-schnell_abc123.jpg

const filename = `${timestamp}_${modelSlug}_${shortUuid}.jpg`;
```

### URL Generation

#### Project Storage
```
File: ./outputs/images/generations/2024-09-27/flux-schnell/20240927_141522_flux-schnell_abc123.jpg
URL: /outputs/images/generations/2024-09-27/flux-schnell/20240927_141522_flux-schnell_abc123.jpg
```

#### S3 Storage
```
File: s3://bucket/outputs/images/generations/2024-09-27/flux-schnell/20240927_141522_flux-schnell_abc123.jpg
URL: https://cdn.example.com/outputs/images/generations/2024-09-27/flux-schnell/20240927_141522_flux-schnell_abc123.jpg
```

### Configuration

```typescript
interface StorageConfig {
  defaultProvider: 'local' | 's3' ;
  providers: {
    local?: {
      basePath: string; // Default: './outputs'
    };
    s3?: {
      bucket: string;
      region: string;
      accessKey?: string;
      secretKey?: string;
      endpoint?: string; // For R2 compatibility
      cdnUrl?: string;
    };
  };
}
```

### Migration Path

1. **Phase 1**: Implement storage interface and local provider
2. **Phase 2**: Add S3 provider with cloud support
3. **Phase 3**: Update ImageService to use storage factory
4. **Phase 4**: Add management tools (cleanup, listing)

### Benefits

- **Professional**: Clean, organized directory structure
- **Persistent**: Images survive application restarts
- **Scalable**: Multiple storage backends
- **Extensible**: Easy to add new providers (Google Drive, Azure, etc.)
- **Compatible**: Maintains backward compatibility
- **Organized**: Date and model-based categorization
- **Flexible**: Runtime provider selection

### Management Functions

```typescript
// List images with filtering
await storage.list({
  provider: 'project',
  dateRange: { start: '2024-09-01', end: '2024-09-30' },
  model: 'flux-schnell',
  category: 'portrait'
});

// Cleanup old images
await storage.cleanup({
  provider: 'project',
  olderThan: '2024-08-01',
  keepCount: 100
});

// Get storage statistics
const stats = await storage.getStatistics('project');
```

## Next Steps

1. Create storage interface and base provider
2. Implement local storage provider
3. Implement S3 storage provider
4. Update ImageService to use storage factory
5. Add configuration management
6. Create management MCP tools
7. Update documentation and examples