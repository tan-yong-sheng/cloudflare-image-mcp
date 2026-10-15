// ============================================================================
// Provider admin API - D1 pool health + key writes (R2, #74)
// ============================================================================
// Read first, write second (per #74): health exposes pool counts, labels,
// exposure, and config version — labels and counts only, never secret
// values. Key writes seal server-side with PROVIDER_DATA_KEY and ride the
// R1b ledger: add inserts a version-1 row, rotate revokes+inserts in one
// transaction, disable flips enabled. Every mutation bumps config_versions
// (the pool cache's reload signal) and writes an admin_audit row (actor,
// action, key). Routes sit behind TWO gates: the existing API_KEYS bearer
// (401, unchanged) then X-Admin-Key against ADMIN_API_KEY (403) — checked
// constant-time so a wrong admin key isn't a timing oracle.

import type { Env } from "../types.js";
import { sealToken } from "../services/provider-crypto.js";
import {
  addProviderKey,
  AdminStoreError,
  disableProviderKey,
  getAdminHealth,
  rotateProviderKey,
  type AdminD1,
  type AdminWrite,
} from "../services/admin-store.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 403 twin of the middleware 401: same envelope, different status. */
function forbidden(): Response {
  return new Response(
    JSON.stringify({ error: "Forbidden", message: "Invalid admin key" }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Constant-time comparison using fixed-size SHA-256 digests.
 * Hashing both inputs to fixed 32-byte digests guarantees that
 * loop duration is strictly invariant to input string lengths,
 * eliminating length-oracle timing leakage.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const viewA = new Uint8Array(digestA);
  const viewB = new Uint8Array(digestB);
  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

/** Second gate for admin routes; call after the bearer gate passed.
 * Fail-closed: an unconfigured management key (or an empty presented
 * key) never authenticates — empty-equals-empty must not open the gate. */
export async function checkAdminKey(
  request: Request,
  env: Env
): Promise<boolean> {
  const configured = env.ADMIN_API_KEY ?? "";
  if (configured.length === 0) return false;
  const presented = request.headers.get("X-Admin-Key") ?? "";
  if (presented.length === 0) return false;
  return timingSafeEqual(presented, configured);
}

/**
 * Production adapter: a D1Database-shaped handle plus the atomic commit
 * above. Statements are described by the store, executed nowhere until
 * commit — the same write lists the S2 harness runs inside BEGIN/COMMIT.
 */
function d1AdminStore(db: NonNullable<Env["PROVIDER_DB"]>): AdminD1 {
  const commit = commitWithD1(db);
  const wrap = (stmt: {
    first<T>(): Promise<T | null>;
    all<T>(): Promise<{ results?: T[] }>;
    run(): Promise<unknown>;
  }) => ({
    first: <T>() => stmt.first<T>(),
    all: <T>() => stmt.all<T>(),
    run: () => stmt.run(),
  });
  return {
    commit,
    prepare: (sql: string) => {
      const unbound = wrap(db.prepare(sql));
      return {
        ...unbound,
        bind: (...params: unknown[]) => wrap(db.prepare(sql).bind(...params)),
      };
    },
  };
}

export interface AdminDeps {
  adminStore?: AdminD1;
}

function badRequest(message: string): Response {
  return json(
    {
      error: { message, type: "invalid_request_error", code: null },
    },
    400
  );
}

function internalError(message = "Internal server error"): Response {
  return json(
    {
      error: {
        message,
        type: "api_error",
        code: null,
      },
    },
    500
  );
}

function storeError(error: unknown): Response {
  if (error instanceof AdminStoreError) {
    if (error.status === 500) {
      return internalError("key write failed");
    }
    return json(
      {
        error: {
          message: error.message,
          type: "invalid_request_error",
          code: null,
        },
      },
      error.status
    );
  }
  // Sanitize unexpected DB or runtime errors: do not leak raw error.message to caller
  console.error("Admin store error:", error);
  return internalError("Internal server error");
}

async function requestJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Falls through to the empty-object rejection below.
  }
  throw new AdminStoreError(400, "request body must be a JSON object");
}

/**
 * GET /api/admin/health — pool counts, key labels, exposure, config
 * version. Active credential versions only; disabled keys are listed with
 * their flag so an operator can see what is parked.
 */
export async function handleAdminHealth(
  store: AdminD1 | null
): Promise<Response> {
  if (!store) {
    return json({ providers: [], keys: [], exposure: [], configVersion: null });
  }
  return json(await getAdminHealth(store));
}

/**
 * Route admin requests. The bearer gate already ran in index.ts; this
 * module owns the management-key gate and the method dispatch. Writes go
 * through an injectable store (deps.adminStore, default d1AdminStore):
 * the store executes the real SQL against any D1Database-shaped handle,
 * so the S2 harness runs the same statements as production against the
 * real migrations, while S1 exercises them through the router.
 */
export async function handleAdmin(
  request: Request,
  path: string,
  env: Env,
  deps?: AdminDeps
): Promise<Response | null> {
  if (!path.startsWith("/api/admin/")) return null;
  if (!(await checkAdminKey(request, env))) return forbidden();
  try {
    const store = deps?.adminStore;
    const db = env.PROVIDER_DB;
    const active = store ?? (db ? d1AdminStore(db) : null);
    if (request.method === "GET" && path === "/api/admin/health") {
      return await handleAdminHealth(active);
    }
    if (!active) return internalError("no provider store bound");
    if (request.method === "POST" && path === "/api/admin/keys") {
      return await handleAddKey(request, env, active);
    }
    const rotate = path.match(/^\/api\/admin\/keys\/(\d+)\/rotate$/);
    if (request.method === "POST" && rotate) {
      return await handleRotateKey(request, env, active, Number(rotate[1]));
    }
    const disable = path.match(/^\/api\/admin\/keys\/(\d+)\/disable$/);
    if (request.method === "POST" && disable) {
      return await handleDisableKey(request, env, active, Number(disable[1]));
    }
    return json(
      {
        error: {
          message: "Not found",
          type: "invalid_request_error",
          code: null,
        },
      },
      404
    );
  } catch (error) {
    return storeError(error);
  }
}

/**
 * Production commit: D1 batch of BOUND, UNEXECUTED prepared statements.
 * The statements must reach db.batch without running first — mapping
 * over runners (s.run()) would execute each write in its own auto-commit
 * and hand promises to batch, breaking atomicity and the call itself.
 */
export function commitWithD1(
  db: NonNullable<Env["PROVIDER_DB"]>
): AdminD1["commit"] {
  return async (writes: readonly AdminWrite[]): Promise<void> => {
    await db.batch(writes.map((w) => db.prepare(w.sql).bind(...w.params)));
  };
}

/** POST /api/admin/keys — add a key. Seals server-side; echoes identity only. */
async function handleAddKey(
  request: Request,
  env: Env,
  store: AdminD1
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await requestJson(request);
  } catch (error) {
    return storeError(error);
  }
  const dataKey = env.PROVIDER_DATA_KEY;
  if (!dataKey) {
    return internalError("no sealing key configured");
  }
  try {
    const summary = await addProviderKey(store, (t) => sealToken(t, dataKey), {
      providerId:
        typeof body["providerId"] === "string" ? body["providerId"] : "",
      label: typeof body["label"] === "string" ? body["label"] : "",
      apiToken: typeof body["apiToken"] === "string" ? body["apiToken"] : "",
    });
    // Identity only: the settings page echoes this — the token that
    // arrived in the request must never come back out.
    return json(summary, 201);
  } catch (error) {
    return storeError(error);
  }
}

/** POST /api/admin/keys/:id/rotate — supersede the active version. */
async function handleRotateKey(
  request: Request,
  env: Env,
  store: AdminD1,
  keyId: number
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await requestJson(request);
  } catch (error) {
    return storeError(error);
  }
  const dataKey = env.PROVIDER_DATA_KEY;
  if (!dataKey) {
    return internalError("no sealing key configured");
  }
  if (typeof body["apiToken"] !== "string" || body["apiToken"].length === 0) {
    return badRequest("apiToken is required");
  }
  try {
    const summary = await rotateProviderKey(
      store,
      (t) => sealToken(t, dataKey),
      keyId,
      body["apiToken"]
    );
    return json(summary);
  } catch (error) {
    return storeError(error);
  }
}

/** POST /api/admin/keys/:id/disable — park the key (kept, unserved). */
async function handleDisableKey(
  request: Request,
  env: Env,
  store: AdminD1,
  keyId: number
): Promise<Response> {
  try {
    return json(await disableProviderKey(store, keyId));
  } catch (error) {
    return storeError(error);
  }
}
