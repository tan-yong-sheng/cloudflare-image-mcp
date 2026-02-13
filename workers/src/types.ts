// ============================================================================
// Types for Cloudflare Image Generation Workers
// ============================================================================

// OpenAI-compatible image generation request
export interface OpenAIGenerationRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  response_format?: 'url' | 'b64_json';
  user?: string;
}

// OpenAI-compatible image edit request
export interface OpenAIEditRequest {
  model: string;
  image: string | string[]; // base64 or URL, or array for multi-image (FLUX 2)
  mask?: string; // base64 or URL
  prompt: string;
  n?: number;
  size?: string;
  response_format?: 'url' | 'b64_json';
  user?: string;
  // Cloudflare-specific extensions (also extractable via --key=value in prompt)
  steps?: number;
  seed?: number;
  guidance?: number;
  negative_prompt?: string;
  strength?: number;
}

// OpenAI-compatible image variation request
export interface OpenAIVariationRequest {
  model: string;
  image: string; // base64 or URL
  n?: number;
  size?: string;
  response_format?: 'url' | 'b64_json';
  user?: string;
}

// OpenAI-compatible response
export interface OpenAIImageResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string; // DALL-E 3 only
  }>;
}

// Cloudflare AI response
export interface CFImageResponse {
  image: string; // base64 encoded
}

// Model configuration from models.json
export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  provider: string;
  apiVersion: number;
  inputFormat: 'json' | 'multipart';
  responseFormat: 'base64' | 'binary';
  supportedTasks: ('text-to-image' | 'image-to-image')[];
  editCapabilities?: {
    mask?: 'supported' | 'required';
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
  type: 'string' | 'number' | 'integer' | 'boolean';
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

// MCP message types
export interface MCPMessage {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, any>;
}

// List models response
export interface ModelListItem {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  task_types: string[];
}
