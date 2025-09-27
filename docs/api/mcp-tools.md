# MCP Tools API Reference

This document provides detailed API documentation for all MCP tools exposed by the Cloudflare Image MCP Server.

## Overview

The server exposes several MCP tools for image generation, management, and storage operations. All tools follow the MCP specification and return standardized responses.

## Tool: generate_image

Generate images using Cloudflare Workers AI models.

### Parameters
```typescript
interface GenerateImageParams {
  prompt: string;                    // Required: Text description of the image
  model?: string;                   // Optional: Model name (uses default if not specified)
  width?: number;                   // Optional: Image width (default: 1024)
  height?: number;                  // Optional: Image height (default: 1024)
  steps?: number;                   // Optional: Generation steps (model-dependent)
  guidance?: number;                // Optional: Guidance scale (model-dependent)
  storage?: string;                 // Optional: Storage method (default: base64)
  category?: string;                // Optional: Image category/organization
  sessionId?: string;               // Optional: Session identifier
}
```

### Example Usage
```json
{
  "name": "generate_image",
  "arguments": {
    "prompt": "A beautiful landscape with mountains and a lake",
    "model": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    "width": 1024,
    "height": 1024,
    "steps": 30,
    "storage": "base64"
  }
}
```

### Response Format
```typescript
interface GenerateImageResponse {
  success: boolean;
  image?: {
    url: string;                    // Image URL or data URL
    metadata: {
      model: string;                // Model used
      size: number;                 // File size in bytes
      format: string;                // Image format (JPEG, PNG, etc.)
      storage: string;               // Storage method
      generatedAt: string;          // ISO timestamp
      category?: string;             // Image category
      sessionId?: string;            // Session ID
    };
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
```

### Response Examples

#### Successful Generation
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Image generated successfully!\n\n📸 Image Details:\n- Model: @cf/stabilityai/stable-diffusion-xl-base-1.0\n- Resolution: 1024x1024\n- Storage: base64\n- Size: 245KB\n- Generated: 2024-01-15T10:30:00Z\n\n![Generated Image](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAIBAQIB...)"
    }
  ]
}
```

#### Error Response
```json
{
  "content": [
    {
      "type": "text",
      "text": "❌ Image generation failed\n\nError: Invalid API token\n\nPlease check your Cloudflare API configuration.",
      "isError": true
    }
  ]
}
```

## Tool: list_models

List all available AI models and their capabilities.

### Parameters
```typescript
interface ListModelsParams {
  filter?: {
    type?: 'fast' | 'quality' | 'balanced';  // Optional: Filter by model type
    outputFormat?: 'binary' | 'base64';      // Optional: Filter by output format
    capabilities?: string[];                  // Optional: Filter by capabilities
  };
}
```

### Example Usage
```json
{
  "name": "list_models",
  "arguments": {}
}
```

### Response Format
```typescript
interface ListModelsResponse {
  models: Array<{
    name: string;
    description: string;
    capabilities: {
      textToImage: boolean;
      imageToImage: boolean;
      inpainting: boolean;
      controlNet: boolean;
    };
    supportedResolutions: Array<{
      width: number;
      height: number;
    }>;
    outputFormat: 'binary' | 'base64';
    defaultSteps: number;
    defaultGuidance: number;
  }>;
  defaultModel: string;
}
```

### Response Example
```json
{
  "content": [
    {
      "type": "text",
      "text": "🤖 Available AI Models\n\n📋 Default Model: @cf/stabilityai/stable-diffusion-xl-base-1.0\n\n## Model Details:\n\n### 1. FLUX Schnell (@cf/black-forest-labs/flux-1-schnell)\n- **Description**: Fast generation with base64 output\n- **Speed**: ⚡⚡⚡⚡⚡ Very Fast\n- **Quality**: ⭐⭐⭐ Good\n- **Best For**: Quick iterations, prototyping\n\n### 2. SDXL Base (@cf/stabilityai/stable-diffusion-xl-base-1.0)\n- **Description**: High-quality generation with multiple outputs\n- **Speed**: ⚡⚡ Medium\n- **Quality**: ⭐⭐⭐⭐⭐ Excellent\n- **Best For**: Professional artwork, detailed images\n\n... [more models] ..."
    }
  ]
}
```

## Tool: cleanup_storage_images

Delete images from storage with filtering options.

### Parameters
```typescript
interface CleanupStorageImagesParams {
  storage?: 's3' | 'imgur';                    // Optional: Storage backend (default: configured default)
  filter?: {
    category?: string;                        // Optional: Category/tag filter
    before?: string;                          // Optional: Delete images before this date (ISO format)
    after?: string;                           // Optional: Delete images after this date (ISO format)
    prefix?: string;                          // Optional: S3 key prefix filter
    album?: string;                           // Optional: Imgur album ID filter
    batchSize?: number;                       // Optional: Batch size for deletion (default: 100)
  };
  dryRun?: boolean;                           // Optional: Preview what would be deleted (default: false)
  confirmation?: boolean;                    // Optional: Require confirmation before deletion (default: true)
}
```

### Example Usage
```json
{
  "name": "cleanup_storage_images",
  "arguments": {
    "storage": "s3",
    "filter": {
      "category": "test-images",
      "before": "2024-01-01T00:00:00Z"
    },
    "dryRun": true
  }
}
```

### Response Format
```typescript
interface CleanupStorageImagesResponse {
  success: boolean;
  preview?: {
    totalImages: number;
    storage: string;
    filters: Record<string, any>;
    sampleImages: Array<{
      id: string;
      url: string;
      createdAt: string;
      size?: number;
    }>;
  };
  results?: {
    deletedCount: number;
    failedCount: number;
    errors?: string[];
    batchResults?: Array<{
      batchNumber: number;
      deleted: number;
      failed: number;
      errors?: string[];
    }>;
  };
  message: string;
}
```

### Response Examples

#### Dry Run Response
```json
{
  "content": [
    {
      "type": "text",
      "text": "🔍 CLEANUP PREVIEW - S3 Storage\n\n📊 Summary:\n- Total images found: 25\n- Storage backend: s3\n- Filters: {\"category\": \"test-images\"}\n\n📝 Sample images to be deleted:\n1. mcp-images/test-images/abc123.jpg (Created: 2024-01-15, Size: 245KB)\n2. mcp-images/test-images/def456.jpg (Created: 2024-01-16, Size: 312KB)\n3. mcp-images/test-images/ghi789.jpg (Created: 2024-01-17, Size: 198KB)\n\n⚠️ This is a dry run. No images were actually deleted.\n\n💡 To proceed with deletion, run again with \"confirmation\": false"
    }
  ]
}
```

#### Actual Deletion Response
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ CLEANUP COMPLETED - S3 Storage\n\n📊 Results:\n- Total deleted: 25 images\n- Failed: 0 images\n- Storage backend: s3\n\n📋 Batch Results:\n- Batch 1: 25 deleted, 0 failed\n\n✨ Cleanup completed successfully!"
    }
  ]
}
```

## Tool: list_storage_images

List images in storage with filtering and pagination.

### Parameters
```typescript
interface ListStorageImagesParams {
  storage?: 's3' | 'imgur';                    // Optional: Storage backend (default: configured default)
  filter?: {
    category?: string;                        // Optional: Category/tag filter
    before?: string;                          // Optional: Images before this date (ISO format)
    after?: string;                           // Optional: Images after this date (ISO format)
    prefix?: string;                          // Optional: S3 key prefix filter
    album?: string;                           // Optional: Imgur album ID filter
    limit?: number;                           // Optional: Pagination limit (default: 50)
    marker?: string;                          // Optional: Pagination marker
  };
}
```

### Example Usage
```json
{
  "name": "list_storage_images",
  "arguments": {
    "storage": "s3",
    "filter": {
      "category": "portraits",
      "limit": 10
    }
  }
}
```

### Response Format
```typescript
interface ListStorageImagesResponse {
  success: boolean;
  images: Array<{
    id: string;
    url: string;
    metadata: {
      category?: string;
      sessionId?: string;
      createdAt: string;
      size?: number;
      storage: string;
    };
  }>;
  pagination?: {
    total: number;
    limit: number;
    marker?: string;
    hasMore: boolean;
  };
}
```

### Response Example
```json
{
  "content": [
    {
      "type": "text",
      "text": "📸 Storage Images - S3 Storage\n\n📊 Found 15 images in category 'portraits'\n\n## Recent Images:\n\n1. **mcp-images/portraits/abc123.jpg**\n   - Created: 2024-01-15T10:30:00Z\n   - Size: 245KB\n   - URL: https://your-bucket.s3.amazonaws.com/mcp-images/portraits/abc123.jpg\n\n2. **mcp-images/portraits/def456.jpg**\n   - Created: 2024-01-14T15:22:00Z\n   - Size: 312KB\n   - URL: https://your-bucket.s3.amazonaws.com/mcp-images/portraits/def456.jpg\n\n... [more images] ..."
    }
  ]
}
```

## Error Handling

All tools return standardized error responses:

### Common Error Codes
- `INVALID_PARAMETERS`: Missing or invalid parameters
- `MODEL_NOT_FOUND`: Specified model doesn't exist
- `API_ERROR`: Cloudflare API error
- `STORAGE_ERROR`: Storage backend error
- `AUTHENTICATION_ERROR`: Invalid credentials
- `RATE_LIMITED`: API rate limit exceeded
- `TIMEOUT`: Request timeout

### Error Response Format
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    suggestions?: string[];
  };
}
```

### Error Response Example
```json
{
  "content": [
    {
      "type": "text",
      "text": "❌ Error: API authentication failed\n\nError Code: AUTHENTICATION_ERROR\n\nPlease check your Cloudflare API token and account ID configuration.\n\nSuggestions:\n- Verify CLOUDFLARE_API_TOKEN is set correctly\n- Verify CLOUDFLARE_ACCOUNT_ID is set correctly\n- Check your API token has Workers AI permissions",
      "isError": true
    }
  ]
}
```

## Rate Limiting

The server implements rate limiting to prevent abuse:

### Rate Limits by Tool
- `generate_image`: 60 requests per minute
- `list_models`: 120 requests per minute
- `cleanup_storage_images`: 30 requests per minute
- `list_storage_images`: 60 requests per minute

### Rate Limit Response
```json
{
  "content": [
    {
      "type": "text",
      "text": "⚠️ Rate limit exceeded\n\nPlease wait before making additional requests.\n\nRate limit: 60 requests per minute\nReset time: 2024-01-15T10:31:00Z",
      "isError": true
    }
  ]
}
```

## Storage Backend Support

### Supported Storage Types
- **base64**: Direct data URL output (always available)
- **local**: Local filesystem storage
- **s3**: AWS S3 and compatible storage (Cloudflare R2, etc.)
- **imgur**: Imgur API integration

### Storage-Specific Parameters
Different storage backends support different filter parameters:

#### S3 Storage
- `prefix`: Filter by key prefix
- `category`: Filter by metadata category
- `before`/`after`: Filter by modification date

#### Imgur Storage
- `album`: Filter by album ID
- `before`/`after`: Filter by upload date
- `category`: Filter by local category mapping

## Tool Versioning

### Current Version: 1.0.0

### Version History
- **1.0.0**: Initial release with image generation and basic storage management
- Future versions may add:
  - Image-to-image generation
  - Inpainting capabilities
  - Advanced filtering options
  - Additional storage backends

## Best Practices

### Parameter Usage
1. **Required Parameters**: Always provide required parameters
2. **Defaults**: Use appropriate defaults for optional parameters
3. **Validation**: Validate parameter values before sending requests
4. **Error Handling**: Always check for error responses

### Storage Management
1. **Categories**: Use descriptive categories for organization
2. **Cleanup**: Regular cleanup of unused images
3. **Monitoring**: Monitor storage usage and costs
4. **Backup**: Backup important images

### Performance
1. **Model Selection**: Choose appropriate models for your needs
2. **Parameters**: Optimize parameters for quality vs speed
3. **Batching**: Use batch operations where possible
4. **Caching**: Cache model information and configurations

This API reference provides comprehensive documentation for all MCP tools exposed by the Cloudflare Image MCP Server.