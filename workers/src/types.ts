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
  /** Model author (black-forest-labs, stabilityai, ...). Not a routing key. */
  provider: string;
  /**
   * Which transport serves this model: a key into the transport registry
   * (services/transports.ts), matching the `transport` column of the
   * provider row whose credentials it uses. Distinct from `provider`,
   * which names the model author and is never used for routing.
   */
  inferenceProvider: string;
  apiVersion: number;
  inputFormat: "json" | "multipart";
  responseFormat: "base64" | "binary";
  supportedTasks: ("text-to-image" | "image-to-image")[];
  editCapabilities?: {
    mask?: "supported" | "required";
  };
  maxInputImages?: number; // Max input images for multi-reference (e.g. FLUX 2 supports up to 4)
  // How a transport that takes a single `size` string interprets the requested
  // width/height: "tier" (default) sends a resolution tier plus an aspect
  // ratio, "exact" sends the requested WxH and no ratio. Only transports that
  // take a size string read it; Cloudflare models take width/height directly.
  sizeStrategy?: "tier" | "exact";
  exposure?: {
    enabled?: boolean; // default true; false hides the model everywhere
    alias?: string; // short id resolving to this model
    excludedScopes?: string[]; // stored for R1/D1 overrides; unevaluated in R0
  };
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
  PROVIDER_DB?: D1Database; // D1 provider store binding (R1a); credentials managed via admin UI (ADR-001)
  CLOUDFLARE_API_TOKEN: string; // Deprecated: was fallback credential (ADR-001)
  CLOUDFLARE_ACCOUNT_ID: string; // Deprecated: was fallback account (ADR-001)
  IMAGE_EXPIRY_HOURS: string;
  API_KEYS?: string; // Comma-separated list of valid API keys
  PROVIDER_DATA_KEY?: string; // AES-GCM data key sealing provider tokens in D1; Worker secret
  ADMIN_API_KEY?: string; // Management key gating the /api/admin/* routes; Worker secret, never the bearer gate
  DEPLOYED_AT?: string;
  COMMIT_SHA?: string;
  TZ?: string; // Timezone for logging and folder creation (default: UTC)
  /**
   * Workers Static Assets binding serving the React client (client/).
   * Absent when the client is not deployed, in which case the Worker
   * answers the client's routes with an explicit `client_not_built`
   * error instead of a document.
   */
  ASSETS?: Fetcher;
}
