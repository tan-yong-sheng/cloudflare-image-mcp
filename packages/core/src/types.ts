// ============================================================================
// TypeScript Type Definitions for Cloudflare Image MCP
// ============================================================================

/**
 * Model configuration defining parameters and limits
 */
export interface ModelConfig {
  /** Full model ID (e.g., @cf/black-forest-labs/flux-1-schnell) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the model */
  description: string;
  /** Model provider (e.g., black-forest-labs, stabilityai) */
  provider: string;
  /** Cloudflare API version */
  apiVersion: number;
  /** Input format (json or multipart/form-data) */
  inputFormat: 'json' | 'multipart';
  /** Response format (base64 or binary) */
  responseFormat: 'base64' | 'binary';
  /** Supported generation tasks */
  supportedTasks: ModelTask[];
  /** Parameter definitions */
  parameters: Record<string, ParameterConfig>;
  /** Model-specific limits */
  limits: ModelLimits;
}

/**
 * Supported generation tasks
 */
export type ModelTask = 'text-to-image' | 'image-to-image' | 'inpainting';

/**
 * Parameter configuration for a model
 */
export interface ParameterConfig {
  /** Cloudflare API parameter name */
  cfParam: string;
  /** TypeScript type for validation */
  type: 'string' | 'integer' | 'number' | 'boolean';
  /** Default value if not provided */
  default?: string | number | boolean;
  /** Minimum value (for numbers) */
  min?: number;
  /** Maximum value (for numbers) */
  max?: number;
  /** Step value (for numbers) */
  step?: number;
  /** Whether parameter is required */
  required?: boolean;
}

/**
 * Model-specific limits and constraints
 */
export interface ModelLimits {
  /** Maximum prompt length in characters */
  maxPromptLength: number;
  /** Default number of diffusion steps */
  defaultSteps: number;
  /** Maximum number of diffusion steps */
  maxSteps: number;
  /** Minimum image width in pixels */
  minWidth: number;
  /** Maximum image width in pixels */
  maxWidth: number;
  /** Minimum image height in pixels */
  minHeight: number;
  /** Maximum image height in pixels */
  maxHeight: number;
  /** Supported aspect ratios/sizes */
  supportedSizes: string[];
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  /** S3/R2 bucket name */
  bucket: string;
  /** Region (use "auto" for R2) */
  region: string;
  /** S3 endpoint URL */
  endpoint: string;
  /** Access key ID */
  accessKey: string;
  /** Secret access key */
  secretKey: string;
  /** Public CDN URL for accessing files */
  cdnUrl: string;
}

/**
 * Image generation parameters (OpenAI-compatible)
 */
export interface ImageGenerationParams {
  /** Text description of the image */
  prompt: string;
  /** Number of images to generate (1-8) */
  n?: number;
  /** Image size (e.g., 1024x1024) */
  size?: string;
  /** Number of diffusion steps */
  steps?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Guidance scale (for SDXL) */
  guidance?: number;
  /** Negative prompt (elements to avoid) */
  negative_prompt?: string;
  /** Input image for img2img */
  image?: string;
  /** Mask for inpainting */
  mask?: string;
  /** Strength for img2img (0-1) */
  strength?: number;
  /** Width override */
  width?: number;
  /** Height override */
  height?: number;
}

/**
 * Storage operation result
 */
export interface StorageResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Public URL of uploaded image */
  url?: string;
  /** Unique image ID */
  id?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Image generation result
 */
export interface ImageGenerationResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Generated image URL(s) */
  images?: Array<{ url: string; id: string }>;
  /** Error message if failed */
  error?: string;
  /** Revised prompt if modified */
  revisedPrompt?: string;
}

/**
 * MCP tool definition
 */
export interface ToolDefinition {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema for arguments */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * AI client interface
 */
export interface AIClient {
  /**
   * Generate an image using the specified model
   * @param modelId - Full model ID or alias
   * @param params - Generation parameters
   * @returns Result containing base64 image data or error
   */
  generateImage(
    modelId: string,
    params: ImageGenerationParams
  ): Promise<{ success: boolean; data?: string; error?: string }>;
}

/**
 * Storage provider interface
 */
export interface StorageProvider {
  /**
   * Upload an image to storage
   * @param base64Data - Base64 encoded image data
   * @param metadata - Metadata to store with the image
   * @returns Result containing URL and ID
   */
  uploadImage(
    base64Data: string,
    metadata: Record<string, string>
  ): Promise<StorageResult>;

  /**
   * Delete an image from storage
   * @param id - Image ID to delete
   * @returns Whether deletion succeeded
   */
  deleteImage(id: string): Promise<boolean>;

  /**
   * Clean up expired images
   * @returns Number of images deleted
   */
  cleanupExpired(): Promise<number>;

  /**
   * List all image IDs
   * @param prefix - Optional prefix filter
   * @returns Array of image IDs
   */
  listImages(prefix?: string): Promise<string[]>;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  /** Cloudflare account ID */
  cloudflareAccountId: string;
  /** Cloudflare API token */
  cloudflareApiToken: string;
  /** Storage configuration */
  storage: StorageConfig;
  /** Image expiry time in hours */
  imageExpiryHours: number;
  /** Default model to use */
  defaultModel: string;
}

/**
 * Environment variables for local deployment
 */
export interface EnvVariables {
  /** Cloudflare API token */
  CLOUDFLARE_API_TOKEN?: string;
  /** Cloudflare account ID */
  CLOUDFLARE_ACCOUNT_ID?: string;
  /** R2 bucket name */
  S3_BUCKET?: string;
  /** R2 region */
  S3_REGION?: string;
  /** R2 endpoint URL */
  S3_ENDPOINT?: string;
  /** R2 access key */
  S3_ACCESS_KEY?: string;
  /** R2 secret key */
  S3_SECRET_KEY?: string;
  /** Public CDN URL */
  S3_CDN_URL?: string;
  /** Server port */
  PORT?: string;
  /** Image expiry hours */
  IMAGE_EXPIRY_HOURS?: string;
  /** Default model */
  DEFAULT_MODEL?: string;
}
