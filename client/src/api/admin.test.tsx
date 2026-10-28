import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminApiError,
  HEALTH_QUERY_FAMILY,
  healthQueryKey,
  useAdminMutations,
  useHealth,
} from "./admin";
import type { AdminHealth } from "./types";

/**
 * The admin API client.
 *
 * Two properties matter enough to be pinned here: the health payload is
 * scoped to one unlock session, so a locked panel's data never reaches
 * the next operator's, and a rejected toggle is rolled back, so the row
 * cannot disagree with what the server stored.
 */

const HEALTH: AdminHealth = {
  providers: [
    {
      id: "cloudflare",
      displayName: "Cloudflare Workers AI",
      transport: "cloudflare-rest",
    },
  ],
  keys: [
    {
      id: 1,
      providerId: "cloudflare",
      label: "key-1",
      weight: 1,
      enabled: true,
      activeVersion: 1,
      accountId: "acct-1",
    },
  ],
  exposure: [],
  configVersion: 1,
  hasServableCredential: true,
  hasServableCredentialByProvider: { cloudflare: true },
};

function jsonResponse(ok: boolean, body: unknown, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("the admin API client", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    client.clear();
  });

  it("reads the health payload with both keys", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(true, HEALTH)
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () =>
        useHealth({
          adminKey: "management-key",
          bearerToken: "bearer-key",
          sessionId: 1,
        }),
      { wrapper: wrapper(client) }
    );

    await waitFor(() => expect(result.current.data).toEqual(HEALTH));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/health");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["X-Admin-Key"]).toBe("management-key");
    expect(headers["Authorization"]).toBe("Bearer bearer-key");
  });

  it("does not read the health payload while the panel is locked", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(true, HEALTH)
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () =>
        useHealth({
          adminKey: null,
          bearerToken: "bearer-key",
          sessionId: 0,
        }),
      { wrapper: wrapper(client) }
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps one unlock session's payload out of the next one's cache", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(true, HEALTH)
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = renderHook(
      () =>
        useHealth({
          adminKey: "first-key",
          bearerToken: "bearer-key",
          sessionId: 1,
        }),
      { wrapper: wrapper(client) }
    );
    await waitFor(() => expect(first.result.current.data).toEqual(HEALTH));

    // A second unlock is a different session, so it is a different
    // cache entry: the first operator's payload is not reused.
    const second = renderHook(
      () =>
        useHealth({
          adminKey: "second-key",
          bearerToken: "bearer-key",
          sessionId: 2,
        }),
      { wrapper: wrapper(client) }
    );
    await waitFor(() => expect(second.result.current.data).toEqual(HEALTH));

    expect(healthQueryKey(1)).not.toEqual(healthQueryKey(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces the server's message and code on a rejected request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          false,
          {
            error: {
              message: "Management key rejected.",
              code: "admin_disabled",
            },
          },
          403
        )
      )
    );

    const { result } = renderHook(
      () =>
        useHealth({
          adminKey: "wrong-key",
          bearerToken: "bearer-key",
          sessionId: 1,
        }),
      { wrapper: wrapper(client) }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    const failure = result.current.error as AdminApiError;
    expect(failure).toBeInstanceOf(AdminApiError);
    expect(failure.status).toBe(403);
    expect(failure.code).toBe("admin_disabled");
    expect(failure.message).toBe("Management key rejected.");
  });

  it("shows the operator's choice immediately and rolls it back on failure", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/admin/health") return jsonResponse(true, HEALTH);
        return jsonResponse(false, { error: { message: "Boom." } }, 500);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = {
      adminKey: "management-key",
      bearerToken: "bearer-key",
      sessionId: 1,
    };

    const { result } = renderHook(
      () => ({
        health: useHealth(session),
        mutations: useAdminMutations(session),
      }),
      { wrapper: wrapper(client) }
    );

    await waitFor(() => expect(result.current.health.data).toEqual(HEALTH));

    await act(async () => {
      await result.current.mutations.toggleKey
        .mutateAsync({ keyId: 1, enabled: false })
        .catch(() => undefined);
    });

    // The server refused, so the cached key is back to what it was.
    await waitFor(() => {
      const cached = client.getQueryData<AdminHealth>(healthQueryKey(1));
      expect(cached?.keys[0].enabled).toBe(true);
    });
  });

  it("invalidates the whole health family after a key change", async () => {
    // The payload on screen belongs to whichever session is live, so a
    // key change has to invalidate the family rather than one session's
    // entry. This pins the target of the invalidation itself: the
    // refetch that follows is the query library's business.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/admin/health") return jsonResponse(true, HEALTH);
      return jsonResponse(true, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    const session = {
      adminKey: "management-key",
      bearerToken: "bearer-key",
      sessionId: 1,
    };

    const { result } = renderHook(
      () => ({
        health: useHealth(session),
        mutations: useAdminMutations(session),
      }),
      { wrapper: wrapper(client) }
    );
    await waitFor(() => expect(result.current.health.data).toEqual(HEALTH));

    await act(async () => {
      await result.current.mutations.toggleKey
        .mutateAsync({ keyId: 1, enabled: false })
        .catch(() => undefined);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: HEALTH_QUERY_FAMILY });
  });

  it("refetches the payload of the session that is live when the request finishes", async () => {
    // A lock and an unlock during an in-flight mutation start a new
    // session. The answer has to reach that session's payload, not the
    // one the request was sent under.
    let releaseToggle: (() => void) | null = null;
    let healthCalls = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/admin/health") {
          healthCalls += 1;
          return jsonResponse(true, HEALTH);
        }
        await new Promise<void>((resolve) => {
          releaseToggle = resolve;
        });
        return jsonResponse(true, HEALTH);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = {
      adminKey: "management-key",
      bearerToken: "bearer-key",
      sessionId: 1,
    };

    const { result, unmount } = renderHook(
      ({ session }: { session: typeof first }) => ({
        health: useHealth(session),
        mutations: useAdminMutations(session),
      }),
      { initialProps: { session: first }, wrapper: wrapper(client) }
    );

    await waitFor(() => expect(result.current.health.data).toEqual(HEALTH));
    expect(healthCalls).toBe(1);

    // The toggle goes out under the first session.
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.mutations.toggleKey.mutateAsync({
        keyId: 1,
        enabled: false,
      });
      void pending.catch(() => undefined);
    });

    // The operator leaves the workbench while the request is open. The
    // hook goes away, and a pending mutation keeps the options it was
    // started with: nothing refreshes them behind its back, so the
    // answer it publishes still names the session that is gone.
    unmount();

    // The operator unlocks again: a new session, a new payload.
    const second = renderHook(
      () =>
        useHealth({
          adminKey: "management-key",
          bearerToken: "bearer-key",
          sessionId: 2,
        }),
      { wrapper: wrapper(client) }
    );
    await waitFor(() => expect(healthCalls).toBe(2));

    // The answer arrives.
    await act(async () => {
      releaseToggle?.();
      await pending;
    });

    // The live session's payload is refetched, so the row on screen
    // agrees with the server.
    await waitFor(() => expect(healthCalls).toBe(3));
    second.unmount();
  });

  it("adds a key and refetches the health payload and the registry", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/admin/keys") return jsonResponse(true, {});
        if (url === "/api/admin/health") return jsonResponse(true, HEALTH);
        return jsonResponse(true, []);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = {
      adminKey: "management-key",
      bearerToken: "bearer-key",
      sessionId: 1,
    };

    const { result } = renderHook(
      () => ({
        health: useHealth(session),
        mutations: useAdminMutations(session),
      }),
      { wrapper: wrapper(client) }
    );
    await waitFor(() => expect(result.current.health.data).toEqual(HEALTH));

    await act(async () => {
      await result.current.mutations.addKey.mutateAsync({
        providerId: "cloudflare",
        label: "key-2",
        apiToken: "token-value",
        accountId: "acct-2",
        weight: 2,
        enabled: true,
      });
    });

    const addCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/admin/keys"
    );
    expect(addCall).toBeDefined();
    const body = JSON.parse((addCall?.[1]?.body ?? "{}") as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      providerId: "cloudflare",
      accountId: "acct-2",
      weight: 2,
      enabled: true,
    });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter((call) => call[0] === "/api/admin/health")
          .length
      ).toBeGreaterThan(1)
    );
  });

  it("omits the token from an update that keeps the stored version", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("/api/admin/keys/")) return jsonResponse(true, {});
        if (url === "/api/admin/health") return jsonResponse(true, HEALTH);
        return jsonResponse(true, []);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = {
      adminKey: "management-key",
      bearerToken: "bearer-key",
      sessionId: 1,
    };

    const { result } = renderHook(
      () => ({
        health: useHealth(session),
        mutations: useAdminMutations(session),
      }),
      { wrapper: wrapper(client) }
    );
    await waitFor(() => expect(result.current.health.data).toEqual(HEALTH));

    await act(async () => {
      await result.current.mutations.updateKey.mutateAsync({
        keyId: 1,
        accountId: "acct-1",
        weight: 1,
        enabled: true,
      });
    });

    const updateCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).startsWith("/api/admin/keys/")
    );
    const body = JSON.parse(
      (updateCall?.[1]?.body ?? "{}") as string
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("apiToken");
  });

  it("deletes a key through the delete route", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/admin/health") return jsonResponse(true, HEALTH);
        return jsonResponse(true, {});
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = {
      adminKey: "management-key",
      bearerToken: "bearer-key",
      sessionId: 1,
    };

    const { result } = renderHook(
      () => ({
        health: useHealth(session),
        mutations: useAdminMutations(session),
      }),
      { wrapper: wrapper(client) }
    );
    await waitFor(() => expect(result.current.health.data).toEqual(HEALTH));

    await act(async () => {
      await result.current.mutations.deleteKey.mutateAsync({ keyId: 1 });
    });

    const deleteCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/delete")
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.[1]?.method).toBe("POST");
  });
});
