import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchModels, modelsQueryKey, useModels } from "./models";

/**
 * The model registry.
 *
 * The route is public, so the client reads it before the operator signs
 * in. The registry carries the `available` flag the dispatcher uses, so
 * a model the request path would refuse is never offered.
 */

function jsonResponse(ok: boolean, body: unknown, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("the model registry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the registry", async () => {
    const registry = [{ id: "sdxl", available: true }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(true, registry))
    );

    await expect(fetchModels()).resolves.toEqual(registry);
  });

  it("fails loudly on a broken answer rather than reading it as empty", async () => {
    // An empty registry would offer the operator nothing and say
    // nothing about why.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(true, { object: "list", data: [] }))
    );

    await expect(fetchModels()).rejects.toThrow(
      /Unexpected model registry response/
    );
  });

  it("fails on an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(false, { error: "boom" }, 500))
    );

    await expect(fetchModels()).rejects.toThrow("HTTP 500");
  });

  it("caches the registry under one key", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(true, []));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const first = renderHook(() => useModels(), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const second = renderHook(() => useModels(), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(modelsQueryKey).toEqual(["models"]);
  });
});
