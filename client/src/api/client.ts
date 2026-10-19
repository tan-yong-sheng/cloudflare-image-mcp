/**
 * A thin fetch wrapper for the Worker's API.
 *
 * Every response is returned as a result object rather than thrown, so a
 * caller can tell "the server said no" (a status) from "the request never
 * arrived" (a thrown network error) — the same distinction the legacy
 * frontend made with its `{ ok, status, data }` envelope.
 */

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  /** The bearer API key, sent as `Authorization: Bearer`. */
  authToken?: string | null;
  /** The management key, sent as `X-Admin-Key`. */
  adminKey?: string | null;
  signal?: AbortSignal;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<ApiResult<T>> {
  const { method = "GET", body, authToken, adminKey, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  if (adminKey) headers["X-Admin-Key"] = adminKey;

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  let data: T | null = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      // A non-JSON body (an HTML error page, say) is not fatal here: the
      // status is what the caller acts on.
      data = null;
    }
  }

  return { ok: response.ok, status: response.status, data };
}
