import { z } from 'zod';

// Model configuration types
export interface ModelConfig {
  maxPromptLength: number;
  defaultSteps: number;
  maxSteps: number;
  supportsNegativePrompt: boolean;
  supportsSize: boolean;
  supportsGuidance: boolean;
  supportsSeed: boolean;
  outputFormat: 'base64' | 'binary';
  recommendedFor: string;
  defaultGuidance?: number;
  guidanceRange?: string;
  recommendedNegative?: string;
  notes?: string;
  supportsImageInput?: boolean;
  supportsMask?: boolean;
  supportsStrength?: boolean;
  guidanceValues?: number[];
  defaultSize?: string;
  maxWidth?: number;
  maxHeight?: number;
}

// Tool parameters schema
export const GenerateImageParamsSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  size: z.string().default("1024x1024"),
  negativePrompt: z.string().default(""),
  steps: z.number().min(1).max(50).default(4),
  guidance: z.number().min(0).max(20).default(7.5),
  seed: z.number().int().min(0).optional(),
  imageB64: z.string().optional(),
  strength: z.number().min(0.1).max(1.0).default(1.0),
});

export type GenerateImageParams = z.infer<typeof GenerateImageParamsSchema>;

// Cloudflare API response types
export interface CloudflareApiResponse {
  success: boolean;
  result?: {
    image?: string;
  };
  image?: string;
  errors?: Array<{
    code: string;
    message: string;
  }>;
}

// MCP Server config
export interface ServerConfig {
  cloudflareApiToken: string;
  cloudflareAccountId: string;
  defaultModel: string;
}