// ============================================================================
// Shared CORS utils
// Single home for the worker CORS contract so the router and the OpenAI
// endpoint cannot drift apart. Values mirror the router superset: MCP
// clients send Mcp-Session-Id / Mcp-Protocol-Version (SDK transports) and
// Last-Event-ID (stream resumption); browsers reject the preflight — and the
// request never fires — unless these are allow-listed.
// ============================================================================

/**
 * CORS headers applied to every JSON response and preflight reply.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, MCP-Transport",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
};

/**
 * Apply the shared CORS headers onto a response built elsewhere
 * (SDK handler, auth challenge) so browser clients can read it.
 * Existing headers (Content-Type, WWW-Authenticate) are preserved.
 */
export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
