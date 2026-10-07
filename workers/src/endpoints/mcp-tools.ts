// ============================================================================
// MCP Tool Implementations - shared by multi/single-model SDK servers
// ============================================================================
// Pure business logic: given parsed tool arguments + a worker base URL,
// produce MCP content blocks. Transport-agnostic so both SDK server
// factories (and unit harnesses) share one implementation.

import type {
  BatchResult,
  ImageGeneratorService,
} from "../services/image-generator.js";

export interface ToolContent {
  type: "text";
  text: string;
}

/**
 * MCP CallToolResult shape: `isError` lives on the result object, not on
 * content blocks (clients read result.isError to detect tool failure).
 * (The SDK fills the 2026-era `resultType` envelope itself; callbacks
 * return the plain CallToolResult shape.)
 */
/**
 * Handler return contract, mirroring the SDK CallToolResult content model
 * (text blocks only in this codebase): result-level `isError` plus an
 * index-signature escape hatch for the SDK 2026-era envelope fields
 * (`resultType`, `_meta`) the transport manages on the wire.
 */
export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
  [key: string]: unknown;
}

export interface ToolsContext {
  generator: ImageGeneratorService;
  /** Worker origin, for absolutizing relative image URLs. */
  baseUrl: string;
}

function fullUrl(baseUrl: string, path: string): string {
  return path.startsWith("http") ? path : `${baseUrl}${path}`;
}

function hasUrl(img: {
  url?: string;
  b64_json?: string;
}): img is { url: string } {
  return "url" in img && !!img.url;
}

function error(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/**
 * Handle run_model tool call.
 * @param defaultModel - when set (single-model endpoint), model_id is pinned
 *   to this value and a mismatched model_id is rejected.
 */
export async function handleRunModel(
  ctx: ToolsContext,
  args: {
    taskType?: string;
    prompt?: string;
    model_id?: string;
    n?: number;
    size?: string;
    image?: string | string[];
    mask?: string;
    cf_params?: Record<string, unknown>;
  },
  defaultModel: string | null
): Promise<ToolResult> {
  const { taskType, prompt, n, size, image, mask, cf_params } = args;
  let model_id = args.model_id ?? null;

  // ── Validate taskType ──
  if (!taskType) {
    return error(
      'Error: taskType is required. Use "generations" for text-to-image or "edits" for image editing.'
    );
  }
  if (taskType !== "generations" && taskType !== "edits") {
    return error(
      `Error: Invalid taskType '${taskType}'. Must be 'generations' or 'edits'.`
    );
  }

  // ── Validate prompt ──
  if (!prompt) {
    return error("Error: prompt is required");
  }

  // ── Validate edits-specific fields ──
  if (taskType === "edits" && !image) {
    return error('Error: image is required when taskType is "edits".');
  }
  if (taskType === "generations" && image) {
    return error(
      'Error: image cannot be used with taskType "generations". Use taskType "edits" for image editing.'
    );
  }
  if (taskType === "generations" && mask) {
    return error(
      'Error: mask cannot be used with taskType "generations". Use taskType "edits" for inpainting.'
    );
  }

  // ── Resolve model_id ──
  if (defaultModel) {
    if (model_id && model_id !== defaultModel) {
      return error(
        `Error: this endpoint is pinned to model_id='${defaultModel}'. Remove model_id or use /mcp for model selection.`
      );
    }
    model_id = defaultModel;
  }
  if (!model_id) {
    return error(
      "Error: model_id is required. Use list_models to get available model_ids."
    );
  }

  // ── Validate model exists ──
  const modelConfig = ctx.generator.getModelConfig(model_id);
  if (!modelConfig) {
    return error(
      `Error: Unknown model_id: ${model_id}. Use list_models to get valid model_ids.`
    );
  }

  // ── Validate model supports the requested task ──
  if (
    taskType === "edits" &&
    !modelConfig.supportedTasks.includes("image-to-image")
  ) {
    return error(
      `Error: Model ${model_id} does not support image editing. Use taskType 'generations' or choose a model that supports image-to-image.`
    );
  }

  // ── Build explicitParams from OpenAI-standard fields + cf_params ──
  const numImages = Math.min(n || 1, 8);
  const explicitParams: Record<string, unknown> = {};
  if (size !== undefined) explicitParams.size = size;

  if (cf_params && typeof cf_params === "object") {
    if (
      (cf_params as Record<string, unknown>).strength !== undefined &&
      taskType === "generations"
    ) {
      return error(
        'Error: cf_params.strength cannot be used with taskType "generations". Use taskType "edits" for image editing.'
      );
    }
    for (const [key, value] of Object.entries(cf_params)) {
      if (value !== undefined) explicitParams[key] = value;
    }
  }

  // ── Execute: one runMany call per task; the task follows from the
  // request shape (images present, mask present) inside the seam. ──
  const base = {
    modelId: model_id,
    prompt,
    explicitParams: explicitParams as Record<string, any>,
  };
  let result: BatchResult;

  if (taskType === "edits") {
    if (mask) {
      // Inpainting takes exactly one image: reject arrays explicitly
      // rather than silently dropping all but the first element.
      if (Array.isArray(image)) {
        return error(
          "Error: mask can only be used with a single image. Pass one base64 image (not an array), or drop mask for multi-reference edits."
        );
      }
      result = await ctx.generator.runMany(
        { ...base, images: image as string, mask },
        numImages
      );
    } else {
      result = await ctx.generator.runMany(
        { ...base, images: image as string | string[] },
        numImages
      );
    }
  } else {
    result = await ctx.generator.runMany(base, numImages);
  }

  if (!result.success) {
    return error(`Error: ${result.error}`);
  }

  // ── Format response ──
  const textParts: string[] = [];
  const modeLabel =
    taskType === "edits" ? (mask ? "Inpainted" : "Edited") : "Generated";

  if (result.images.length === 1) {
    const img = result.images[0];
    textParts.push(`Image ${modeLabel.toLowerCase()} successfully!\n`);
    if (hasUrl(img)) {
      textParts.push(`![${modeLabel} Image](${fullUrl(ctx.baseUrl, img.url)})`);
    } else {
      textParts.push(
        `Image ${modeLabel.toLowerCase()} (base64 data available)`
      );
    }
  } else {
    textParts.push(`${modeLabel} ${result.images.length} images:\n\n`);
    result.images.forEach((img, i) => {
      if (hasUrl(img)) {
        textParts.push(
          `Image ${i + 1}: ![${modeLabel} Image ${i + 1}](${fullUrl(ctx.baseUrl, img.url)})\n`
        );
      } else {
        textParts.push(`Image ${i + 1}: (base64 data available)\n`);
      }
    });
  }

  return ok(textParts.join("\n"));
}

/**
 * Handle list_models tool call.
 */
export async function handleListModels(ctx: ToolsContext): Promise<ToolResult> {
  const models = ctx.generator.listModels();

  const sortedModels = [...models].sort((a, b) => {
    const byProvider = a.provider.localeCompare(b.provider);
    if (byProvider !== 0) return byProvider;
    return a.name.localeCompare(b.name);
  });

  const editCapabilitiesMap: Record<string, unknown> = {};
  for (const model of sortedModels) {
    if (model.editCapabilities) {
      editCapabilitiesMap[model.id] = model.editCapabilities;
    }
  }

  const output = {
    models: sortedModels.map((m) => {
      const taskTypes: string[] = ["generations"];
      if (m.taskTypes.includes("image-to-image")) taskTypes.push("edits");
      return {
        model_id: m.id,
        name: m.name,
        description: m.description,
        provider: m.provider,
        supported_image_sizes: m.supportedSizes,
        supported_task_types: taskTypes,
      };
    }),
    edit_capabilities: editCapabilitiesMap,
    next_step: 'call describe_model(model_id="<model_id from list_models>")',
  };

  return ok(JSON.stringify(output, null, 2));
}

/**
 * Handle describe_model tool call.
 */
export async function handleDescribeModel(
  ctx: ToolsContext,
  args: { model_id?: string }
): Promise<ToolResult> {
  const { model_id } = args;

  if (!model_id) {
    return error("Error: model_id parameter is required");
  }

  const modelConfig = ctx.generator.getModelConfig(model_id);
  if (!modelConfig) {
    return error(`Error: Unknown model_id: ${model_id}`);
  }

  const supportedTaskTypes: string[] = ["generations"];
  if (modelConfig.supportedTasks.includes("image-to-image")) {
    supportedTaskTypes.push("edits");
  }

  // Skip: prompt (top-level), image/image_b64/mask/mask_b64 (top-level fields)
  const imageParamKeys = new Set([
    "prompt",
    "image",
    "image_b64",
    "mask",
    "mask_b64",
  ]);
  const editsOnlyKeys = new Set(["strength"]);

  const buildParamEntry = (param: {
    type: string;
    cfParam: string;
    description?: string;
    required?: boolean;
    default?: unknown;
    min?: number;
    max?: number;
    step?: number;
  }): Record<string, unknown> => {
    const entry: Record<string, unknown> = {
      type: param.type,
      cf_param: param.cfParam,
      description: param.description || `Parameter: ${param.cfParam}`,
    };
    if (param.required) entry.required = true;
    if (param.default !== undefined) entry.default = param.default;
    if (param.min !== undefined) entry.minimum = param.min;
    if (param.max !== undefined) entry.maximum = param.max;
    if (param.step !== undefined) entry.step = param.step;
    return entry;
  };

  const generationsCfParams: Record<string, unknown> = {};
  const editsCfParams: Record<string, unknown> = {};

  for (const [key, param] of Object.entries(modelConfig.parameters)) {
    if (imageParamKeys.has(key)) continue;
    const entry = buildParamEntry(
      param as Parameters<typeof buildParamEntry>[0]
    );

    if (!editsOnlyKeys.has(key)) {
      generationsCfParams[key] = entry;
    }
    if (supportedTaskTypes.includes("edits")) {
      editsCfParams[key] = entry;
    }
  }

  const cfParams: Record<string, unknown> = {
    generations: generationsCfParams,
  };
  if (supportedTaskTypes.includes("edits")) {
    cfParams.edits = editsCfParams;
  }

  const schema: Record<string, unknown> = {
    model_id: modelConfig.id,
    name: modelConfig.name,
    description: modelConfig.description,
    provider: modelConfig.provider,
    input_format: modelConfig.inputFormat,
    response_format: modelConfig.responseFormat,
    supported_task_types: supportedTaskTypes,
    edit_capabilities: modelConfig.editCapabilities || {},
    max_input_images: modelConfig.maxInputImages || 1,
    cf_params: cfParams,
  };

  if (modelConfig.limits) {
    schema.limits = {
      max_prompt_length: modelConfig.limits.maxPromptLength,
      default_steps: modelConfig.limits.defaultSteps,
      max_steps: modelConfig.limits.maxSteps,
      min_width: modelConfig.limits.minWidth,
      max_width: modelConfig.limits.maxWidth,
      min_height: modelConfig.limits.minHeight,
      max_height: modelConfig.limits.maxHeight,
      supported_sizes: modelConfig.limits.supportedSizes,
    };
  }
  const genKeys = Object.keys(generationsCfParams).slice(0, 3);
  // Double-quote char as a named constant: example strings are
  // single-quoted literals containing double quotes (avoids escaping).
  const dq = '"';
  const genCfStr =
    genKeys.length > 0
      ? ", cf_params={" +
        genKeys.map((k) => dq + k + dq + ": ...").join(", ") +
        "}"
      : "";
  const generationsExample =
    "run_model(taskType=" +
    dq +
    "generations" +
    dq +
    ", model_id=" +
    dq +
    modelConfig.id +
    dq +
    ", prompt=" +
    dq +
    "your prompt" +
    dq +
    genCfStr +
    ")";

  let editsExample = "";
  if (supportedTaskTypes.includes("edits")) {
    const editKeys = Object.keys(editsCfParams)
      .filter((k) => editsOnlyKeys.has(k) || genKeys.includes(k))
      .slice(0, 3);
    const editCfStr =
      editKeys.length > 0
        ? ", cf_params={" +
          editKeys.map((k) => dq + k + dq + ": ...").join(", ") +
          "}"
        : "";
    editsExample =
      "\nFor image editing: run_model(taskType=" +
      dq +
      "edits" +
      dq +
      ", model_id=" +
      dq +
      modelConfig.id +
      dq +
      ", prompt=" +
      dq +
      "edit description" +
      dq +
      ", image=" +
      dq +
      "<base64>" +
      dq +
      editCfStr +
      ")";
  }

  schema.next_step = generationsExample + editsExample;

  return ok(JSON.stringify(schema, null, 2));
}
