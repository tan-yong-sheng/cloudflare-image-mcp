// ============================================================================
// MCP Tool Schemas - zod declarations shared by multi/single-model servers
// ============================================================================
// The SDK validates tool arguments against these schemas before the handler
// runs (invalid input -> standard JSON-RPC error, never a hand-built one).
// Schemas are ZodRawShape records (the SDK v2 registerTool form); the
// ZodObject wrappers below exist only for callback argument typing.
// Cloudflare-specific parameters vary per model AND task type, so they stay
// an open object here; exact keys come from describe_model at runtime.

import * as z from "zod";

export const TaskTypeSchema = z.enum(["generations", "edits"]);

const RunModelBaseShape = {
  taskType: TaskTypeSchema.describe(
    'Task type. "generations" for text-to-image, "edits" for image editing/inpainting.'
  ),
  prompt: z.string().describe("Text prompt describing the desired image."),
  n: z
    .number()
    .min(1)
    .max(8)
    .optional()
    .describe("Number of images to generate (1-8)."),
  size: z.string().optional().describe('Image size (e.g., "1024x1024").'),
  image: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      'Required when taskType="edits". Base64-encoded input image(s). Array of up to 4 for multi-reference models.'
    ),
  mask: z
    .string()
    .optional()
    .describe(
      'Optional. Only for taskType="edits". Base64-encoded mask for inpainting. White areas edited, black preserved.'
    ),
  cf_params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Cloudflare Workers AI specific parameters (e.g., steps, seed, guidance, strength). " +
        "Available params differ per model and per taskType. " +
        "Call describe_model(model_id) for the exact keys."
    ),
};

/** Shape for multi-model endpoints (/mcp, /mcp/smart): model_id required. */
export const RunModelMultiShape = {
  ...RunModelBaseShape,
  model_id: z
    .string()
    .describe(
      "Exact model_id from list_models output (format: @cf/{provider}/{model_name})."
    ),
};

/** Shape for the single-model endpoint (/mcp/simple): model comes from ?model=. */
export const RunModelSingleShape = RunModelBaseShape;

export const DescribeModelShape = {
  model_id: z.string().describe("Exact model_id from list_models output."),
};

// Object wrappers: the SDK v2 standard-schema overload accepts ZodObject
// input schemas (StandardSchemaWithJSON); raw shapes hit the deprecated
// legacy overload instead.
export const RunModelMultiSchema = z.object(RunModelMultiShape);
export const RunModelSingleSchema = z.object(RunModelSingleShape);
export const DescribeModelSchema = z.object(DescribeModelShape);
export const EmptySchema = z.object({});

export type RunModelMultiArgs = z.infer<typeof RunModelMultiSchema>;
export type RunModelSingleArgs = z.infer<typeof RunModelSingleSchema>;
export type DescribeModelArgs = z.infer<typeof DescribeModelSchema>;
