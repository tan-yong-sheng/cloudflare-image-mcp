// ============================================================================
// Static asset serving for the React client
// ============================================================================
// The client (client/) is built by Vite and deployed as Workers Static
// Assets. The Worker keeps every route it already owned and hands the
// rest to the asset binding, so the hashed bundle files are served
// without the Worker knowing the client's output layout.
//
// The client is the only frontend: the legacy single-file template and
// the ?spa=1 opt-in are gone.

import type { Env } from "../types.js";

/**
 * The URL prefix the client's build output is served under.
 *
 * Vite writes the bundle, the stylesheet and the icon fonts into
 * `build.assetsDir` and references them from the document, so the prefix
 * is part of the contract between the client build and the Worker. The
 * Worker checks it before the auth gate: the build output is public —
 * every browser downloads it — while the gate governs the API routes.
 *
 * The client's vite.config.ts must keep `build.assetsDir` in step and
 * must not publish a public directory: the dev-config test fails if
 * either drifts, because a bundle in another directory 404s and a file
 * outside this prefix answers 401.
 */
export const CLIENT_ASSET_PREFIX = "/assets/";

/** Whether a path addresses the client's build output. */
export function isClientAssetPath(path: string): boolean {
  return path.startsWith(CLIENT_ASSET_PREFIX);
}

/**
 * Serve a path from the client's static assets.
 *
 * Returns null when the client is not deployed (no asset binding) or the
 * path is not one of the client's own. The asset worker answers an
 * unknown path with 404, and every route the Worker owns has already
 * been handled by the caller, so a 404 here means "not the client's" and
 * the caller keeps its own error envelope.
 */
export async function serveClientAsset(
  request: Request,
  env: Env
): Promise<Response | null> {
  if (!env.ASSETS) return null;
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  const response = await env.ASSETS.fetch(new Request(request.url, { method }));
  if (response.status === 404) return null;
  return response;
}
