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
 * Comparison with no early exit: iterate the full maximum length so
 * neither the presence of a key nor its length is a timing oracle.
 * Short/missing inputs pad to the loop length; any difference — in
 * bytes or in length — fails closed at the single return.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const n = Math.max(ab.length, bb.length, 1);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < n; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Second gate for admin routes; call after the bearer gate passed.
 * Fail-closed: an unconfigured management key (or an empty presented
 * key) never authenticates — empty-equals-empty must not open the gate. */
export function checkAdminKey(request: Request, env: Env): boolean {
  const configured = env.ADMIN_API_KEY ?? "";
  if (configured.length === 0) return false;
  const presented = request.headers.get("X-Admin-Key") ?? "";
  if (presented.length === 0) return false;
  return timingSafeEqual(presented, configured);
}

interface D1Row {
  [key: string]: unknown;
}

function rows(res: { results?: D1Row[] } | null | undefined): D1Row[] {
  return res?.results ?? [];
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
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

function storeError(error: unknown): Response {
  if (error instanceof AdminStoreError) {
    const status = error.status === 500 ? 500 : error.status;
    const body =
      status === 500
        ? { error: "Internal server error", message: "key write failed" }
        : {
            error: {
              message: error.message,
              type: "invalid_request_error",
              code: null,
            },
          };
    return json(body, status);
  }
  throw error;
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
  _request: Request,
  env: Env
): Promise<Response> {
  const db = env.PROVIDER_DB;
  if (!db)
    return json({ providers: [], keys: [], exposure: [], configVersion: null });

  const providers = rows(
    await db.prepare("SELECT id, display_name FROM providers").all()
  ).map((p) => ({
    id: String(p["id"]),
    displayName: String(p["display_name"]),
  }));

  const keys = rows(
    await db
      .prepare(
        `SELECT k.id AS id,
                k.provider_id AS providerId,
                k.label AS label,
                k.weight AS weight,
                k.enabled AS enabled,
                MAX(v.version) AS activeVersion
           FROM provider_keys k
           LEFT JOIN credential_versions v
             ON v.provider_key_id = k.id AND v.revoked_at IS NULL
          GROUP BY k.id`
      )
      .all()
  ).map((k) => ({
    id: num(k["id"]),
    providerId: String(k["providerId"]),
    label: String(k["label"]),
    weight: num(k["weight"]),
    enabled: num(k["enabled"]) === 1,
    activeVersion: k["activeVersion"] === null ? null : num(k["activeVersion"]),
  }));

  const versionRow = await db
    .prepare("SELECT version FROM config_versions WHERE id = 1")
    .first<{ version: number }>();
  const exposure = rows(
    await db
      .prepare(
        `SELECT e.model_id AS modelId,
                e.enabled AS enabled,
                e.alias AS alias,
                e.is_default AS isDefault,
                s.scope AS scope
           FROM exposure_overrides e
           LEFT JOIN excluded_scopes s ON s.model_id = e.model_id`
      )
      .all()
  ).map((r) => ({
    modelId: String(r["modelId"]),
    enabled: num(r["enabled"]) === 1,
    alias: r["alias"] === null ? null : String(r["alias"]),
    isDefault: num(r["isDefault"]) === 1,
    scope: r["scope"] === null ? null : String(r["scope"]),
  }));
  return json({
    providers,
    keys,
    exposure,
    configVersion: versionRow?.version ?? null,
  });
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
  if (!checkAdminKey(request, env)) return forbidden();
  const store = deps?.adminStore;
  if (request.method === "GET" && path === "/api/admin/health") {
    return handleAdminHealth(request, env);
  }
  const db = env.PROVIDER_DB;
  if (!db)
    return json(
      { error: "Internal server error", message: "no provider store bound" },
      500
    );
  const active = store ?? d1AdminStore(db);
  if (request.method === "POST" && path === "/api/admin/keys") {
    return handleAddKey(request, env, active);
  }
  const rotate = path.match(/^\/api\/admin\/keys\/(\d+)\/rotate$/);
  if (request.method === "POST" && rotate) {
    return handleRotateKey(request, env, active, Number(rotate[1]));
  }
  const disable = path.match(/^\/api\/admin\/keys\/(\d+)\/disable$/);
  if (request.method === "POST" && disable) {
    return handleDisableKey(request, env, active, Number(disable[1]));
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
    return json(
      { error: "Internal server error", message: "no sealing key configured" },
      500
    );
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
    return json(
      { error: "Internal server error", message: "no sealing key configured" },
      500
    );
  }
  if (typeof body["apiToken"] !== "string" || body["apiToken"].trim() === "") {
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
