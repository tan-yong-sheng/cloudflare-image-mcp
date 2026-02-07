// ============================================================================
// Main Worker Entry Point
// Routes all requests to appropriate handlers
// ============================================================================

import type { Env } from './types.js';
import { OpenAIEndpoint } from './endpoints/openai-endpoint.js';
import { MCPEndpoint } from './endpoints/mcp-endpoint.js';
import { serveFrontend } from './endpoints/frontend.js';
import { listModels } from './config/models.js';
import { authenticateRequest, requiresAuth, createUnauthorizedResponse } from './middleware/auth.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Check authentication for protected routes
      if (requiresAuth(path, request.method)) {
        const authResult = authenticateRequest(request, env);
        if (!authResult.authenticated) {
          return createUnauthorizedResponse(authResult.error);
        }
      }

      // Route: Frontend
      if (path === '/' || path === '/index.html') {
        return serveFrontend();
      }

      // Route: Health check
      if (path === '/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: Date.now(),
          version: '0.1.0',
          deployedAt: env.DEPLOYED_AT || 'unknown',
          commitSha: env.COMMIT_SHA || 'unknown',
          authEnabled: !!env.API_KEYS,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Route: OpenAI-compatible API
      if (path.startsWith('/v1/')) {
        const openai = new OpenAIEndpoint(env);
        return openai.handle(request);
      }

      // Route: MCP endpoint (handles /mcp, /mcp/message, /mcp/?transport=sse)
      if (path === '/mcp' || path === '/mcp/message' || path.startsWith('/mcp/')) {
        const mcp = new MCPEndpoint(env);
        return mcp.handle(request);
      }

      // Route: API endpoints
      if (path === '/api/internal/models') {
        const models = listModels();
        return new Response(JSON.stringify(models), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Route: Image proxy (serve images from R2 through the worker)
      if (path.startsWith('/images/')) {
        const imageKey = path.substring(1); // Remove leading slash
        try {
          const image = await env.IMAGE_BUCKET.get(imageKey);
          if (!image) {
            return new Response('Image not found', { status: 404 });
          }
          return new Response(image.body, {
            headers: {
              'Content-Type': image.httpMetadata?.contentType || 'image/png',
              'Cache-Control': 'public, max-age=86400',
            },
          });
        } catch (error) {
          return new Response('Error fetching image', { status: 500 });
        }
      }

      // 404 for unknown routes
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },

  // Scheduled task for cleanup (cron job)
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron === '0 * * * *') { // Every hour
      const { ImageGeneratorService } = await import('./services/image-generator.js');
      const generator = new ImageGeneratorService(env);
      const deleted = await generator.cleanupExpired();
      console.log(`Cleaned up ${deleted} expired images`);
    }
  },
} satisfies ExportedHandler<Env>;
