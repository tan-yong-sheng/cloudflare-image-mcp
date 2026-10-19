// ============================================================================
// Main Worker Entry Point
// Routes all requests to appropriate handlers
// ============================================================================

import type { Env } from "./types.js";
import { WORKER_VERSION } from "./version.js";
import { corsHeaders, withCors } from "./utils/cors.js";
import { OpenAIEndpoint } from "./endpoints/openai-endpoint.js";
import { handleAdmin } from "./endpoints/admin.js";
import { handleMcpRequest, type McpMode } from "./endpoints/mcp-sdk-server.js";
import { serveFrontend } from "./endpoints/frontend.js";
import { getProviderPools, getExposureOverlay } from "./services/pool-cache.js";
import { overlayRegistry } from "./config/exposure-overlay.js";
import { listModels, MODEL_CONFIGS } from "./config/models.js";
import {
  authenticateRequest,
  requiresAuth,
  createUnauthorizedResponse,
  buildProtectedResourceMetadata,
} from "./middleware/auth.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle OPTIONS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Check authentication for protected routes
      if (requiresAuth(path, request.method)) {
        const authResult = authenticateRequest(request, env);
        if (!authResult.authenticated) {
          return withCors(
            createUnauthorizedResponse(authResult.error, request)
          );
        }
      }

      // Route: OAuth Protected Resource Metadata (RFC 9728, public by design:
      // unauthenticated clients must be able to resolve the resource_metadata
      // pointer carried in 401 WWW-Authenticate challenges)
      if (path === "/.well-known/oauth-protected-resource") {
        return new Response(
          JSON.stringify(buildProtectedResourceMetadata(request)),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Route: Frontend
      if (path === "/" || path === "/index.html" || path === "/admin") {
        // Credential readiness is part of the page, not a client probe:
        // the admin health route is gated, so an unauthenticated page
        // cannot tell "no credentials" from "403".
        const pools = await getProviderPools(env);
        return serveFrontend({ hasCredentials: pools.hasAnyServable() });
      }

      // Route: Health check
      if (path === "/health") {
        const timezone = env.TZ || "UTC";
        const now = new Date();

        // Format current time in configured timezone
        let currentTime: string;
        try {
          currentTime = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }).format(now);
        } catch (err) {
          currentTime = now.toISOString();
        }

        // Format deployedAt in configured timezone if available
        let deployedAtFormatted = env.DEPLOYED_AT || "unknown";
        if (env.DEPLOYED_AT && env.DEPLOYED_AT !== "unknown") {
          try {
            const deployedDate = new Date(env.DEPLOYED_AT);
            deployedAtFormatted = new Intl.DateTimeFormat("en-US", {
              timeZone: timezone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            }).format(deployedDate);
          } catch (err) {
            // Keep original value if parsing fails
          }
        }

        return new Response(
          JSON.stringify({
            status: "healthy",
            timestamp: Date.now(),
            currentTime,
            timezone,
            version: WORKER_VERSION,
            deployedAt: deployedAtFormatted,
            commitSha: env.COMMIT_SHA || "unknown",
            authEnabled: !!env.API_KEYS,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Route: OpenAI-compatible API
      if (path.startsWith("/v1/")) {
        const openai = new OpenAIEndpoint(env, {
          pools: await getProviderPools(env),
          exposureOverlay: await getExposureOverlay(env),
        });
        return openai.handle(request);
      }

      // Route: MCP endpoint (official SDK transport; handles /mcp, /mcp/smart,
      // /mcp/simple, and legacy /mcp*/message paths for Streamable HTTP)
      if (
        path === "/mcp" ||
        path === "/mcp/message" ||
        path.startsWith("/mcp/")
      ) {
        const mode: McpMode =
          path === "/mcp/simple" || path === "/mcp/simple/message"
            ? "single-model"
            : "multi-model";
        const defaultModel =
          mode === "single-model" ? url.searchParams.get("model") : null;
        return withCors(
          await handleMcpRequest(request, {
            env,
            baseUrl: url.protocol + "//" + url.host,
            mode,
            defaultModel,
            pools: await getProviderPools(env),
            exposureOverlay: await getExposureOverlay(env),
          })
        );
      }

      // Route: Admin API (R2, #74) — the bearer gate above already ran;
      // handleAdmin owns the X-Admin-Key gate and returns null for
      // non-admin paths.
      if (path.startsWith("/api/admin/")) {
        const adminResponse = await handleAdmin(request, path, env);
        if (adminResponse) return withCors(adminResponse);
      }

      // Route: API endpoints
      if (path === "/api/internal/models") {
        // Availability rides along with the descriptors, and it reads the
        // same predicate the request path does: a model is offered only
        // when its transport resolves a pool. Resolving by transport, not
        // by `provider`, is what keeps this in step with routing —
        // `provider` names the model's author, and several authors share
        // one set of credentials. The picker is public, so this reveals
        // which transports are configured, not which models exist: the
        // page already reports that much in its no-keys warning (ADR-001).
        const pools = await getProviderPools(env);
        const models = listModels(
          overlayRegistry(MODEL_CONFIGS, await getExposureOverlay(env))
        ).map((model) => ({
          ...model,
          available: pools.forTransport(model.inferenceProvider) !== undefined,
        }));
        return new Response(JSON.stringify(models), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Route: Image proxy (serve images from R2 through the worker)
      if (path.startsWith("/images/")) {
        const imageKey = path.substring(1); // Remove leading slash
        try {
          const image = await env.IMAGE_BUCKET.get(imageKey);
          if (!image) {
            return new Response("Image not found", { status: 404 });
          }
          return new Response(image.body, {
            headers: {
              "Content-Type": image.httpMetadata?.contentType || "image/png",
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch (error) {
          return new Response("Error fetching image", { status: 500 });
        }
      }

      // 404 for unknown routes (OpenAI error envelope: router serves /v1/*)
      return new Response(
        JSON.stringify({
          error: {
            message: "Not found",
            type: "invalid_request_error",
            code: null,
          },
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  },

  // Scheduled task for cleanup (cron job)
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron === "0 * * * *") {
      // Every hour
      const { ImageGeneratorService } =
        await import("./services/image-generator.js");
      const generator = new ImageGeneratorService(env);
      const deleted = await generator.cleanupExpired();
      console.log(`Cleaned up ${deleted} expired images`);
    }
  },
} satisfies ExportedHandler<Env>;
