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
  updateProviderKey,
  type AdminCommitResult,
  type AdminD1,
  type AdminWrite,
} from "../services/admin-store.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * One OpenAI-style error envelope for every admin surface (per
 * CODING_STANDARDS error envelopes). status is the transport code; type
 * names the kind. Callers below only supply the message.
 */
function errorJson(
  status: number,
  message: string,
  type: "invalid_request_error" | "api_error" = "invalid_request_error"
): Response {
  return json({ error: { message, type, code: null } }, status);
}

/** 403 response: standard OpenAI error envelope with invalid_request_error. */
function forbidden(): Response {
  return errorJson(403, "Invalid admin key");
}

const MAX_ADMIN_KEY_LENGTH = 512;

/** Admin write bodies are tiny ({providerId,label,apiToken}); cap the read. */
const MAX_ADMIN_BODY_BYTES = 16 * 1024;

/**
 * Constant-time comparison using fixed-size SHA-256 digests over padded buffers.
 * Encodes inputs to UTF-8 and pads both buffers to MAX_ADMIN_KEY_LENGTH bytes.
 * Validates byte lengths first so multibyte strings never overflow the buffer.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (
    ab.byteLength > MAX_ADMIN_KEY_LENGTH ||
    bb.byteLength > MAX_ADMIN_KEY_LENGTH
  ) {
    return false;
  }
  const paddedA = new Uint8Array(MAX_ADMIN_KEY_LENGTH);
  const paddedB = new Uint8Array(MAX_ADMIN_KEY_LENGTH);
  paddedA.set(ab);
  paddedB.set(bb);
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", paddedA),
    crypto.subtle.digest("SHA-256", paddedB),
  ]);
  const viewA = new Uint8Array(digestA);
  const viewB = new Uint8Array(digestB);
  let diff = ab.byteLength ^ bb.byteLength;
  for (let i = 0; i < 32; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

/** Second gate for admin routes; call after the bearer gate passed.
 * Fail-closed: an unconfigured management key (or an empty presented
 * key) never authenticates — empty-equals-empty must not open the gate.
 * Inputs exceeding MAX_ADMIN_KEY_LENGTH fail closed before hashing. */
export async function checkAdminKey(
  request: Request,
  env: Env
): Promise<boolean> {
  try {
    const configured = env.ADMIN_API_KEY ?? "";
    if (configured.length === 0 || configured.length > MAX_ADMIN_KEY_LENGTH) {
      return false;
    }
    const presented = request.headers.get("X-Admin-Key") ?? "";
    if (presented.length === 0 || presented.length > MAX_ADMIN_KEY_LENGTH) {
      return false;
    }
    return await timingSafeEqual(presented, configured);
  } catch {
    return false;
  }
}

/**
 * Production adapter: a D1Database-shaped handle plus the atomic commit
 * above. Statements are described by the store, executed nowhere until
 * commit — the same write lists the S2 harness runs inside BEGIN/COMMIT.
 */
function d1AdminStore(db: NonNullable<Env["PROVIDER_DB"]>): AdminD1 {
  return {
    commit: commitWithD1(db),
    // D1PreparedStatement already satisfies BoundStmt & { bind }, so the
    // engine's own statement crosses the seam directly. An extra adapter
    // here would be a pass-through: its interface mirrors the statement's.
    prepare: (sql: string) => db.prepare(sql),
  };
}

export interface AdminDeps {
  adminStore?: AdminD1;
}

function badRequest(message: string): Response {
  return errorJson(400, message);
}

function internalError(message = "Internal server error"): Response {
  return errorJson(500, message, "api_error");
}

function storeError(error: unknown): Response {
  if (error instanceof AdminStoreError) {
    if (error.status === 500) {
      return internalError("key write failed");
    }
    return errorJson(error.status, error.message);
  }
  // Sanitize unexpected DB or runtime errors: do not leak raw error.message to caller
  console.error("Admin store error:", error);
  return internalError("Internal server error");
}

/**
 * Read the request body as text, refusing anything over MAX_ADMIN_BODY_BYTES.
 * Content-Length short-circuits the common case; the reader also counts bytes
 * so an absent or understated header cannot smuggle a large body past JSON
 * parsing and sealing. Oversize is a 413, not a silent truncation.
 */
async function readBoundedBody(request: Request): Promise<string> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_ADMIN_BODY_BYTES) {
    throw new AdminStoreError(413, "request body too large");
  }
  const body = request.body;
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_ADMIN_BODY_BYTES) {
        throw new AdminStoreError(413, "request body too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof AdminStoreError) {
      await reader.cancel().catch(() => {});
      throw error;
    }
    throw new AdminStoreError(400, "request body must be a JSON object");
  }
  return text;
}

async function requestJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await readBoundedBody(request);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Falls through to the object-shape rejection below.
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
 * module owns the management-key gate and the method dispatch. That
 * bearer gate only exists when API_KEYS is set — the app-wide auth bypass
 * treats unset API_KEYS as authenticated — so this module refuses admin
 * outright in that state instead of degrading to a single gate. Writes go
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
  if (!env.API_KEYS) {
    console.warn("admin API refused: API_KEYS is not configured");
    return forbidden();
  }
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
    const update = path.match(/^\/api\/admin\/keys\/(\d+)$/);
    if (request.method === "PATCH" && update) {
      return await handleUpdateKey(request, env, active, Number(update[1]));
    }
    return errorJson(404, "Not found");
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
  return async (writes: readonly AdminWrite[]): Promise<AdminCommitResult> => {
    const results = (await db.batch(
      writes.map((w) => db.prepare(w.sql).bind(...w.params))
    )) as readonly { meta?: { last_row_id?: number } }[];
    // D1 reports the inserted row id on the first write's result; hand it
    // back so add keys resolve inside the commit, never via a later read.
    const keyId =
      typeof results[0]?.meta?.last_row_id === "number"
        ? results[0].meta.last_row_id
        : null;
    return { keyId };
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
  let fields: KeyFields;
  try {
    fields = parseKeyFields(body, { requireToken: true });
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
      apiToken: fields.apiToken ?? "",
      accountId: fields.accountId,
      weight: fields.weight,
      enabled: fields.enabled,
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

const MAX_WEIGHT = 1_000_000;

interface KeyFields {
  accountId?: string;
  weight?: number;
  enabled?: boolean;
  apiToken?: string;
}

/** Shared body parsing for add/edit writes; 400s as AdminStoreError. */
function parseKeyFields(
  body: Record<string, unknown>,
  options: { requireToken: boolean }
): KeyFields {
  const fields: KeyFields = {};
  if (body["accountId"] !== undefined) {
    if (typeof body["accountId"] !== "string") {
      throw new AdminStoreError(400, "accountId must be a string");
    }
    fields.accountId = body["accountId"];
  }
  if (body["weight"] !== undefined) {
    const weight = body["weight"];
    if (
      typeof weight !== "number" ||
      !Number.isInteger(weight) ||
      weight < 0 ||
      weight > MAX_WEIGHT
    ) {
      throw new AdminStoreError(
        400,
        "weight must be an integer between 0 and " + MAX_WEIGHT
      );
    }
    fields.weight = weight;
  }
  if (body["enabled"] !== undefined) {
    if (typeof body["enabled"] !== "boolean") {
      throw new AdminStoreError(400, "enabled must be a boolean");
    }
    fields.enabled = body["enabled"];
  }
  if (body["apiToken"] !== undefined) {
    if (typeof body["apiToken"] !== "string") {
      throw new AdminStoreError(400, "apiToken must be a string");
    }
    fields.apiToken = body["apiToken"];
  }
  if (options.requireToken && !fields.apiToken) {
    throw new AdminStoreError(400, "apiToken is required");
  }
  return fields;
}

/**
 * PATCH /api/admin/keys/:id — edit a key. Field edits (account id,
 * weight, enabled) with optional rotate-on-save: a present apiToken
 * rides the revoke-then-insert ledger inside the same transaction.
 * Echoes identity + edited fields only; the token never comes back out.
 */
async function handleUpdateKey(
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
  let fields: KeyFields;
  try {
    fields = parseKeyFields(body, { requireToken: false });
  } catch (error) {
    return storeError(error);
  }
  const dataKey = env.PROVIDER_DATA_KEY;
  if (fields.apiToken && !dataKey) {
    return internalError("no sealing key configured");
  }
  try {
    const summary = await updateProviderKey(
      store,
      (t) => sealToken(t, dataKey ?? ""),
      {
        keyId,
        accountId: fields.accountId,
        weight: fields.weight,
        enabled: fields.enabled,
        apiToken: fields.apiToken ? fields.apiToken : undefined,
      }
    );
    return json(summary);
  } catch (error) {
    return storeError(error);
  }
}
