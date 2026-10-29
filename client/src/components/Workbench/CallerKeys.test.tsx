import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AdminKeyProvider } from "../../app/admin-key";
import { AuthProvider } from "../../app/auth";
import { ThemeProvider } from "../../app/theme";
import { CALLER_KEYS_QUERY_FAMILY } from "../../api/admin";
import { AdminView } from "./AdminView";

/**
 * The caller-key list.
 *
 * A caller key is the bearer token a client sends to reach this Worker's
 * API. The rules these tests pin: the list is behind the gate like
 * everything else behind it, each key is shown by name and masked hint,
 * a disabled key is visible as disabled, and locking the panel leaves
 * nothing of the list behind to read.
 */

const HEALTH = {
  providers: [
    {
      id: "cloudflare",
      displayName: "Cloudflare Workers AI",
      transport: "cloudflare-rest",
    },
  ],
  keys: [],
  exposure: [],
  configVersion: 1,
  hasServableCredential: false,
  hasServableCredentialByProvider: { cloudflare: false },
};

const CALLER_KEYS = {
  keys: [
    {
      id: 1,
      name: "Laptop",
      maskedKey: "sk-mgmt-…a1b2",
      enabled: true,
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_000,
    },
    {
      id: 2,
      name: "CI",
      maskedKey: "…c3d4",
      enabled: false,
      createdAt: 1_700_000_100,
      updatedAt: 1_700_000_100,
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

type Route = { path: string; method: string };

function stubApi(callerKeys: unknown = CALLER_KEYS) {
  const calls: Route[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input.toString();
      calls.push({ path, method: init?.method ?? "GET" });
      if (path === "/api/admin/health") return jsonResponse(HEALTH);
      if (path === "/api/admin/caller-keys") return jsonResponse(callerKeys);
      if (path === "/api/internal/models") return jsonResponse([]);
      return jsonResponse({});
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderWorkbench() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <AuthProvider>
          <AdminKeyProvider>{children}</AdminKeyProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
  const utils = render(<AdminView />, { wrapper });
  return { ...utils, client };
}

async function unlock(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Management Key/i), "management-key");
  await user.click(screen.getByRole("button", { name: /Unlock/i }));
  await waitFor(() =>
    expect(document.getElementById("adminCallerKeys")?.children.length).toBe(2)
  );
}

describe("the caller-key list", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem("api_key", "bearer-key");
    window.location.hash = "#admin";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for the caller keys only after the management key is entered", async () => {
    const calls = stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    // Nothing behind the gate is requested before the key is entered.
    expect(calls.some((call) => call.path === "/api/admin/caller-keys")).toBe(
      false
    );

    await unlock(user);

    expect(calls.some((call) => call.path === "/api/admin/caller-keys")).toBe(
      true
    );
  });

  it("shows each caller key by name and masked hint", async () => {
    stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);

    const body = document.getElementById("adminCallerKeys");
    expect(body?.textContent).toContain("Laptop");
    expect(body?.textContent).toContain("sk-mgmt-…a1b2");
    expect(body?.textContent).toContain("CI");
    expect(body?.textContent).toContain("…c3d4");
  });

  it("marks a disabled caller key and dims its row", async () => {
    stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);

    const enabled = screen.getByTestId("admin-caller-key-1");
    const disabled = screen.getByTestId("admin-caller-key-2");
    expect(enabled.textContent).toContain("Enabled");
    expect(disabled.textContent).toContain("Disabled");
    // A parked key stays visible, but dimmed so it does not read as active.
    expect(disabled.style.opacity).toBe("0.55");
    expect(enabled.style.opacity).toBe("");
  });

  it("shows an empty state when there are no caller keys", async () => {
    stubApi({ keys: [] });
    const user = userEvent.setup();
    renderWorkbench();

    await user.type(screen.getByLabelText(/Management Key/i), "management-key");
    await user.click(screen.getByRole("button", { name: /Unlock/i }));

    await waitFor(() =>
      expect(
        document.getElementById("adminCallerKeysEmpty")?.textContent
      ).toContain("No caller keys yet.")
    );
  });

  it("leaves nothing of the list behind when the panel is locked", async () => {
    stubApi();
    const user = userEvent.setup();
    const { client } = renderWorkbench();

    await unlock(user);

    await user.click(
      screen.getByRole("button", { name: /Lock provider credentials/i })
    );

    // A locked panel must leave nothing behind to read: neither the
    // active session's list nor the placeholder the locked session left.
    const cached = client
      .getQueryCache()
      .findAll({ queryKey: CALLER_KEYS_QUERY_FAMILY });
    expect(cached.filter((query) => query.state.data !== undefined)).toEqual(
      []
    );
  });

  it("never writes a caller key to a storage backend", async () => {
    stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);

    for (const storage of [window.sessionStorage, window.localStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index) ?? "";
        expect(key).not.toMatch(/caller/i);
      }
    }
    expect(document.cookie).not.toMatch(/caller/i);
  });
});
