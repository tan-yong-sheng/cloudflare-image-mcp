// ============================================================================
// MCP SDK Server Factories - official @modelcontextprotocol/server transport
// ============================================================================
// Stateless: a fresh McpServer is built per request (Workers isolates hold
// no shared session state), served via createMcpHandler's built-in 2025-era
// legacy fallback. Two factories preserve the existing endpoint contract:
// multi-model (/mcp, /mcp/smart) and single-model (/mcp/simple?model=...).

import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import type { Env } from "../types.js";
import { ImageGeneratorService } from "../services/image-generator.js";
import {
  RunModelMultiSchema,
  RunModelSingleSchema,
  DescribeModelSchema,
  EmptySchema,
  type RunModelMultiArgs,
  type RunModelSingleArgs,
  type DescribeModelArgs,
} from "./mcp-schemas.js";
import {
  handleRunModel,
  handleListModels,
  handleDescribeModel,
  type ToolsContext,
} from "./mcp-tools.js";

export type McpMode = "multi-model" | "single-model";

export interface McpHandlerDeps {
  env: Env;
  /** Worker origin, for absolutizing relative image URLs in tool output. */
  baseUrl: string;
  mode: McpMode;
  /** Required when mode is single-model: the pinned model (?model=). */
  defaultModel?: string | null;
}

/**
 * Build an SDK McpServer for one request.
 */
export function buildMcpServer(deps: McpHandlerDeps): McpServer {
  const generator = new ImageGeneratorService(deps.env);
  const ctx: ToolsContext = { generator, baseUrl: deps.baseUrl };

  const server = new McpServer({
    name: "cloudflare-image-mcp",
    version: "0.1.0",
  });

  if (deps.mode === "single-model") {
    const defaultModel = deps.defaultModel ?? null;
    server.registerTool(
      "run_model",
      {
        description: defaultModel
          ? `Generate or edit images using model ${defaultModel}. Set taskType to "generations" for text-to-image or "edits" for image editing. Use cf_params for model-specific parameters. Use /mcp or /mcp/smart for model discovery.`
          : 'Generate or edit images using the model specified via ?model= on /mcp/simple. Set taskType to "generations" for text-to-image or "edits" for image editing. Use cf_params for model-specific parameters.',
        inputSchema: RunModelSingleSchema,
      },
      async (args) =>
        handleRunModel(ctx, args as RunModelSingleArgs, defaultModel)
    );
  } else {
    server.registerTool(
      "run_model",
      {
        description:
          'Generate or edit images with a specific model. Set taskType to "generations" for text-to-image or "edits" for image editing. REQUIRED WORKFLOW: (1) call list_models, (2) call describe_model(model_id) to discover supported cf_params, (3) call run_model. DO NOT skip describe_model — parameters vary between models.',
        inputSchema: RunModelMultiSchema,
      },
      async (args) => handleRunModel(ctx, args as RunModelMultiArgs, null)
    );

    server.registerTool(
      "list_models",
      {
        description:
          "STEP 1: List all available image generation models with their model_ids and supported task types (text-to-image, image-to-image). After calling this, you MUST call describe_model for your chosen model_id before using run_model.",
        inputSchema: EmptySchema,
      },
      async () => handleListModels(ctx)
    );

    server.registerTool(
      "describe_model",
      {
        description:
          "STEP 2 (REQUIRED): Get the complete parameter schema for a specific model. Reveals ALL available cf_params (steps, guidance, width, height, seed, etc.) with types, ranges, and defaults. Each model supports different parameters. Call list_models first to get valid model_ids.",
        inputSchema: DescribeModelSchema,
      },
      async (args) => handleDescribeModel(ctx, args as DescribeModelArgs)
    );
  }

  return server;
}

/**
 * Serve one MCP HTTP request via the official SDK handler.
 * Stateless: the server factory builds a fresh McpServer per request.
 * Transport failures are mapped to the MCP error contract (HTTP 200 +
 * JSON-RPC error) so they never escape as a bare HTTP 500.
 */
export async function handleMcpRequest(
  request: Request,
  deps: McpHandlerDeps
): Promise<Response> {
  const handler = createMcpHandler(() => buildMcpServer(deps));
  try {
    return await handler.fetch(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`MCP transport failed: ${message}`);
    // Echo the request ID when determinable so clients can correlate the
    // failure (null only when the body is unreadable, e.g. parse errors).
    const body = await request
      .clone()
      .json()
      .catch(() => null);
    const id =
      body && typeof body === "object" && "id" in body
        ? ((body as { id: unknown }).id ?? null)
        : null;
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: "Internal error" },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } finally {
    await handler.close().catch(() => {});
  }
}
