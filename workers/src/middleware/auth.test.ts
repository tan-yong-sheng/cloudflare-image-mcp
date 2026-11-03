// ============================================================================
// Auth middleware unit tests - pure logic, no bindings, no network
// ============================================================================
// Seam: authenticateRequest / requiresAuth public functions.
// Expected values are literals from the documented auth contract
// (Bearer scheme, public paths, Unauthorized envelope).

import { describe, expect, test } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { freshDb } from "../test-utils/migration-fixtures.js";
import {
  callerKeyVerifier,
  deriveCallerPepper,
} from "../services/caller-crypto.js";
import {
  authenticateRequest,
  buildBearerChallenge,
  buildProtectedResourceMetadata,
  createUnauthorizedResponse,
  getResourceMetadataUrl,
  requiresAuth,
} from "./auth.js";
import type { Env } from "../types.js";

const authedEnv = { API_KEYS: "key-one,key-two" } as Env;
const openEnv = {} as Env;

function authedRequest(token?: string): Request {
  const headers = new Headers();
  if (token) headers.set("Authorization", token);
  return new Request("https://worker.test/mcp", { headers });
}

describe("authenticateRequest", () => {
  test("open-by-default when no API keys configured", async () => {
    const result = await authenticateRequest(authedRequest(), openEnv);
    expect(result).toEqual({ authenticated: true });
  });

  test("valid key authenticates", async () => {
    const result = await authenticateRequest(
      authedRequest("Bearer key-two"),
      authedEnv
    );
    expect(result).toEqual({ authenticated: true, apiKey: "key-two" });
  });

  test("missing header is rejected", async () => {
    const result = await authenticateRequest(authedRequest(), authedEnv);
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Authorization header");
  });

  test("non-bearer scheme is rejected", async () => {
    const result = await authenticateRequest(
      authedRequest("Basic key-one"),
      authedEnv
    );
    expect(result.authenticated).toBe(false);
    expect(result.error).toContain("Bearer <api-key>");
  });

  test("scheme match is case-insensitive", async () => {
    const result = await authenticateRequest(
      authedRequest("bearer key-one"),
      authedEnv
    );
    expect(result.authenticated).toBe(true);
  });

  test("surrounding whitespace is tolerated", async () => {
    const result = await authenticateRequest(
      authedRequest("  Bearer   key-one  "),
      authedEnv
    );
    expect(result.authenticated).toBe(true);
  });

  test("unknown key is rejected", async () => {
    const result = await authenticateRequest(
      authedRequest("Bearer nope"),
      authedEnv
    );
    expect(result).toEqual({ authenticated: false, error: "Invalid API key" });
  });
});

// ============================================================================
// D1 caller-key auth (#129) - the OR transition, against the real migrations
// ============================================================================
// The presented bearer authenticates through env.API_KEYS (the legacy
// mirror) or through an ENABLED D1 caller key. What these tests pin: an
// enabled key opens the gate, a disabled one is rejected exactly like an
// unknown key, a disabled key mirrored in env still opens it (that is the
// resurrection #128 warns about), and D1 trouble degrades to env-only —
// never to an open gate.

const AUTH_DATA_KEY = "auth-test-data-key";
const AUTH_PEPPER = await deriveCallerPepper(AUTH_DATA_KEY);

/** D1-shaped read adapter over node:sqlite. */
function authD1(db: DatabaseSync) {
  return {
    prepare: (sql: string) => {
      const stmt = {
        first: async <T>() => (db.prepare(sql).get() ?? null) as T | null,
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 0 } }),
      };
      return {
        ...stmt,
        bind: (...params: (string | number | null)[]) => ({
          first: async <T>() =>
            (db.prepare(sql).get(...params) ?? null) as T | null,
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 0 } }),
        }),
      };
    },
    commit: async () => ({ keyId: null }),
  };
}

describe("D1 caller-key auth (#129)", () => {
  test("an enabled D1 key authenticates", async () => {
    const db = freshDb();
    const secret = "d1-key-secret-0001";
    db.prepare(
      "INSERT INTO caller_keys (name, secret_hash, prefix, suffix, enabled) VALUES (?, ?, 'sk-mgmt-', 'a1b2', 1)"
    ).run("CI", await callerKeyVerifier(AUTH_PEPPER, secret));
    const env = {
      API_KEYS: "env-key",
      PROVIDER_DATA_KEY: AUTH_DATA_KEY,
      PROVIDER_DB: authD1(db),
    } as unknown as Env;

    const result = await authenticateRequest(
      authedRequest(`Bearer ${secret}`),
      env
    );
    expect(result).toEqual({ authenticated: true, apiKey: secret });
  });

  test("a disabled D1 key is rejected exactly like an unknown key", async () => {
    const db = freshDb();
    const secret = "d1-key-secret-0002";
    db.prepare(
      "INSERT INTO caller_keys (name, secret_hash, prefix, suffix, enabled) VALUES (?, ?, 'sk-mgmt-', 'a1b2', 0)"
    ).run("parked", await callerKeyVerifier(AUTH_PEPPER, secret));
    const env = {
      API_KEYS: "env-key",
      PROVIDER_DATA_KEY: AUTH_DATA_KEY,
      PROVIDER_DB: authD1(db),
    } as unknown as Env;

    const disabled = await authenticateRequest(
      authedRequest(`Bearer ${secret}`),
      env
    );
    const unknown = await authenticateRequest(
      authedRequest("Bearer not-a-key"),
      env
    );
    // Same answer, byte for byte: no branch leaks key existence.
    expect(disabled).toEqual(unknown);
    expect(disabled).toEqual({
      authenticated: false,
      error: "Invalid API key",
    });
  });

  test("a disabled key mirrored in env still authenticates (transition OR)", async () => {
    const db = freshDb();
    const secret = "env-mirrored-secret-1";
    db.prepare(
      "INSERT INTO caller_keys (name, secret_hash, prefix, suffix, enabled) VALUES (?, ?, 'sk-mgmt-', 'a1b2', 0)"
    ).run("mirrored", await callerKeyVerifier(AUTH_PEPPER, secret));
    const env = {
      API_KEYS: secret,
      PROVIDER_DATA_KEY: AUTH_DATA_KEY,
      PROVIDER_DB: authD1(db),
    } as unknown as Env;

    // Disabling the row did not revoke the credential while it lives in
    // the deploy env — the resurrection #128's warning exists for.
    const result = await authenticateRequest(
      authedRequest(`Bearer ${secret}`),
      env
    );
    expect(result).toEqual({ authenticated: true, apiKey: secret });
  });

  test("an env key authenticates without touching D1", async () => {
    const db = freshDb();
    const env = {
      API_KEYS: "env-key",
      PROVIDER_DATA_KEY: AUTH_DATA_KEY,
      PROVIDER_DB: authD1(db),
    } as unknown as Env;

    const result = await authenticateRequest(
      authedRequest("Bearer env-key"),
      env
    );
    expect(result).toEqual({ authenticated: true, apiKey: "env-key" });
  });

  test("D1 trouble degrades to env-only auth, not to an open gate", async () => {
    const env = {
      API_KEYS: "env-key",
      PROVIDER_DATA_KEY: AUTH_DATA_KEY,
      PROVIDER_DB: {
        prepare: () => {
          throw new Error("d1 down");
        },
      },
    } as unknown as Env;

    const envKey = await authenticateRequest(
      authedRequest("Bearer env-key"),
      env
    );
    expect(envKey).toEqual({ authenticated: true, apiKey: "env-key" });
    const unknown = await authenticateRequest(
      authedRequest("Bearer nope"),
      env
    );
    expect(unknown).toEqual({ authenticated: false, error: "Invalid API key" });
  });

  test("without a data key the D1 path is skipped and env still works", async () => {
    const env = { API_KEYS: "env-key" } as unknown as Env;
    const result = await authenticateRequest(
      authedRequest("Bearer env-key"),
      env
    );
    expect(result).toEqual({ authenticated: true, apiKey: "env-key" });
  });
});

describe("requiresAuth", () => {
  test("public paths bypass auth", () => {
    for (const path of [
      "/",
      "/index.html",
      "/health",
      "/api/internal/models",
    ]) {
      expect(requiresAuth(path, "GET")).toBe(false);
    }
    expect(requiresAuth("/images/abc.png", "GET")).toBe(false);
    expect(requiresAuth("/.well-known/oauth-protected-resource", "GET")).toBe(
      false
    );
  });

  test("OPTIONS preflight always bypasses", () => {
    expect(requiresAuth("/v1/images/generations", "OPTIONS")).toBe(false);
    expect(requiresAuth("/mcp", "OPTIONS")).toBe(false);
  });

  test("API endpoints require auth", () => {
    expect(requiresAuth("/v1/images/generations", "POST")).toBe(true);
    expect(requiresAuth("/mcp", "POST")).toBe(true);
    expect(requiresAuth("/v1/models", "GET")).toBe(true);
  });
});

describe("unauthorized response contract", () => {
  test("401 keeps legacy body shape with bearer challenge", async () => {
    const request = new Request("https://worker.test/mcp");
    const response = createUnauthorizedResponse("Invalid API key", request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Invalid API key",
    });
    const challenge = response.headers.get("WWW-Authenticate") ?? "";
    expect(challenge).toContain('Bearer error="invalid_token"');
    expect(challenge).toContain(
      'resource_metadata="https://worker.test/.well-known/oauth-protected-resource"'
    );
  });

  test("challenge omits resource_metadata without a request", () => {
    expect(buildBearerChallenge()).toBe(
      'Bearer error="invalid_token", error_description="Authentication required"'
    );
  });

  test("resource metadata URL derives from request origin", () => {
    const request = new Request("https://worker.test/mcp?transport=sse");
    expect(getResourceMetadataUrl(request)).toBe(
      "https://worker.test/.well-known/oauth-protected-resource"
    );
  });

  test("protected resource metadata is a resource-server document", () => {
    const request = new Request("https://worker.test/mcp");
    expect(buildProtectedResourceMetadata(request)).toEqual({
      resource: "https://worker.test/mcp",
      authorization_servers: [],
      scopes_supported: [],
      bearer_methods_supported: ["header"],
    });
  });
});

// ============================================================================
// Review fix H1 - the unset-API_KEYS bypass must not swallow D1 keys
// ============================================================================
// Before the fix, `!env.API_KEYS` returned authenticated before the D1 path
// ran, so retiring the env var left `/v1` and `/mcp` open to anyone while
// the admin UI still displayed enabled caller keys.

describe("H1: D1 keys gate access when API_KEYS is unset", () => {
  const SECRET = "{{SECRET_h1proofkey9}}";

  async function envWithKey(enabled: number) {
    const db = freshDb();
    db.prepare(
      "INSERT INTO caller_keys (name, secret_hash, prefix, suffix, enabled) " +
        "VALUES ('CI', ?, 'p', 'a1b2', ?)"
    ).run(await callerKeyVerifier(AUTH_PEPPER, SECRET), enabled);
    return {
      PROVIDER_DATA_KEY: AUTH_DATA_KEY,
      PROVIDER_DB: authD1(db),
    } as unknown as Env;
  }

  test("an anonymous request is rejected once a D1 key is enabled", async () => {
    const result = await authenticateRequest(
      authedRequest(),
      await envWithKey(1)
    );
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Missing Authorization header");
  });

  test("the enabled D1 key still authenticates", async () => {
    const result = await authenticateRequest(
      authedRequest(`Bearer ${SECRET}`),
      await envWithKey(1)
    );
    expect(result).toEqual({ authenticated: true, apiKey: SECRET });
  });

  test("an unknown bearer is rejected", async () => {
    const result = await authenticateRequest(
      authedRequest("Bearer nope"),
      await envWithKey(1)
    );
    expect(result).toEqual({ authenticated: false, error: "Invalid API key" });
  });

  test("a disabled key does not activate the gate", async () => {
    // Only ENABLED keys make D1 the credential source, so a table holding
    // a parked key keeps the documented open posture.
    const result = await authenticateRequest(
      authedRequest(),
      await envWithKey(0)
    );
    expect(result).toEqual({ authenticated: true });
  });

  test("binding PROVIDER_DB with no keys keeps the open posture", async () => {
    const env = {
      PROVIDER_DATA_KEY: AUTH_DATA_KEY,
      PROVIDER_DB: authD1(freshDb()),
    } as unknown as Env;
    const result = await authenticateRequest(authedRequest(), env);
    expect(result).toEqual({ authenticated: true });
  });

  test("a D1 failure with no env keys fails closed", async () => {
    const env = {
      PROVIDER_DATA_KEY: AUTH_DATA_KEY,
      PROVIDER_DB: {
        prepare: () => {
          throw new Error("d1 down");
        },
      },
    } as unknown as Env;
    const result = await authenticateRequest(
      authedRequest(`Bearer ${SECRET}`),
      env
    );
    expect(result.authenticated).toBe(false);
  });
});
