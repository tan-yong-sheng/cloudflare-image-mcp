// ============================================================================
// Types for Cloudflare Image Generation Workers
// ============================================================================

// OpenAI-compatible response
export interface OpenAIImageResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string; // DALL-E 3 only
  }>;
}

// Model configuration from models.json
export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  provider: string;
  apiVersion: number;
  inputFormat: "json" | "multipart";
  responseFormat: "base64" | "binary";
  supportedTasks: ("text-to-image" | "image-to-image")[];
  editCapabilities?: {
    mask?: "supported" | "required";
  };
  maxInputImages?: number; // Max input images for multi-reference (e.g. FLUX 2 supports up to 4)
  parameters: Record<string, ParamConfig>;
  limits: {
    maxPromptLength: number;
    defaultSteps: number;
    maxSteps: number;
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    supportedSizes: string[];
  };
}

export interface ParamConfig {
  cfParam: string;
  type: "string" | "number" | "integer" | "boolean";
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

// Parsed parameters from prompt
export interface ParsedParams {
  prompt: string;
  rawPrompt: string;
  n?: number;
  size?: string;
  steps?: number;
  seed?: number;
  guidance?: number;
  width?: number;
  height?: number;
  negative_prompt?: string;
  strength?: number;
  image_b64?: string;
  mask_b64?: string;
  [key: string]: any;
}

// Storage metadata
export interface ImageMetadata {
  id: string;
  model: string;
  prompt: string;
  createdAt: number;
  expiresAt: number;
  parameters: {
    size?: string;
    steps?: number;
    seed?: number;
    guidance?: number;
    negative_prompt?: string;
  };
}

// AI account credentials for REST API calls
export interface AIAccount {
  account_id: string;
  api_token: string;
}

// Environment interface
export interface Env {
  IMAGE_BUCKET: R2Bucket;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  IMAGE_EXPIRY_HOURS: string;
  API_KEYS?: string; // Comma-separated list of valid API keys
  AI_ACCOUNTS?: string; // JSON array of {account_id, api_token} for multi-account AI inference
  DEPLOYED_AT?: string;
  COMMIT_SHA?: string;
  TZ?: string; // Timezone for logging and folder creation (default: UTC)
}
