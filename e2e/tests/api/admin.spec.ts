import { test, expect } from "@playwright/test";
import { getAuthHeaders } from "../../lib/auth";

/**
 * Provider admin API E2E tests (R2, #74)
 *
 * Runs against a DEPLOYED backend carrying the R2 routes with
 * ADMIN_API_KEY set (post-merge staging at the earliest): the spec is
 * written now so the contract is pinned, but it can only execute once
 * the routes and the management secret exist on the target. Until then the
 * management-key tests here fail at the gate assertions — loudly, by design, so
 * an unprovisioned target cannot fake a green run.
 *
 * Conventions mirrored from the vitest S1 seam: two gates (login bearer
 * 401, management key 403), identity-only write echoes, labels-only
 * health. The management key arrives via ADMIN_API_KEY_E2E — a shell
 * env var, never a committed value — and no test asserts on a secret.
 * @api
 */

function adminHeaders(adminKey?: string): Record<string, string> {
  const headers = getAuthHeaders();
  if (adminKey !== undefined) headers["X-Admin-Key"] = adminKey;
  return headers;
}

function managementKey(): string {
  const key = process.env.ADMIN_API_KEY_E2E?.trim();
  expect(
    key,
    "ADMIN_API_KEY_E2E must be set to run the admin e2e (the target worker secret ADMIN_API_KEY)"
  ).toBeTruthy();
  return key!;
}

test.describe("Admin gates", () => {
  test("health without any bearer is 401", async ({ request }) => {
    const response = await request.get("/api/admin/health", {
      headers: {
        // Playwright injects auth headers globally (playwright.config.ts
        // extraHTTPHeaders); strip them to test the unauthenticated path,
        // the same way tests/api/mcp/auth.spec.ts does. Without this the
        // request carries a valid bearer and reaches the management-key gate,
        // which answers 403 — so the test could never assert the 401 gate.
        Authorization: "",
      },
    });
    expect(response.status()).toBe(401);
  });

  test("health with bearer but wrong management key is 403", async ({
    request,
  }) => {
    const response = await request.get("/api/admin/health", {
      headers: adminHeaders("definitely-wrong-admin-key"),
    });
    expect(response.status()).toBe(403);
  });

  test("health with both keys returns the pool shape", async ({ request }) => {
    const response = await request.get("/api/admin/health", {
      headers: adminHeaders(managementKey()),
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.providers)).toBe(true);
    expect(Array.isArray(body.keys)).toBe(true);
    expect(Array.isArray(body.exposure)).toBe(true);
    expect(typeof body.configVersion).toBe("number");
    // Zero secret characters: serialize the whole payload through the
    // same secret-shaped patterns the repo tripwire enforces.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    expect(serialized).not.toMatch(/Bearer [A-Za-z0-9._~+/-]{8,}/);
  });
});

test.describe("Admin key lifecycle", () => {
  test("add rejects an unknown provider with 400", async ({ request }) => {
    const response = await request.post("/api/admin/keys", {
      headers: adminHeaders(managementKey()),
      data: { providerId: "no-such-provider", label: "e2e-x", apiToken: "x" },
    });
    expect(response.status()).toBe(400);
  });

  test("add then disable round-trips through health", async ({ request }) => {
    const label = `e2e-${Date.now()}`;
    const added = await request.post("/api/admin/keys", {
      headers: adminHeaders(managementKey()),
      data: {
        providerId: "cloudflare",
        label,
        apiToken: "e2e-token-value",
        accountId: "e2e-account-id",
      },
    });
    expect(added.status()).toBe(201);
    const created = await added.json();
    expect(created.label).toBe(label);
    expect(created.activeVersion).toBe(1);
    // Identity-only echo: the token that went in must not come back out.
    expect(JSON.stringify(created)).not.toContain("e2e-token-value");

    const health = await request.get("/api/admin/health", {
      headers: adminHeaders(managementKey()),
    });
    const keys = ((await health.json()) as { keys: { label: string }[] }).keys;
    expect(keys.some((k) => k.label === label)).toBe(true);

    const disabled = await request.post(
      `/api/admin/keys/${created.id}/disable`,
      { headers: adminHeaders(managementKey()) }
    );
    expect(disabled.status()).toBe(200);

    const parked = (await (
      await request.get("/api/admin/health", {
        headers: adminHeaders(managementKey()),
      })
    ).json()) as { keys: { label: string; enabled: boolean }[] };
    expect(parked.keys.find((k) => k.label === label)?.enabled).toBe(false);
  });

  test("PATCH edits fields and rotates on save", async ({ request }) => {
    const label = `e2e-patch-${Date.now()}`;
    const added = await request.post("/api/admin/keys", {
      headers: adminHeaders(managementKey()),
      data: {
        providerId: "cloudflare",
        label,
        apiToken: "e2e-token-v1",
        accountId: "e2e-account-id",
      },
    });
    expect(added.status()).toBe(201);
    const created = (await added.json()) as { id: number };

    // Field-only edit: weight/enabled change, version stays.
    const edited = await request.patch(`/api/admin/keys/${created.id}`, {
      headers: adminHeaders(managementKey()),
      data: { weight: 3, enabled: false },
    });
    expect(edited.status()).toBe(200);
    const editedBody = (await edited.json()) as {
      weight: number;
      enabled: boolean;
      activeVersion: number;
    };
    expect(editedBody.weight).toBe(3);
    expect(editedBody.enabled).toBe(false);
    expect(editedBody.activeVersion).toBe(1);

    // Rotate-on-save: a present token bumps the version in one write.
    const rotated = await request.patch(`/api/admin/keys/${created.id}`, {
      headers: adminHeaders(managementKey()),
      data: { accountId: "e2e-account-id", apiToken: "e2e-token-v2" },
    });
    expect(rotated.status()).toBe(200);
    const rotatedBody = (await rotated.json()) as { activeVersion: number };
    expect(rotatedBody.activeVersion).toBe(2);
    expect(JSON.stringify(rotatedBody)).not.toContain("e2e-token-v2");

    const health = (await (
      await request.get("/api/admin/health", {
        headers: adminHeaders(managementKey()),
      })
    ).json()) as { keys: { label: string; enabled: boolean }[] };
    expect(health.keys.find((k) => k.label === label)?.enabled).toBe(false);
  });

  test("PATCH validation rejects a non-integer weight with 400", async ({
    request,
  }) => {
    const response = await request.patch("/api/admin/keys/1", {
      headers: adminHeaders(managementKey()),
      data: { weight: 1.5 },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe("Admin caller keys", () => {
  // The caller keys are the other admin list: the bearer tokens clients
  // send to /v1/* and /mcp*. Same two gates, read-only list.
  test("caller keys without any bearer is 401", async ({ request }) => {
    const response = await request.get("/api/admin/caller-keys", {
      headers: { Authorization: "" },
    });
    expect(response.status()).toBe(401);
  });

  test("caller keys with bearer but wrong management key is 403", async ({
    request,
  }) => {
    const response = await request.get("/api/admin/caller-keys", {
      headers: adminHeaders("definitely-wrong-admin-key"),
    });
    expect(response.status()).toBe(403);
  });

  test("caller keys with both keys returns masked rows only", async ({
    request,
  }) => {
    const response = await request.get("/api/admin/caller-keys", {
      headers: adminHeaders(managementKey()),
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      keys: {
        id: number;
        name: string;
        maskedKey: string;
        enabled: boolean;
        createdAt: number;
        updatedAt: number;
      }[];
    };
    expect(Array.isArray(body.keys)).toBe(true);
    for (const key of body.keys) {
      expect(typeof key.name).toBe("string");
      expect(typeof key.enabled).toBe("boolean");
      // The hint is masked: it carries the ellipsis the mask is built
      // from, never a whole secret.
      expect(key.maskedKey).toContain("…");
    }

    // Non-leakage, checked against the whole body rather than the rows
    // the assertions above read: a verifier, a salt, a pepper, or a full
    // generated secret anywhere in the payload is a defect.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/secret_hash|secretHash|salt|pepper/i);
    expect(serialized).not.toMatch(/sk-mgmt-[A-Za-z0-9]{24,}/);
    expect(serialized).not.toMatch(/Bearer [A-Za-z0-9._~+/-]{8,}/);
  });
});
