import { BaseModel } from './base-model.js';
import { FluxSchnellModel } from './flux-schnell.js';
import { SDXLBaseModel } from './sdxl-base.js';
import { SDXLLightningModel } from './sdxl-lightning.js';
import { DreamshaperLCMModel } from './dreamshaper-lcm.js';
import { LeonardoPhoenixModel } from './leonardo-phoenix.js';
import { LeonardoLucidOriginModel } from './leonardo-lucid-origin.js';

export const SUPPORTED_GENERATION_MODELS: BaseModel[] = [
  new FluxSchnellModel(),
  new SDXLBaseModel(),
  new SDXLLightningModel(),
  new DreamshaperLCMModel(),
  new LeonardoPhoenixModel(),
  new LeonardoLucidOriginModel(),
];

export const UNSUPPORTED_GENERATION_MODELS: Record<string, string> = {
  "@cf/runwayml/stable-diffusion-v1-5-img2img": "Image-to-image functionality is not supported in this tool. Please use text-to-image generation instead.",
  "@cf/runwayml/stable-diffusion-v1-5-inpainting": "Image inpainting functionality is not supported in this tool. Please use text-to-image generation instead."
};

export function getGenerationModelByName(name: string): BaseModel {
  if (UNSUPPORTED_GENERATION_MODELS[name]) {
    throw new Error(UNSUPPORTED_GENERATION_MODELS[name]);
  }

  const model = SUPPORTED_GENERATION_MODELS.find(m => m.name === name);
  if (!model) {
    return SUPPORTED_GENERATION_MODELS[0];
  }

  return model;
}

export function getAllGenerationModels(): BaseModel[] {
  return [...SUPPORTED_GENERATION_MODELS];
}

export function getGenerationModelDescriptions(): Record<string, string> {
  return {
    "@cf/black-forest-labs/flux-1-schnell": "FLUX.1 Schnell - Fast, high-quality generation (12B params)",
    "@cf/stabilityai/stable-diffusion-xl-base-1.0": "Stable Diffusion XL - High quality, detailed images",
    "@cf/bytedance/stable-diffusion-xl-lightning": "SDXL Lightning - Fast generation with good quality",
    "@cf/lykon/dreamshaper-8-lcm": "DreamShaper 8 LCM - Photorealistic images",
    "@cf/leonardo/phoenix-1.0": "Leonardo AI Phoenix 1.0 - Exceptional prompt adherence and coherent text",
    "@cf/leonardo/lucid-origin": "Leonardo AI Lucid Origin - Adaptable model for design and creative work",
  };
}

export type { BaseModel };