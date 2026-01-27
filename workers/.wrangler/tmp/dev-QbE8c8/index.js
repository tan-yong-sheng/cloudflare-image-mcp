var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// .wrangler/tmp/bundle-F6xogw/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
var init_strip_cf_connecting_ip_header = __esm({
  ".wrangler/tmp/bundle-F6xogw/strip-cf-connecting-ip-header.js"() {
    "use strict";
    __name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
    globalThis.fetch = new Proxy(globalThis.fetch, {
      apply(target, thisArg, argArray) {
        return Reflect.apply(target, thisArg, [
          stripCfConnectingIPHeader.apply(null, argArray)
        ]);
      }
    });
  }
});

// wrangler-modules-watch:wrangler:modules-watch
var init_wrangler_modules_watch = __esm({
  "wrangler-modules-watch:wrangler:modules-watch"() {
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
  }
});

// node_modules/wrangler/templates/modules-watch-stub.js
var init_modules_watch_stub = __esm({
  "node_modules/wrangler/templates/modules-watch-stub.js"() {
    init_wrangler_modules_watch();
  }
});

// src/services/param-parser.ts
var ParamParser;
var init_param_parser = __esm({
  "src/services/param-parser.ts"() {
    "use strict";
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
    ParamParser = class {
      /**
       * Parse parameters from prompt with --key=value syntax
       * Also merges with explicit JSON fields
       *
       * Examples:
       * - "cyberpunk cat --steps=6 --seed=12345"
       * - "portrait photo --width=512 --height=768 --guidance=8.5"
       * - "surreal landscape --n=3" (for multiple images)
       */
      static parse(input, explicitParams = {}, modelConfig) {
        if (typeof input === "object" && input !== null) {
          return this.parseObject(input, modelConfig);
        }
        if (typeof input === "string") {
          return this.parseString(input, explicitParams, modelConfig);
        }
        throw new Error(`Invalid input type: ${typeof input}`);
      }
      /**
       * Parse a string with embedded parameters
       */
      static parseString(raw, explicitParams, modelConfig) {
        const paramRegex = /--(\w+)(?:=(.+?))?(?=\s+--|\s*$)/g;
        const params = {};
        let match;
        const promptMatch = raw.match(/^([^-]+?)(?=\s+--)/);
        const purePrompt = promptMatch ? promptMatch[1].trim() : raw;
        while ((match = paramRegex.exec(raw)) !== null) {
          const key = match[1];
          const value = match[2]?.trim() || "true";
          params[key.toLowerCase()] = value;
        }
        const mergedParams = { ...params, ...explicitParams };
        const result = {
          prompt: purePrompt,
          rawPrompt: raw
        };
        if (mergedParams.n !== void 0) {
          result.n = this.parseInteger(mergedParams.n, 1, 10, "n");
        }
        if (mergedParams.size !== void 0) {
          result.size = this.parseSize(mergedParams.size);
        }
        if (mergedParams.width !== void 0) {
          result.width = this.parseInteger(mergedParams.width, 256, 2048, "width");
        }
        if (mergedParams.height !== void 0) {
          result.height = this.parseInteger(mergedParams.height, 256, 2048, "height");
        }
        if (mergedParams.steps !== void 0) {
          result.steps = this.parseInteger(mergedParams.steps, 1, modelConfig?.limits?.maxSteps || 50, "steps");
        }
        if (mergedParams.num_steps !== void 0) {
          result.steps = this.parseInteger(mergedParams.num_steps, 1, modelConfig?.limits?.maxSteps || 20, "num_steps");
        }
        if (mergedParams.seed !== void 0) {
          result.seed = this.parseInteger(mergedParams.seed, 0, Number.MAX_SAFE_INTEGER, "seed");
        }
        if (mergedParams.guidance !== void 0) {
          result.guidance = this.parseNumber(mergedParams.guidance, 1, 30, "guidance");
        }
        if (mergedParams.negative_prompt !== void 0) {
          result.negative_prompt = String(mergedParams.negative_prompt);
        }
        if (mergedParams.strength !== void 0) {
          result.strength = this.parseNumber(mergedParams.strength, 0, 1, "strength");
        }
        if (mergedParams.image !== void 0) {
          result.image_b64 = this.extractBase64(mergedParams.image);
        }
        if (mergedParams.image_b64 !== void 0) {
          result.image_b64 = this.extractBase64(mergedParams.image_b64);
        }
        if (mergedParams.mask !== void 0) {
          result.mask_b64 = this.extractBase64(mergedParams.mask);
        }
        if (modelConfig) {
          this.applyModelLimitsInPlace(result, modelConfig);
        }
        return result;
      }
      /**
       * Parse object input (OpenAI JSON format)
       */
      static parseObject(obj, modelConfig) {
        const result = {
          prompt: obj.prompt || "",
          rawPrompt: obj.prompt || ""
        };
        if (obj.n !== void 0) {
          result.n = this.parseInteger(obj.n, 1, 10, "n");
        }
        if (obj.size !== void 0) {
          result.size = this.parseSize(obj.size);
          const [width, height] = result.size.split("x").map(Number);
          result.width = width;
          result.height = height;
        }
        if (obj.steps !== void 0) {
          result.steps = this.parseInteger(obj.steps, 1, modelConfig?.limits?.maxSteps || 50, "steps");
        }
        if (obj.num_steps !== void 0) {
          result.steps = this.parseInteger(obj.num_steps, 1, modelConfig?.limits?.maxSteps || 20, "num_steps");
        }
        if (obj.seed !== void 0) {
          result.seed = this.parseInteger(obj.seed, 0, Number.MAX_SAFE_INTEGER, "seed");
        }
        if (obj.guidance !== void 0) {
          result.guidance = this.parseNumber(obj.guidance, 1, 30, "guidance");
        }
        if (obj.negative_prompt !== void 0) {
          result.negative_prompt = String(obj.negative_prompt);
        }
        if (obj.strength !== void 0) {
          result.strength = this.parseNumber(obj.strength, 0, 1, "strength");
        }
        if (obj.image !== void 0) {
          result.image_b64 = this.extractBase64(obj.image);
        }
        if (obj.image_b64 !== void 0) {
          result.image_b64 = this.extractBase64(obj.image_b64);
        }
        if (obj.mask !== void 0) {
          result.mask_b64 = this.extractBase64(obj.mask);
        }
        if (modelConfig) {
          this.applyModelLimitsInPlace(result, modelConfig);
        }
        return result;
      }
      /**
       * Apply model-specific limits in place
       */
      static applyModelLimitsInPlace(params, model) {
        const limits = model.limits;
        if (params.width !== void 0) {
          params.width = Math.max(limits.minWidth, Math.min(limits.maxWidth, params.width));
        }
        if (params.height !== void 0) {
          params.height = Math.max(limits.minHeight, Math.min(limits.maxHeight, params.height));
        }
        if (params.steps !== void 0) {
          params.steps = Math.max(1, Math.min(limits.maxSteps, params.steps));
        }
      }
      /**
       * Parse size string (e.g., "1024x1024")
       */
      static parseSize(size) {
        const match = size.match(/^(\d+)x(\d+)$/);
        if (!match) {
          throw new Error(`Invalid size format: ${size}. Use WxH format (e.g., 1024x1024)`);
        }
        const width = parseInt(match[1], 10);
        const height = parseInt(match[2], 10);
        return `${width}x${height}`;
      }
      /**
       * Parse integer with validation
       */
      static parseInteger(value, min, max, name) {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
          throw new Error(`Invalid ${name}: must be an integer`);
        }
        if (parsed < min || parsed > max) {
          throw new Error(`${name} must be between ${min} and ${max}`);
        }
        return parsed;
      }
      /**
       * Parse number with validation
       */
      static parseNumber(value, min, max, name) {
        const parsed = parseFloat(value);
        if (isNaN(parsed)) {
          throw new Error(`Invalid ${name}: must be a number`);
        }
        if (parsed < min || parsed > max) {
          throw new Error(`${name} must be between ${min} and ${max}`);
        }
        return parsed;
      }
      /**
       * Extract base64 from data URI or raw base64 string
       */
      static extractBase64(input) {
        if (input.startsWith("data:")) {
          const match = input.match(/base64,(.+)$/);
          if (!match) {
            throw new Error("Invalid data URI format");
          }
          return match[1];
        }
        return input;
      }
      /**
       * Convert parsed params to Cloudflare AI payload
       */
      static toCFPayload(params, model) {
        const payload = {
          prompt: params.prompt
        };
        for (const [key, config] of Object.entries(model.parameters)) {
          const value = params[key];
          if (value !== void 0 && value !== null) {
            payload[config.cfParam] = value;
          }
        }
        return payload;
      }
      /**
       * Format help text for a model
       */
      static formatHelp(model) {
        const lines = [`## ${model.name} Parameters`, ""];
        for (const [key, config] of Object.entries(model.parameters)) {
          const required = config.required ? " (required)" : "";
          const defaultStr = config.default !== void 0 ? ` [default: ${config.default}]` : "";
          const rangeStr = config.min !== void 0 && config.max !== void 0 ? ` [${config.min}-${config.max}]` : "";
          lines.push(`--${key}${required}${defaultStr}${rangeStr}`);
          if (config.description) {
            lines.push(`  ${config.description}`);
          }
        }
        return lines.join("\n");
      }
    };
    __name(ParamParser, "ParamParser");
  }
});

// src/services/r2-storage.ts
var R2StorageService;
var init_r2_storage = __esm({
  "src/services/r2-storage.ts"() {
    "use strict";
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
    R2StorageService = class {
      bucket;
      expiryHours;
      cdnUrl;
      accountId;
      constructor(env) {
        this.bucket = env.IMAGE_BUCKET;
        this.expiryHours = parseInt(env.IMAGE_EXPIRY_HOURS || "24", 10);
        this.cdnUrl = env.CDN_URL || "";
        this.accountId = env.CLOUDFLARE_ACCOUNT_ID;
      }
      /**
       * Upload generated image to R2
       */
      async uploadImage(imageData, metadata) {
        const id = this.generateId();
        const timestamp = Date.now();
        const expiresAt = timestamp + this.expiryHours * 60 * 60 * 1e3;
        const fullMetadata = {
          ...metadata,
          id,
          createdAt: timestamp,
          expiresAt
        };
        let body;
        if (typeof imageData === "string") {
          if (imageData.startsWith("data:")) {
            const base64 = imageData.split(",")[1];
            body = this.base64ToArrayBuffer(base64);
          } else {
            body = this.base64ToArrayBuffer(imageData);
          }
        } else {
          body = imageData;
        }
        const datePrefix = new Date(timestamp).toISOString().split("T")[0];
        const key = `images/${datePrefix}/${id}.png`;
        await this.bucket.put(key, body, {
          httpMetadata: {
            contentType: "image/png",
            cacheControl: `public, max-age=${this.expiryHours * 3600}`
          },
          customMetadata: {
            model: fullMetadata.model,
            prompt: fullMetadata.prompt.substring(0, 500),
            // Truncate for metadata
            createdAt: String(fullMetadata.createdAt),
            expiresAt: String(fullMetadata.expiresAt)
          }
        });
        const url = `/${key}`;
        return { id, url, expiresAt };
      }
      /**
       * Retrieve image metadata
       */
      async getImage(id) {
        const listed = await this.bucket.list({
          prefix: "images/",
          limit: 100
        });
        const matchingObject = listed.objects.find((obj) => obj.key.includes(id));
        if (!matchingObject) {
          return null;
        }
        const object = await this.bucket.get(matchingObject.key);
        if (!object) {
          return null;
        }
        const custom = object.customMetadata || {};
        const metadata = {
          id,
          model: custom.model,
          prompt: custom.prompt,
          createdAt: parseInt(custom.createdAt, 10),
          expiresAt: parseInt(custom.expiresAt, 10),
          parameters: {}
        };
        return {
          metadata,
          data: await object.arrayBuffer()
        };
      }
      /**
       * Delete expired images
       */
      async cleanupExpired() {
        const now = Date.now();
        let deleted = 0;
        let cursor = void 0;
        do {
          const listOptions = {
            prefix: "images/",
            limit: 1e3
          };
          if (cursor) {
            listOptions.cursor = cursor;
          }
          const listed = await this.bucket.list(listOptions);
          const expiredKeys = [];
          for (const obj of listed.objects) {
            const custom = obj.customMetadata || {};
            const expiresAt = parseInt(custom.expiresAt, 10);
            if (expiresAt < now) {
              expiredKeys.push(obj.key);
            }
          }
          if (expiredKeys.length > 0) {
            await this.bucket.delete(expiredKeys);
            deleted += expiredKeys.length;
          }
          if (listed.truncated && "cursor" in listed) {
            cursor = listed.cursor;
          } else {
            cursor = void 0;
          }
        } while (cursor !== void 0);
        return deleted;
      }
      /**
       * List all images (with pagination)
       */
      async listImages(options = {}) {
        const listOptions = {
          prefix: options.prefix || "images/",
          limit: options.limit || 100
        };
        const listed = await this.bucket.list(listOptions);
        const images = listed.objects.map((obj) => {
          const custom = obj.customMetadata || {};
          const id = this.extractIdFromKey(obj.key);
          return {
            id,
            url: `/${obj.key}`,
            // Use worker proxy for CORS compatibility
            createdAt: parseInt(custom.createdAt, 10),
            expiresAt: parseInt(custom.expiresAt, 10)
          };
        });
        let cursor = void 0;
        if (listed.truncated && "cursor" in listed) {
          cursor = listed.cursor;
        }
        return {
          images,
          truncated: listed.truncated,
          cursor
        };
      }
      /**
       * Delete a specific image
       */
      async deleteImage(id) {
        const listed = await this.bucket.list({
          prefix: "images/",
          limit: 100
        });
        const matchingObject = listed.objects.find((obj) => obj.key.includes(id));
        if (!matchingObject) {
          return false;
        }
        await this.bucket.delete(matchingObject.key);
        return true;
      }
      /**
       * Get storage statistics
       */
      async getStats() {
        let total = 0;
        let size = 0;
        let oldest;
        let newest;
        let cursor = void 0;
        do {
          const listOptions = {
            prefix: "images/",
            limit: 1e3
          };
          if (cursor) {
            listOptions.cursor = cursor;
          }
          const listed = await this.bucket.list(listOptions);
          for (const obj of listed.objects) {
            total++;
            size += obj.size;
            const custom = obj.customMetadata || {};
            const createdAt = parseInt(custom.createdAt, 10);
            if (!oldest || createdAt < oldest)
              oldest = createdAt;
            if (!newest || createdAt > newest)
              newest = createdAt;
          }
          if (listed.truncated && "cursor" in listed) {
            cursor = listed.cursor;
          } else {
            cursor = void 0;
          }
        } while (cursor !== void 0);
        return { totalImages: total, totalSize: size, oldestImage: oldest, newestImage: newest };
      }
      // ===== Helper Methods =====
      generateId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 10);
        return `${timestamp}-${random}`;
      }
      extractIdFromKey(key) {
        const match = key.match(/images\/[\d-]+\/([^.]+)\.png/);
        return match ? match[1] : key;
      }
      base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
      }
    };
    __name(R2StorageService, "R2StorageService");
  }
});

// src/config/models.ts
function listModels() {
  return Object.values(MODEL_CONFIGS).map((config) => ({
    id: config.id,
    name: config.name,
    description: config.description,
    capabilities: Object.keys(config.parameters),
    taskTypes: config.supportedTasks
  }));
}
var MODEL_CONFIGS, MODEL_ALIASES;
var init_models = __esm({
  "src/config/models.ts"() {
    "use strict";
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
    MODEL_CONFIGS = {
      "@cf/black-forest-labs/flux-1-schnell": {
        id: "@cf/black-forest-labs/flux-1-schnell",
        name: "FLUX.1 [schnell]",
        description: "Fast 12B parameter rectified flow transformer for rapid image generation",
        provider: "black-forest-labs",
        apiVersion: 2,
        inputFormat: "json",
        responseFormat: "base64",
        supportedTasks: ["text-to-image"],
        parameters: {
          prompt: { cfParam: "prompt", type: "string", required: true },
          steps: { cfParam: "steps", type: "integer", default: 4, min: 1, max: 8 },
          seed: { cfParam: "seed", type: "integer" }
        },
        limits: {
          maxPromptLength: 2048,
          defaultSteps: 4,
          maxSteps: 8,
          minWidth: 512,
          maxWidth: 2048,
          minHeight: 512,
          maxHeight: 2048,
          supportedSizes: ["512x512", "768x768", "1024x1024"]
        }
      },
      "@cf/black-forest-labs/flux-2-klein-4b": {
        id: "@cf/black-forest-labs/flux-2-klein-4b",
        name: "FLUX.2 [klein]",
        description: "Ultra-fast distilled model unifying image generation and editing",
        provider: "black-forest-labs",
        apiVersion: 2,
        inputFormat: "multipart",
        responseFormat: "base64",
        supportedTasks: ["text-to-image", "image-to-image"],
        parameters: {
          prompt: { cfParam: "prompt", type: "string", required: true },
          steps: { cfParam: "steps", type: "integer", default: 4, min: 1, max: 50 },
          seed: { cfParam: "seed", type: "integer" },
          width: { cfParam: "width", type: "integer", default: 1024, min: 256, max: 2048, step: 64 },
          height: { cfParam: "height", type: "integer", default: 1024, min: 256, max: 2048, step: 64 },
          image: { cfParam: "image", type: "string" }
        },
        limits: {
          maxPromptLength: 2048,
          defaultSteps: 4,
          maxSteps: 50,
          minWidth: 256,
          maxWidth: 2048,
          minHeight: 256,
          maxHeight: 2048,
          supportedSizes: ["256x256", "512x512", "768x768", "1024x1024", "1280x1280"]
        }
      },
      "@cf/black-forest-labs/flux-2-dev": {
        id: "@cf/black-forest-labs/flux-2-dev",
        name: "FLUX.2 [dev]",
        description: "High-quality image model with multi-reference support",
        provider: "black-forest-labs",
        apiVersion: 2,
        inputFormat: "multipart",
        responseFormat: "base64",
        supportedTasks: ["text-to-image", "image-to-image"],
        parameters: {
          prompt: { cfParam: "prompt", type: "string", required: true },
          steps: { cfParam: "steps", type: "integer", default: 20, min: 1, max: 50 },
          seed: { cfParam: "seed", type: "integer" },
          width: { cfParam: "width", type: "integer", default: 1024, min: 256, max: 2048, step: 64 },
          height: { cfParam: "height", type: "integer", default: 1024, min: 256, max: 2048, step: 64 },
          image: { cfParam: "image", type: "string" }
        },
        limits: {
          maxPromptLength: 2048,
          defaultSteps: 20,
          maxSteps: 50,
          minWidth: 256,
          maxWidth: 2048,
          minHeight: 256,
          maxHeight: 2048,
          supportedSizes: ["256x256", "512x512", "768x768", "1024x1024", "1280x1280"]
        }
      },
      "@cf/stabilityai/stable-diffusion-xl-base-1.0": {
        id: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
        name: "Stable Diffusion XL Base 1.0",
        description: "High-quality diffusion model by Stability AI",
        provider: "stabilityai",
        apiVersion: 2,
        inputFormat: "json",
        responseFormat: "binary",
        supportedTasks: ["text-to-image", "image-to-image", "inpainting"],
        parameters: {
          prompt: { cfParam: "prompt", type: "string", required: true },
          negative_prompt: { cfParam: "negative_prompt", type: "string", default: "" },
          num_steps: { cfParam: "num_steps", type: "integer", default: 20, min: 1, max: 20 },
          guidance: { cfParam: "guidance", type: "number", default: 7.5, min: 1, max: 30 },
          seed: { cfParam: "seed", type: "integer" },
          width: { cfParam: "width", type: "integer", default: 1024, min: 256, max: 2048, step: 64 },
          height: { cfParam: "height", type: "integer", default: 1024, min: 256, max: 2048, step: 64 },
          image_b64: { cfParam: "image_b64", type: "string" },
          mask: { cfParam: "mask", type: "string" },
          strength: { cfParam: "strength", type: "number", default: 1, min: 0, max: 1 }
        },
        limits: {
          maxPromptLength: 2048,
          defaultSteps: 20,
          maxSteps: 20,
          minWidth: 256,
          maxWidth: 2048,
          minHeight: 256,
          maxHeight: 2048,
          supportedSizes: ["256x256", "512x512", "768x768", "1024x1024", "1280x1280", "1024x1792", "1792x1024"]
        }
      },
      "@cf/bytedance/stable-diffusion-xl-lightning": {
        id: "@cf/bytedance/stable-diffusion-xl-lightning",
        name: "SDXL Lightning",
        description: "Lightning-fast SDXL model for high-quality 1024px images",
        provider: "bytedance",
        apiVersion: 2,
        inputFormat: "json",
        responseFormat: "binary",
        supportedTasks: ["text-to-image"],
        parameters: {
          prompt: { cfParam: "prompt", type: "string", required: true },
          negative_prompt: { cfParam: "negative_prompt", type: "string", default: "" },
          num_steps: { cfParam: "num_steps", type: "integer", default: 4, min: 1, max: 20 },
          guidance: { cfParam: "guidance", type: "number", default: 7.5, min: 1, max: 30 },
          seed: { cfParam: "seed", type: "integer" },
          width: { cfParam: "width", type: "integer", default: 1024, min: 256, max: 2048, step: 64 },
          height: { cfParam: "height", type: "integer", default: 1024, min: 256, max: 2048, step: 64 }
        },
        limits: {
          maxPromptLength: 2048,
          defaultSteps: 4,
          maxSteps: 20,
          minWidth: 256,
          maxWidth: 2048,
          minHeight: 256,
          maxHeight: 2048,
          supportedSizes: ["512x512", "1024x1024"]
        }
      },
      "@cf/lykon/dreamshaper-8-lcm": {
        id: "@cf/lykon/dreamshaper-8-lcm",
        name: "DreamShaper 8 LCM",
        description: "Enhanced photorealistic SD model with LCM acceleration",
        provider: "lykon",
        apiVersion: 2,
        inputFormat: "json",
        responseFormat: "binary",
        supportedTasks: ["text-to-image", "image-to-image"],
        parameters: {
          prompt: { cfParam: "prompt", type: "string", required: true },
          negative_prompt: { cfParam: "negative_prompt", type: "string", default: "" },
          num_steps: { cfParam: "num_steps", type: "integer", default: 8, min: 1, max: 20 },
          guidance: { cfParam: "guidance", type: "number", default: 7.5, min: 1, max: 30 },
          seed: { cfParam: "seed", type: "integer" },
          width: { cfParam: "width", type: "integer", default: 1024, min: 256, max: 2048, step: 64 },
          height: { cfParam: "height", type: "integer", default: 1024, min: 256, max: 2048, step: 64 },
          image_b64: { cfParam: "image_b64", type: "string" },
          strength: { cfParam: "strength", type: "number", default: 1, min: 0, max: 1 }
        },
        limits: {
          maxPromptLength: 2048,
          defaultSteps: 8,
          maxSteps: 20,
          minWidth: 256,
          maxWidth: 2048,
          minHeight: 256,
          maxHeight: 2048,
          supportedSizes: ["512x512", "768x768", "1024x1024"]
        }
      },
      "@cf/leonardo/lucid-origin": {
        id: "@cf/leonardo/lucid-origin",
        name: "Lucid Origin",
        description: "Leonardo.AI's most adaptable and prompt-responsive model",
        provider: "leonardo",
        apiVersion: 2,
        inputFormat: "json",
        responseFormat: "base64",
        supportedTasks: ["text-to-image"],
        parameters: {
          prompt: { cfParam: "prompt", type: "string", required: true },
          guidance: { cfParam: "guidance", type: "number", default: 4.5, min: 0, max: 10 },
          seed: { cfParam: "seed", type: "integer" },
          width: { cfParam: "width", type: "integer", default: 1120, min: 256, max: 2500, step: 64 },
          height: { cfParam: "height", type: "integer", default: 1120, min: 256, max: 2500, step: 64 },
          num_steps: { cfParam: "num_steps", type: "integer", default: 4, min: 1, max: 40 }
        },
        limits: {
          maxPromptLength: 2048,
          defaultSteps: 4,
          maxSteps: 40,
          minWidth: 256,
          maxWidth: 2500,
          minHeight: 256,
          maxHeight: 2500,
          supportedSizes: ["512x512", "768x768", "1024x1024", "1280x720", "720x1280"]
        }
      },
      "@cf/leonardo/phoenix-1.0": {
        id: "@cf/leonardo/phoenix-1.0",
        name: "Phoenix 1.0",
        description: "Leonardo.AI model with exceptional prompt adherence",
        provider: "leonardo",
        apiVersion: 2,
        inputFormat: "json",
        responseFormat: "binary",
        supportedTasks: ["text-to-image"],
        parameters: {
          prompt: { cfParam: "prompt", type: "string", required: true },
          guidance: { cfParam: "guidance", type: "number", default: 2, min: 2, max: 10 },
          seed: { cfParam: "seed", type: "integer" },
          width: { cfParam: "width", type: "integer", default: 1024, min: 256, max: 2048, step: 64 },
          height: { cfParam: "height", type: "integer", default: 1024, min: 256, max: 2048, step: 64 },
          num_steps: { cfParam: "num_steps", type: "integer", default: 25, min: 1, max: 50 },
          negative_prompt: { cfParam: "negative_prompt", type: "string", default: "" }
        },
        limits: {
          maxPromptLength: 2048,
          defaultSteps: 25,
          maxSteps: 50,
          minWidth: 256,
          maxWidth: 2048,
          minHeight: 256,
          maxHeight: 2048,
          supportedSizes: ["512x512", "768x768", "1024x1024", "1280x1280"]
        }
      },
      "@cf/runwayml/stable-diffusion-v1-5-img2img": {
        id: "@cf/runwayml/stable-diffusion-v1-5-img2img",
        name: "Stable Diffusion 1.5 Img2Img",
        description: "Stable Diffusion for image-to-image transformations",
        provider: "runwayml",
        apiVersion: 2,
        inputFormat: "json",
        responseFormat: "binary",
        supportedTasks: ["image-to-image"],
        parameters: {
          prompt: { cfParam: "prompt", type: "string", required: true },
          negative_prompt: { cfParam: "negative_prompt", type: "string", default: "" },
          width: { cfParam: "width", type: "integer", default: 512, min: 256, max: 2048, step: 64 },
          height: { cfParam: "height", type: "integer", default: 512, min: 256, max: 2048, step: 64 },
          image_b64: { cfParam: "image_b64", type: "string" },
          mask_b64: { cfParam: "mask", type: "string" },
          num_steps: { cfParam: "num_steps", type: "integer", default: 20, min: 1, max: 20 },
          strength: { cfParam: "strength", type: "number", default: 1, min: 0, max: 1 },
          guidance: { cfParam: "guidance", type: "number", default: 7.5, min: 1, max: 30 },
          seed: { cfParam: "seed", type: "integer" }
        },
        limits: {
          maxPromptLength: 2048,
          defaultSteps: 20,
          maxSteps: 20,
          minWidth: 256,
          maxWidth: 2048,
          minHeight: 256,
          maxHeight: 2048,
          supportedSizes: ["256x256", "512x512", "768x768", "1024x1024"]
        }
      },
      "@cf/runwayml/stable-diffusion-v1-5-inpainting": {
        id: "@cf/runwayml/stable-diffusion-v1-5-inpainting",
        name: "Stable Diffusion 1.5 Inpainting",
        description: "Stable Diffusion for inpainting with mask support",
        provider: "runwayml",
        apiVersion: 2,
        inputFormat: "json",
        responseFormat: "binary",
        supportedTasks: ["inpainting"],
        parameters: {
          prompt: { cfParam: "prompt", type: "string", required: true },
          negative_prompt: { cfParam: "negative_prompt", type: "string", default: "" },
          width: { cfParam: "width", type: "integer", default: 512, min: 256, max: 2048, step: 64 },
          height: { cfParam: "height", type: "integer", default: 512, min: 256, max: 2048, step: 64 },
          image_b64: { cfParam: "image_b64", type: "string" },
          mask_b64: { cfParam: "mask", type: "string" },
          num_steps: { cfParam: "num_steps", type: "integer", default: 20, min: 1, max: 20 },
          strength: { cfParam: "strength", type: "number", default: 1, min: 0, max: 1 },
          guidance: { cfParam: "guidance", type: "number", default: 7.5, min: 1, max: 30 },
          seed: { cfParam: "seed", type: "integer" }
        },
        limits: {
          maxPromptLength: 2048,
          defaultSteps: 20,
          maxSteps: 20,
          minWidth: 256,
          maxWidth: 2048,
          minHeight: 256,
          maxHeight: 2048,
          supportedSizes: ["256x256", "512x512", "768x768", "1024x1024"]
        }
      }
    };
    MODEL_ALIASES = {
      "dall-e-3": "@cf/black-forest-labs/flux-1-schnell",
      "dall-e-2": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
      "flux-schnell": "@cf/black-forest-labs/flux-1-schnell",
      "flux-klein": "@cf/black-forest-labs/flux-2-klein-4b",
      "flux-dev": "@cf/black-forest-labs/flux-2-dev",
      "sdxl-base": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
      "sdxl-lightning": "@cf/bytedance/stable-diffusion-xl-lightning",
      "dreamshaper": "@cf/lykon/dreamshaper-8-lcm",
      "lucid-origin": "@cf/leonardo/lucid-origin",
      "phoenix": "@cf/leonardo/phoenix-1.0",
      "phoenix-1.0": "@cf/leonardo/phoenix-1.0",
      "sd-1.5-img2img": "@cf/runwayml/stable-diffusion-v1-5-img2img",
      "sd-1.5-inpainting": "@cf/runwayml/stable-diffusion-v1-5-inpainting"
    };
    __name(listModels, "listModels");
  }
});

// src/services/image-generator.ts
var image_generator_exports = {};
__export(image_generator_exports, {
  ImageGeneratorService: () => ImageGeneratorService
});
var ImageGeneratorService;
var init_image_generator = __esm({
  "src/services/image-generator.ts"() {
    "use strict";
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
    init_param_parser();
    init_r2_storage();
    init_models();
    ImageGeneratorService = class {
      ai;
      storage;
      models;
      aliases;
      constructor(env) {
        this.ai = env.AI;
        this.storage = new R2StorageService(env);
        this.models = new Map(Object.entries(MODEL_CONFIGS));
        this.aliases = new Map(Object.entries(MODEL_ALIASES));
      }
      /**
       * Resolve model ID from alias or direct ID
       */
      resolveModelId(input) {
        if (this.aliases.has(input)) {
          return this.aliases.get(input);
        }
        if (this.models.has(input)) {
          return input;
        }
        throw new Error(`Unknown model: ${input}`);
      }
      /**
       * Get model configuration by ID
       */
      getModelConfig(modelId) {
        const actualId = this.resolveModelId(modelId);
        return this.models.get(actualId) || null;
      }
      /**
       * Generate image from text prompt
       */
      async generateImage(modelId, prompt, explicitParams = {}) {
        const model = this.getModelConfig(modelId);
        if (!model) {
          return { success: false, error: `Unknown model: ${modelId}` };
        }
        try {
          const params = ParamParser.parse(prompt, explicitParams, model);
          const payload = ParamParser.toCFPayload(params, model);
          let result;
          if (model.inputFormat === "multipart") {
            const boundary = "----FormBoundary" + Math.random().toString(36).substring(2);
            const parts = [];
            for (const [key, value] of Object.entries(payload)) {
              if (value !== void 0 && value !== null) {
                parts.push(`--${boundary}\r
`);
                if (key === "image" && typeof value === "string" && value.length > 100) {
                  const intArray = this.base64ToUint8Array(value);
                  parts.push(`Content-Disposition: form-data; name="${key}"\r
`);
                  parts.push(`Content-Type: image/png\r
\r
`);
                  parts.push(String.fromCharCode(...intArray));
                  parts.push("\r\n");
                } else {
                  parts.push(`Content-Disposition: form-data; name="${key}"\r
\r
`);
                  parts.push(`${String(value)}\r
`);
                }
              }
            }
            parts.push(`--${boundary}--\r
`);
            const body = new TextEncoder().encode(parts.join(""));
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(body);
                controller.close();
              }
            });
            const contentType = `multipart/form-data; boundary=${boundary}`;
            result = await this.ai.run(model.id, {
              multipart: {
                body: stream,
                contentType
              }
            });
          } else {
            result = await this.ai.run(model.id, payload);
          }
          const base64Image = typeof result === "string" ? result : result?.image || result;
          if (!base64Image) {
            return { success: false, error: "No image in model response" };
          }
          const uploadResult = await this.storage.uploadImage(base64Image, {
            model: model.id,
            prompt: params.prompt,
            parameters: {
              size: params.size,
              steps: params.steps,
              seed: params.seed,
              guidance: params.guidance,
              negative_prompt: params.negative_prompt
            }
          });
          return {
            success: true,
            imageUrl: uploadResult.url,
            imageId: uploadResult.id
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Image generation failed: ${message}`);
          return { success: false, error: message };
        }
      }
      /**
       * Generate multiple images
       */
      async generateImages(modelId, prompt, n = 1, explicitParams = {}) {
        const results = [];
        for (let i = 0; i < n; i++) {
          const seed = explicitParams.seed ? explicitParams.seed + i : void 0;
          const result = await this.generateImage(modelId, prompt, {
            ...explicitParams,
            seed
          });
          if (result.success && result.imageUrl) {
            results.push({ url: result.imageUrl, id: result.imageId });
          } else {
            return { success: false, images: results, error: result.error };
          }
        }
        return { success: true, images: results };
      }
      /**
       * Image-to-image transformation
       */
      async generateImageToImage(modelId, prompt, imageData, strength = 0.5, explicitParams = {}) {
        const model = this.getModelConfig(modelId);
        if (!model) {
          return { success: false, error: `Unknown model: ${modelId}` };
        }
        if (!model.supportedTasks.includes("image-to-image")) {
          return { success: false, error: `Model ${modelId} does not support image-to-image` };
        }
        try {
          const params = ParamParser.parse(
            prompt,
            { ...explicitParams, image: imageData, strength },
            model
          );
          const payload = ParamParser.toCFPayload(params, model);
          let result;
          if (model.inputFormat === "multipart") {
            const form = new FormData();
            for (const [key, value] of Object.entries(payload)) {
              if (value !== void 0 && value !== null) {
                if (key === "image" && typeof value === "string") {
                  const intArray = this.base64ToUint8Array(value);
                  form.append(key, intArray);
                } else {
                  form.append(key, String(value));
                }
              }
            }
            result = await this.ai.run(model.id, {
              multipart: {
                body: form,
                contentType: "multipart/form-data"
              }
            });
          } else {
            result = await this.ai.run(model.id, payload);
          }
          const base64Image = typeof result === "string" ? result : result?.image || result;
          if (!base64Image) {
            return { success: false, error: "No image in model response" };
          }
          const uploadResult = await this.storage.uploadImage(base64Image, {
            model: model.id,
            prompt: params.prompt,
            parameters: {
              size: params.size,
              steps: params.steps,
              seed: params.seed
            }
          });
          return {
            success: true,
            imageUrl: uploadResult.url,
            imageId: uploadResult.id
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, error: message };
        }
      }
      /**
       * Inpainting / image editing with mask
       */
      async generateInpaint(modelId, prompt, imageData, maskData, explicitParams = {}) {
        const model = this.getModelConfig(modelId);
        if (!model) {
          return { success: false, error: `Unknown model: ${modelId}` };
        }
        if (!model.supportedTasks.includes("inpainting")) {
          return { success: false, error: `Model ${modelId} does not support inpainting` };
        }
        try {
          const params = ParamParser.parse(
            prompt,
            { ...explicitParams, image: imageData, mask: maskData },
            model
          );
          const payload = ParamParser.toCFPayload(params, model);
          const result = await this.ai.run(model.id, payload);
          const base64Image = typeof result === "string" ? result : result?.image || result;
          if (!base64Image) {
            return { success: false, error: "No image in model response" };
          }
          const uploadResult = await this.storage.uploadImage(base64Image, {
            model: model.id,
            prompt: params.prompt,
            parameters: {
              size: params.size,
              steps: params.steps,
              seed: params.seed
            }
          });
          return {
            success: true,
            imageUrl: uploadResult.url,
            imageId: uploadResult.id
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, error: message };
        }
      }
      /**
       * Get list of all available models
       */
      listModels() {
        const models = [];
        for (const [id, config] of this.models) {
          const capabilities = [];
          if (config.parameters.seed)
            capabilities.push("seed");
          if (config.parameters.width)
            capabilities.push("custom-size");
          if (config.parameters.guidance)
            capabilities.push("guidance");
          if (config.parameters.negative_prompt)
            capabilities.push("negative-prompt");
          models.push({
            id,
            name: config.name,
            description: config.description,
            capabilities,
            taskTypes: config.supportedTasks
          });
        }
        return models;
      }
      /**
       * Get parameter help for a model
       */
      getModelHelp(modelId) {
        const model = this.getModelConfig(modelId);
        if (!model) {
          return `Unknown model: ${modelId}`;
        }
        return ParamParser.formatHelp(model);
      }
      /**
       * Cleanup expired images
       */
      async cleanupExpired() {
        return this.storage.cleanupExpired();
      }
      /**
       * Convert base64 string to Uint8Array for multipart form data
       */
      base64ToUint8Array(base64) {
        const data = base64.replace(/^data:image\/\w+;base64,/, "");
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      }
    };
    __name(ImageGeneratorService, "ImageGeneratorService");
  }
});

// .wrangler/tmp/bundle-F6xogw/middleware-loader.entry.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// .wrangler/tmp/bundle-F6xogw/middleware-insertion-facade.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// src/index.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// src/endpoints/openai-endpoint.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
init_image_generator();
var OpenAIEndpoint = class {
  generator;
  corsHeaders;
  constructor(env) {
    this.generator = new ImageGeneratorService(env);
    this.corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
  }
  /**
   * Handle incoming request
   */
  async handle(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: this.corsHeaders });
    }
    try {
      if (path === "/v1/images/generations" && request.method === "POST") {
        return this.handleGenerations(request);
      }
      if (path === "/v1/images/edits" && request.method === "POST") {
        return this.handleEdits(request);
      }
      if (path === "/v1/images/variations" && request.method === "POST") {
        return this.handleVariations(request);
      }
      if (path === "/v1/models" && request.method === "GET") {
        return this.handleListModels();
      }
      if (path === "/v1/models/:model" && request.method === "GET") {
        const modelId = url.pathname.split("/").pop() || "";
        return this.handleDescribeModel(modelId);
      }
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" }
      });
    } catch (error) {
      return this.errorResponse(error);
    }
  }
  /**
   * POST /v1/images/generations
   * Text-to-image generation (OpenAI-compatible)
   */
  async handleGenerations(request) {
    const body = await request.json();
    const req = body;
    if (!req.prompt) {
      return new Response(JSON.stringify({
        error: {
          message: "prompt is required",
          type: "invalid_request_error",
          param: "prompt",
          code: null
        }
      }), {
        status: 400,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" }
      });
    }
    const modelId = this.generator.resolveModelId(req.model || "flux-schnell");
    const n = req.n || 1;
    const result = await this.generator.generateImages(
      modelId,
      req.prompt,
      Math.min(n, 8),
      // Cap at 8 images
      {
        size: req.size,
        steps: req.steps,
        seed: req.seed,
        guidance: req.guidance,
        negative_prompt: req.negative_prompt
      }
    );
    if (!result.success) {
      return new Response(JSON.stringify({
        error: { message: result.error, type: "api_error" }
      }), {
        status: 500,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" }
      });
    }
    const response = {
      created: Math.floor(Date.now() / 1e3),
      data: result.images.map((img) => ({
        url: img.url,
        b64_json: void 0
      }))
    };
    if (req.response_format === "b64_json") {
      response.data = result.images.map((img) => ({
        b64_json: img.url.split(",").pop() || "",
        // Extract base64 from data URI
        url: void 0
      }));
    }
    return new Response(JSON.stringify(response), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" }
    });
  }
  /**
   * POST /v1/images/edits
   * Image editing / inpainting (OpenAI-compatible)
   */
  async handleEdits(request) {
    const contentType = request.headers.get("content-type") || "";
    let imageData;
    let maskData;
    let prompt;
    let modelId;
    let n;
    let size;
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      imageData = formData.get("image");
      maskData = formData.get("mask") || void 0;
      prompt = formData.get("prompt");
      modelId = this.generator.resolveModelId(formData.get("model") || "sdxl-base");
      n = parseInt(formData.get("n")) || 1;
      size = formData.get("size") || "1024x1024";
    } else {
      const body = await request.json();
      const req = body;
      imageData = req.image;
      maskData = req.mask;
      prompt = req.prompt;
      modelId = this.generator.resolveModelId(req.model || "sdxl-base");
      n = req.n || 1;
      size = req.size || "1024x1024";
    }
    if (!imageData || !prompt) {
      return new Response(JSON.stringify({
        error: { message: "image and prompt are required", type: "invalid_request_error" }
      }), {
        status: 400,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" }
      });
    }
    let result;
    if (maskData) {
      result = await this.generator.generateInpaint(
        modelId,
        prompt,
        imageData,
        maskData,
        { size, n }
      );
    } else {
      result = await this.generator.generateImageToImage(
        modelId,
        prompt,
        imageData,
        0.5,
        // Default strength
        { size, n }
      );
    }
    if (!result.success) {
      return new Response(JSON.stringify({
        error: { message: result.error, type: "api_error" }
      }), {
        status: 500,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" }
      });
    }
    const response = {
      created: Math.floor(Date.now() / 1e3),
      data: [{
        url: result.imageUrl
      }]
    };
    return new Response(JSON.stringify(response), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" }
    });
  }
  /**
   * POST /v1/images/variations
   * Image variations (OpenAI-compatible)
   */
  async handleVariations(request) {
    const contentType = request.headers.get("content-type") || "";
    let imageData;
    let modelId;
    let n;
    let size;
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      imageData = formData.get("image");
      modelId = this.generator.resolveModelId(formData.get("model") || "flux-klein");
      n = parseInt(formData.get("n")) || 1;
      size = formData.get("size") || "1024x1024";
    } else {
      const body = await request.json();
      const req = body;
      imageData = req.image;
      modelId = this.generator.resolveModelId(req.model || "flux-klein");
      n = req.n || 1;
      size = req.size || "1024x1024";
    }
    if (!imageData) {
      return new Response(JSON.stringify({
        error: { message: "image is required", type: "invalid_request_error" }
      }), {
        status: 400,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" }
      });
    }
    const result = await this.generator.generateImageToImage(
      modelId,
      "",
      // Empty prompt for variations
      imageData,
      0.7,
      // Lower strength for more faithful variations
      { size, n }
    );
    if (!result.success) {
      return new Response(JSON.stringify({
        error: { message: result.error, type: "api_error" }
      }), {
        status: 500,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" }
      });
    }
    const response = {
      created: Math.floor(Date.now() / 1e3),
      data: [{
        url: result.imageUrl
      }]
    };
    return new Response(JSON.stringify(response), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" }
    });
  }
  /**
   * GET /v1/models
   * List available models
   */
  handleListModels() {
    const models = this.generator.listModels();
    return new Response(JSON.stringify({
      data: models.map((m) => ({
        id: m.id,
        object: "model",
        created: Math.floor(Date.now() / 1e3),
        owned_by: m.id.split("/")[0]
      })),
      object: "list"
    }), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" }
    });
  }
  /**
   * GET /v1/models/:model
   * Describe a specific model
   */
  handleDescribeModel(modelId) {
    const help = this.generator.getModelHelp(modelId);
    return new Response(JSON.stringify({
      id: modelId,
      object: "model",
      created: Math.floor(Date.now() / 1e3),
      owned_by: modelId.split("/")[0],
      description: help
    }), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" }
    });
  }
  /**
   * Create error response
   */
  errorResponse(error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      error: {
        message,
        type: "api_error",
        code: null
      }
    }), {
      status: 500,
      headers: { ...this.corsHeaders, "Content-Type": "application/json" }
    });
  }
};
__name(OpenAIEndpoint, "OpenAIEndpoint");

// src/endpoints/mcp-endpoint.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
init_image_generator();
var MCPEndpoint = class {
  generator;
  corsHeaders;
  constructor(env) {
    this.generator = new ImageGeneratorService(env);
    this.corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Transport"
    };
  }
  /**
   * Handle MCP request
   */
  async handle(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: this.corsHeaders });
    }
    if (request.method === "GET" && pathname === "/mcp") {
      return this.handleInfo();
    }
    if (request.method === "GET" && url.searchParams.get("transport") === "sse") {
      return this.handleSSE(request);
    }
    if (request.method === "POST" && (pathname === "/mcp" || pathname === "/mcp/message")) {
      return this.handleMessage(request);
    }
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...this.corsHeaders, "Content-Type": "application/json" }
    });
  }
  /**
   * Handle info request for /mcp endpoint
   */
  handleInfo() {
    const info = {
      name: "cloudflare-image-mcp",
      version: "0.1.0",
      protocol: "MCP",
      transport: "streamable-http",
      endpoints: {
        message: "/mcp/message",
        sse: "/mcp?transport=sse"
      },
      tools: ["generate_image", "list_models", "describe_model"],
      description: "Image generation using Cloudflare Workers AI"
    };
    return new Response(JSON.stringify(info, null, 2), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" }
    });
  }
  /**
   * Handle SSE transport connection
   */
  async handleSSE(request) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const data = JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {}
        });
        controller.enqueue(encoder.encode(`data: ${data}

`));
      }
    });
    return new Response(stream, {
      headers: {
        ...this.corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      }
    });
  }
  /**
   * Handle MCP JSON-RPC message
   */
  async handleMessage(request) {
    try {
      const message = await request.json();
      if (message.method === "initialize") {
        return this.handleInitialize(message);
      }
      if (message.method === "notifications/listChanged") {
        return this.handleListChanged(message);
      }
      if (message.method === "tools/list") {
        return this.handleListTools(message);
      }
      if (message.method === "tools/call") {
        return this.handleCallTool(message);
      }
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id ?? null,
        error: { code: -32600, message: "Unknown method" }
      }), {
        status: 200,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" }
      });
    } catch {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid JSON" }
      }), {
        status: 200,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
  /**
   * Handle initialize request
   */
  handleInitialize(message) {
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "cloudflare-image-mcp",
          version: "0.1.0"
        }
      }
    }), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" }
    });
  }
  /**
   * Handle notifications/listChanged
   */
  handleListChanged(message) {
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: message.id,
      result: null
    }), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" }
    });
  }
  /**
   * Handle tools/list request
   */
  handleListTools(message) {
    const tools = this.getToolDefinitions();
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: message.id,
      result: { tools }
    }), {
      headers: { ...this.corsHeaders, "Content-Type": "application/json" }
    });
  }
  /**
   * Handle tools/call request
   */
  async handleCallTool(message) {
    const { name, arguments: args } = message.params || {};
    try {
      let result;
      if (name === "generate_image") {
        result = await this.handleGenerateImage(args);
      } else if (name === "list_models") {
        result = await this.handleListModels(args);
      } else if (name === "describe_model") {
        result = await this.handleDescribeModel(args);
      } else {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: `Unknown tool: ${name}` }
        }), {
          status: 200,
          headers: { ...this.corsHeaders, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: { content: result }
      }), {
        headers: { ...this.corsHeaders, "Content-Type": "application/json" }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32603, message: errorMessage }
      }), {
        status: 200,
        headers: { ...this.corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
  /**
   * Handle generate_image tool call
   */
  async handleGenerateImage(args) {
    const {
      prompt,
      model,
      n,
      size,
      steps,
      seed,
      guidance,
      negative_prompt
    } = args || {};
    if (!prompt) {
      return [{
        type: "text",
        text: "Error: prompt is required",
        isError: true
      }];
    }
    const modelId = this.generator.resolveModelId(model || "flux-schnell");
    const numImages = n || 1;
    const result = await this.generator.generateImages(
      modelId,
      prompt,
      Math.min(numImages, 8),
      {
        size,
        steps,
        seed,
        guidance,
        negative_prompt
      }
    );
    if (!result.success) {
      return [{
        type: "text",
        text: `Error: ${result.error}`,
        isError: true
      }];
    }
    const textParts = [];
    if (result.images.length === 1) {
      textParts.push(`Image generated successfully!
`);
      textParts.push(`![Generated Image](${result.images[0].url})`);
    } else {
      textParts.push(`Generated ${result.images.length} images:

`);
      result.images.forEach((img, i) => {
        textParts.push(`Image ${i + 1}: ![Generated Image ${i + 1}](${img.url})
`);
      });
    }
    return [{
      type: "text",
      text: textParts.join("\n")
    }];
  }
  /**
   * Handle list_models tool call
   */
  async handleListModels(_args) {
    const models = this.generator.listModels();
    let text = "Available Image Generation Models:\n\n";
    text += "| Model | Capabilities | Task Types |\n";
    text += "|-------|--------------|------------|\n";
    for (const model of models) {
      text += `| **${model.name}** (${model.id}) | ${model.capabilities.join(", ") || "basic"} | ${model.taskTypes.join(", ")} |
`;
    }
    return [{
      type: "text",
      text
    }];
  }
  /**
   * Handle describe_model tool call
   */
  async handleDescribeModel(args) {
    const { model } = args || {};
    if (!model) {
      return [{
        type: "text",
        text: "Error: model parameter is required",
        isError: true
      }];
    }
    const help = this.generator.getModelHelp(model);
    return [{
      type: "text",
      text: help
    }];
  }
  /**
   * Get tool definitions for MCP
   */
  getToolDefinitions() {
    return [
      {
        name: "generate_image",
        description: "Generate images using Cloudflare Workers AI models. Supports FLUX, SDXL, Leonardo, and Stable Diffusion models.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Text description of the image to generate. You can also embed parameters like --steps=6 --seed=12345"
            },
            model: {
              type: "string",
              description: "Model ID or alias. Options: flux-schnell, flux-klein, flux-dev, sdxl-base, sdxl-lightning, dreamshaper, lucid-origin, phoenix, sd-1.5-img2img, sd-1.5-inpainting",
              enum: [
                "flux-schnell",
                "flux-klein",
                "flux-dev",
                "sdxl-base",
                "sdxl-lightning",
                "dreamshaper",
                "lucid-origin",
                "phoenix",
                "phoenix-1.0",
                "sd-1.5-img2img",
                "sd-1.5-inpainting"
              ]
            },
            n: {
              type: "number",
              description: "Number of images to generate (1-8)",
              minimum: 1,
              maximum: 8
            },
            size: {
              type: "string",
              description: "Image size (e.g., 1024x1024)"
            },
            steps: {
              type: "number",
              description: "Number of diffusion steps (model-dependent)"
            },
            seed: {
              type: "number",
              description: "Random seed for reproducibility"
            },
            guidance: {
              type: "number",
              description: "Guidance scale (1-30, model-dependent)"
            },
            negative_prompt: {
              type: "string",
              description: "Elements to avoid in the image"
            }
          },
          required: ["prompt"]
        }
      },
      {
        name: "list_models",
        description: "List all available image generation models with their capabilities",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "describe_model",
        description: "Get detailed parameter documentation for a specific model",
        inputSchema: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "Model ID to describe"
            }
          },
          required: ["model"]
        }
      }
    ];
  }
};
__name(MCPEndpoint, "MCPEndpoint");

// src/endpoints/frontend.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
function getFrontendHTML() {
  return `<!DOCTYPE html>
<html lang="en" class="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare AI Image Generator</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" crossorigin="anonymous">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    <style>
        :root {
            --primary: #5046e5;
            --primary-light: #6e67eb;
            --primary-dark: #4338ca;
            --secondary: #f0f4f8;
            --text: #1a202c;
            --text-light: #4a5568;
            --background: #ffffff;
            --card-bg: #f7fafc;
            --border: #e2e8f0;
            --success: #10b981;
            --error: #ef4444;
            --warning: #f59e0b;
            --info: #3b82f6;
        }

        .dark {
            --primary: #6e67eb;
            --primary-light: #8a84ee;
            --primary-dark: #5046e5;
            --secondary: #2d3748;
            --text: #f7fafc;
            --text-light: #cbd5e0;
            --background: #111827;
            --card-bg: #1f2937;
            --border: #374151;
            --success: #10b981;
            --error: #ef4444;
            --warning: #f59e0b;
            --info: #3b82f6;
        }

        body {
            background-color: var(--background);
            color: var(--text);
            transition: background-color 0.3s ease, color 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        .btn {
            padding: 1rem 1.5rem;
            border-radius: 0.375rem;
            transition: all 0.3s;
        }

        .btn:focus { outline: none; }

        .btn-primary {
            background-color: var(--primary);
            color: white;
        }

        .btn-primary:hover {
            background-color: var(--primary-light);
            transform: translateY(-1px);
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .btn-secondary {
            background-color: var(--secondary);
            color: var(--text);
            border: 1px solid var(--border);
        }

        .btn-secondary:hover {
            background-color: var(--border);
            transform: translateY(-1px);
        }

        .card {
            background-color: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
        }

        .card:hover {
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }

        input, select, textarea {
            background-color: var(--background);
            color: var(--text);
            border: 1px solid var(--border);
            border-radius: 0.375rem;
            padding: 0.5rem 0.75rem;
            transition: all 0.3s ease;
            width: 100%;
        }

        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(80, 70, 229, 0.1);
        }

        .slider {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 6px;
            border-radius: 5px;
            background: var(--border);
            outline: none;
            margin: 10px 0;
        }

        .slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: var(--primary);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .slider::-webkit-slider-thumb:hover {
            transform: scale(1.2);
            box-shadow: 0 0 0 3px rgba(80, 70, 229, 0.2);
        }

        .loading-mask {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(0,0,0,0.6);
            border-radius: 0.5rem;
            z-index: 10;
            backdrop-filter: blur(4px);
        }

        .image-container {
            aspect-ratio: 1 / 1;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: var(--card-bg);
            position: relative;
            border-radius: 0.5rem;
            max-height: 400px;
            margin: 0 auto;
            width: 100%;
        }

        .hidden { display: none !important; }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
        }

        .animate-pulse {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @media (max-width: 768px) {
            .mobile-flex-col { flex-direction: column; }
            .container { padding-left: 1rem; padding-right: 1rem; }
        }

        @media (min-width: 1024px) {
            .container { max-width: 1200px; }
        }
    </style>
</head>
<body class="min-h-screen py-4">
    <div class="container mx-auto px-4 py-4 max-w-6xl">
        <div class="flex items-center justify-between mb-6">
            <h1 class="text-2xl md:text-3xl font-bold flex items-center">
                <i class="fa-solid fa-image mr-2"></i>AI Image Generator
            </h1>
            <div class="flex items-center space-x-2">
                <button id="themeToggle" class="btn btn-secondary p-2 h-10 w-10 flex items-center justify-center" aria-label="Toggle dark theme">
                    <i class="fa-solid fa-moon"></i>
                </button>
            </div>
        </div>

        <div class="flex flex-col lg:flex-row gap-6 mobile-flex-col">
            <!-- Left Control Panel -->
            <div class="w-full lg:w-2/5 space-y-4">
                <!-- Basic Settings -->
                <div class="card p-4 space-y-4 fade-in">
                    <h2 class="text-lg font-semibold flex items-center">
                        <i class="fa-solid fa-sliders mr-2 text-primary"></i>Settings
                    </h2>

                    <div>
                        <label for="model" class="block text-sm font-medium mb-1">
                            <i class="fa-solid fa-robot mr-1"></i>Model
                        </label>
                        <select id="model" class="w-full">
                            <option value="flux-schnell">FLUX.1 [schnell] - Fast, high quality</option>
                            <option value="flux-klein">FLUX.2 [klein] - Ultra-fast, supports img2img</option>
                            <option value="flux-dev">FLUX.2 [dev] - High quality, multi-reference</option>
                            <option value="sdxl-base">SDXL Base 1.0 - Stable, versatile</option>
                            <option value="sdxl-lightning">SDXL Lightning - Fast SDXL</option>
                            <option value="dreamshaper">DreamShaper 8 LCM - Photorealistic</option>
                            <option value="lucid-origin">Lucid Origin - Leonardo.AI</option>
                            <option value="phoenix">Phoenix 1.0 - Leonardo.AI</option>
                        </select>
                    </div>

                    <div>
                        <label for="prompt" class="block text-sm font-medium mb-1">
                            <i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Prompt
                        </label>
                        <textarea id="prompt" rows="3" placeholder="Describe your image... Use --param=value for additional settings" class="w-full">cyberpunk cat</textarea>
                    </div>

                    <div>
                        <label for="negative_prompt" class="block text-sm font-medium mb-1">
                            <i class="fa-solid fa-ban mr-1"></i>Negative Prompt
                        </label>
                        <textarea id="negative_prompt" rows="2" placeholder="Elements to avoid..." class="w-full"></textarea>
                    </div>
                </div>

                <!-- Advanced Options -->
                <div class="card p-4 space-y-4 fade-in">
                    <div class="flex justify-between items-center">
                        <h2 class="text-lg font-semibold flex items-center">
                            <i class="fa-solid fa-gear mr-2 text-primary"></i>Advanced Options
                        </h2>
                        <button id="toggleAdvanced" class="text-xs btn btn-secondary py-1 px-3">
                            <i class="fa-solid fa-chevron-down mr-1" id="advancedIcon"></i>Show/Hide
                        </button>
                    </div>

                    <div id="advancedOptions" class="space-y-3 hidden">
                        <div>
                            <div class="flex justify-between items-center">
                                <label class="block text-sm font-medium">Width</label>
                                <span id="widthValue" class="text-sm font-mono">1024px</span>
                            </div>
                            <input type="range" id="width" min="256" max="2048" step="64" value="1024" class="slider w-full">
                        </div>

                        <div>
                            <div class="flex justify-between items-center">
                                <label class="block text-sm font-medium">Height</label>
                                <span id="heightValue" class="text-sm font-mono">1024px</span>
                            </div>
                            <input type="range" id="height" min="256" max="2048" step="64" value="1024" class="slider w-full">
                        </div>

                        <div>
                            <div class="flex justify-between items-center">
                                <label class="block text-sm font-medium">Steps</label>
                                <span id="stepsValue" class="text-sm font-mono">4</span>
                            </div>
                            <input type="range" id="steps" min="1" max="20" step="1" value="4" class="slider w-full">
                        </div>

                        <div>
                            <div class="flex justify-between items-center">
                                <label class="block text-sm font-medium">Guidance</label>
                                <span id="guidanceValue" class="text-sm font-mono">7.5</span>
                            </div>
                            <input type="range" id="guidance" min="1" max="30" step="0.5" value="7.5" class="slider w-full">
                        </div>

                        <div>
                            <label class="block text-sm font-medium mb-1">Seed (leave empty for random)</label>
                            <div class="flex gap-2">
                                <input type="number" id="seed" placeholder="Random seed" class="w-full">
                                <button id="randomSeed" class="btn btn-secondary text-sm py-1 px-3">
                                    <i class="fa-solid fa-random"></i>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium mb-1">Number of images (1-8)</label>
                            <input type="number" id="n" min="1" max="8" value="1" class="w-full">
                        </div>
                    </div>
                </div>

                <button id="submitButton" class="btn btn-primary w-full py-3 flex items-center justify-center">
                    <i class="fa-solid fa-wand-magic-sparkles mr-2"></i>Generate Image
                </button>
            </div>

            <!-- Right Image Display -->
            <div class="w-full lg:w-3/5">
                <div class="card h-full p-4 space-y-4 fade-in">
                    <div class="flex justify-between items-center">
                        <h2 class="text-lg font-semibold flex items-center">
                            <i class="fa-solid fa-image mr-2 text-primary"></i>Result
                        </h2>
                        <div class="flex space-x-2">
                            <button id="copyParamsButton" class="btn btn-secondary text-sm py-1 px-3 hidden">
                                <i class="fa-solid fa-copy mr-1"></i>Copy Params
                            </button>
                            <button id="downloadButton" class="btn btn-secondary text-sm py-1 px-3 hidden">
                                <i class="fa-solid fa-download mr-1"></i>Download
                            </button>
                        </div>
                    </div>

                    <div class="image-container card">
                        <div id="loadingOverlay" class="loading-mask hidden">
                            <div class="text-center">
                                <div class="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                                <p class="text-white mt-3 font-medium">Generating...</p>
                            </div>
                        </div>
                        <div id="initialPrompt" class="text-center text-gray-400 dark:text-gray-600">
                            <i class="fa-solid fa-image-portrait text-4xl mb-2"></i>
                            <p>Click generate to create an image</p>
                        </div>
                        <img id="aiImage" class="max-h-full max-w-full rounded hidden" alt="Generated image">
                    </div>

                    <div id="imageInfo" class="space-y-3 mt-2">
                        <div class="grid grid-cols-2 gap-3 text-sm">
                            <div><span class="font-medium">Model:</span> <span id="usedModel">-</span></div>
                            <div><span class="font-medium">Time:</span> <span id="generationTime">-</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Configuration
        const API_BASE = '/v1';

        // State
        let currentImageUrl = null;

        // DOM Elements
        const themeToggle = document.getElementById('themeToggle');
        const html = document.documentElement;
        const toggleAdvanced = document.getElementById('toggleAdvanced');
        const advancedOptions = document.getElementById('advancedOptions');
        const advancedIcon = document.getElementById('advancedIcon');
        const submitButton = document.getElementById('submitButton');
        const loadingOverlay = document.getElementById('loadingOverlay');
        const initialPrompt = document.getElementById('initialPrompt');
        const aiImage = document.getElementById('aiImage');
        const downloadButton = document.getElementById('downloadButton');

        // Theme toggle
        if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            html.classList.add('dark');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }

        themeToggle.addEventListener('click', () => {
            if (html.classList.contains('dark')) {
                html.classList.remove('dark');
                localStorage.theme = 'light';
                themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
            } else {
                html.classList.add('dark');
                localStorage.theme = 'dark';
                themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
            }
        });

        // Advanced options toggle
        toggleAdvanced.addEventListener('click', () => {
            advancedOptions.classList.toggle('hidden');
            advancedIcon.classList.toggle('fa-chevron-down');
            advancedIcon.classList.toggle('fa-chevron-up');
        });

        // Slider value displays
        ['width', 'height', 'steps', 'guidance'].forEach(id => {
            const slider = document.getElementById(id);
            const valueDisplay = document.getElementById(id + 'Value');
            slider.addEventListener('input', () => {
                valueDisplay.textContent = slider.value + (id === 'guidance' ? '' : 'px');
            });
        });

        // Random seed
        document.getElementById('randomSeed').addEventListener('click', () => {
            document.getElementById('seed').value = Math.floor(Math.random() * 4294967295);
        });

        // Generate image
        submitButton.addEventListener('click', async () => {
            const model = document.getElementById('model').value;
            const prompt = document.getElementById('prompt').value;
            const negativePrompt = document.getElementById('negative_prompt').value;
            const width = document.getElementById('width').value;
            const height = document.getElementById('height').value;
            const steps = document.getElementById('steps').value;
            const guidance = document.getElementById('guidance').value;
            const seed = document.getElementById('seed').value;
            const n = document.getElementById('n').value;

            if (!prompt.trim()) {
                alert('Please enter a prompt');
                return;
            }

            // Show loading
            initialPrompt.classList.add('hidden');
            aiImage.classList.add('hidden');
            downloadButton.classList.add('hidden');
            loadingOverlay.classList.remove('hidden');

            // Capture start time for duration calculation
            const startTime = Date.now();

            try {
                const response = await fetch(API_BASE + '/images/generations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: model,
                        prompt: prompt,
                        n: parseInt(n),
                        size: width + 'x' + height,
                        steps: parseInt(steps),
                        guidance: parseFloat(guidance),
                        negative_prompt: negativePrompt,
                        seed: seed ? parseInt(seed) : undefined,
                    }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error?.message || 'Generation failed');
                }

                const data = await response.json();
                const imageData = data.data[0];

                // Handle b64_json or url
                let imageUrl;
                if (imageData.b64_json) {
                    imageUrl = 'data:image/png;base64,' + imageData.b64_json;
                } else {
                    imageUrl = imageData.url;
                }

                currentImageUrl = imageUrl;

                // Calculate elapsed time
                const elapsed = Date.now() - startTime;
                const elapsedSeconds = (elapsed / 1000).toFixed(1);

                // Display image
                aiImage.src = imageUrl;
                aiImage.onload = () => {
                    loadingOverlay.classList.add('hidden');
                    aiImage.classList.remove('hidden');
                    downloadButton.classList.remove('hidden');

                    // Update info
                    document.getElementById('usedModel').textContent = model;
                    document.getElementById('generationTime').textContent = elapsedSeconds + 's';
                };

            } catch (error) {
                loadingOverlay.classList.add('hidden');
                initialPrompt.classList.remove('hidden');
                alert('Error: ' + error.message);
            }
        });

        // Download image
        downloadButton.addEventListener('click', async () => {
            if (!currentImageUrl) return;

            try {
                const response = await fetch(currentImageUrl);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'image-' + Date.now() + '.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                alert('Download failed: ' + error.message);
            }
        });
    <\/script>
</body>
</html>`;
}
__name(getFrontendHTML, "getFrontendHTML");
function serveFrontend() {
  return new Response(getFrontendHTML(), {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache"
    }
  });
}
__name(serveFrontend, "serveFrontend");

// src/index.ts
init_models();
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      if (path === "/" || path === "/index.html") {
        return serveFrontend();
      }
      if (path === "/health") {
        return new Response(JSON.stringify({
          status: "healthy",
          timestamp: Date.now(),
          version: "0.1.0"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (path.startsWith("/v1/")) {
        const openai = new OpenAIEndpoint(env);
        return openai.handle(request);
      }
      if (path === "/mcp" || path === "/mcp/message" || path.startsWith("/mcp/")) {
        const mcp = new MCPEndpoint(env);
        return mcp.handle(request);
      }
      if (path === "/api/models") {
        const models = listModels();
        return new Response(JSON.stringify(models), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (path.startsWith("/images/")) {
        const imageKey = path.substring(1);
        try {
          const image = await env.IMAGE_BUCKET.get(imageKey);
          if (!image) {
            return new Response("Image not found", { status: 404 });
          }
          return new Response(image.body, {
            headers: {
              "Content-Type": image.httpMetadata?.contentType || "image/png",
              "Cache-Control": "public, max-age=86400"
            }
          });
        } catch (error) {
          return new Response("Error fetching image", { status: 500 });
        }
      }
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  },
  // Scheduled task for cleanup (cron job)
  async scheduled(controller, env) {
    if (controller.cron === "0 * * * *") {
      const { ImageGeneratorService: ImageGeneratorService2 } = await Promise.resolve().then(() => (init_image_generator(), image_generator_exports));
      const generator = new ImageGeneratorService2(env);
      const deleted = await generator.cleanupExpired();
      console.log(`Cleaned up ${deleted} expired images`);
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-F6xogw/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-F6xogw/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
