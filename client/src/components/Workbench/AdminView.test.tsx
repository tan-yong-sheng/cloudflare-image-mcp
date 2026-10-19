import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AdminKeyProvider } from "../../app/admin-key";
import { AuthProvider } from "../../app/auth";
import { ThemeProvider } from "../../app/theme";
import { AdminView } from "./AdminView";

/**
 * The workbench.
 *
 * These are the operator-visible rules the legacy page kept: the panel
 * is a gate until the management key is entered, the account field
 * belongs to the transport, a blank token keeps the stored version, and
 * the management key never reaches a storage backend.
 */

const HEALTH = {
  providers: [
    {
      id: "cloudflare",
      displayName: "Cloudflare Workers AI",
      transport: "cloudflare-rest",
    },
    {
      id: "agnes",
      displayName: "Agnes",
      transport: "openai-compat",
    },
  ],
  keys: [
    {
      id: 1,
      providerId: "cloudflare",
      label: "key-1",
      weight: 1,
      enabled: true,
      activeVersion: 3,
      accountId: "acct-1",
    },
    {
      id: 2,
      providerId: "agnes",
      label: "key-2",
      weight: 2,
      enabled: false,
      activeVersion: 1,
      accountId: null,
    },
  ],
  exposure: [],
  configVersion: 1,
  hasServableCredential: true,
  hasServableCredentialByProvider: { cloudflare: true, agnes: false },
};

function jsonResponse(ok: boolean, body: unknown, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

type Route = { path: string; body: unknown; method: string };

function stubApi(overrides: (route: Route) => Response | null = () => null) {
  const calls: Route[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const route = { path, body, method };
      calls.push(route);
      const override = overrides(route);
      if (override) return override;
      if (path === "/api/admin/health") return jsonResponse(true, HEALTH);
      if (path === "/api/internal/models") return jsonResponse(true, []);
      return jsonResponse(true, {});
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
    expect(document.getElementById("adminFamilyName")?.textContent).toContain(
      "Cloudflare Workers AI"
    )
  );
}

describe("the provider credentials workbench", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.location.hash = "#admin";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the panel behind the gate until the management key is entered", async () => {
    const calls = stubApi();
    renderWorkbench();

    expect(
      screen.getByText("Unlock Provider Administration")
    ).toBeInTheDocument();
    // Nothing behind the gate is requested before the key is entered.
    expect(calls.some((call) => call.path === "/api/admin/health")).toBe(false);
  });

  it("reads the health payload once the key is entered", async () => {
    const calls = stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);

    const health = calls.find((call) => call.path === "/api/admin/health");
    expect(health).toBeDefined();
  });

  it("never writes the management key to a storage backend", async () => {
    stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);

    expect(window.sessionStorage.getItem("admin_key")).toBeNull();
    expect(window.localStorage.getItem("admin_key")).toBeNull();
    for (const storage of [window.sessionStorage, window.localStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        expect(key === null ? "" : key).not.toMatch(/admin/i);
        expect(key === null ? "" : key).not.toMatch(/management/i);
      }
    }
    expect(document.cookie).not.toMatch(/management/i);
  });

  it("shows the families in the rail and picks the first one", async () => {
    stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);

    const rail = document.getElementById("adminRail");
    expect(rail?.textContent).toContain("Cloudflare Workers AI");
    expect(rail?.textContent).toContain("Agnes");
  });

  it("asks for an account id only for a cloudflare-rest family", async () => {
    stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);

    // The first family is cloudflare-rest, so the account column is the
    // account id.
    expect(screen.getByText("Account ID")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Agnes/i }));

    // Agnes is openai-compat: it has no Cloudflare account behind it.
    expect(screen.getByText("Key")).toBeInTheDocument();
  });

  it("refuses to save a cloudflare-rest key without an account id", async () => {
    const calls = stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);
    await user.click(
      screen.getByRole("button", { name: /Add new provider key/i })
    );
    await user.click(screen.getByRole("button", { name: "Add key" }));

    expect(
      await screen.findByText(/Cloudflare account ID is required/i)
    ).toBeInTheDocument();
    expect(calls.some((call) => call.path === "/api/admin/keys")).toBe(false);
  });

  it("adds a key with the values the operator filled in", async () => {
    const calls = stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);
    await user.click(
      screen.getByRole("button", { name: /Add new provider key/i })
    );
    await user.type(screen.getByLabelText(/Cloudflare account ID/i), "acct-9");
    await user.type(screen.getByLabelText(/API token/i), "a-long-enough-token");
    await user.clear(screen.getByLabelText(/Weight/i));
    await user.type(screen.getByLabelText(/Weight/i), "4");
    await user.click(screen.getByRole("button", { name: "Add key" }));

    await waitFor(() =>
      expect(calls.some((call) => call.path === "/api/admin/keys")).toBe(true)
    );
    const add = calls.find((call) => call.path === "/api/admin/keys");
    expect(add?.method).toBe("POST");
    expect(add?.body).toMatchObject({
      providerId: "cloudflare",
      accountId: "acct-9",
      apiToken: "a-long-enough-token",
      weight: 4,
    });
  });

  it("shows the server's answer when a key is refused as a duplicate", async () => {
    // A duplicate label is a conflict. The operator has to be told
    // which label the server refused, and the drawer has to stay open
    // so it can be corrected.
    const calls = stubApi((route) => {
      if (route.path === "/api/admin/keys" && route.method === "POST") {
        return jsonResponse(
          false,
          { error: { message: "label 'key-1' already exists" } },
          409
        );
      }
      return null;
    });
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);
    await user.click(
      screen.getByRole("button", { name: /Add new provider key/i })
    );
    await user.type(screen.getByLabelText(/Cloudflare account ID/i), "acct-9");
    await user.type(screen.getByLabelText(/API token/i), "a-long-enough-token");
    await user.click(screen.getByRole("button", { name: "Add key" }));

    await waitFor(() =>
      expect(document.getElementById("adminSheetError")?.textContent).toContain(
        "label 'key-1' already exists"
      )
    );
    expect(document.getElementById("adminSheetError")?.className).not.toMatch(
      /hidden/
    );
    expect(screen.getByRole("button", { name: "Add key" })).toBeInTheDocument();
    expect(calls.some((call) => call.path === "/api/admin/keys")).toBe(true);
  });

  it("keeps the stored token version when the token is left blank", async () => {
    const calls = stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);
    await user.click(screen.getByRole("button", { name: /Edit key #1/i }));
    expect(screen.getByText(/blank = keep v3/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() =>
      expect(calls.some((call) => call.path === "/api/admin/keys/1")).toBe(true)
    );
    const update = calls.find((call) => call.path === "/api/admin/keys/1");
    expect(update?.body).not.toHaveProperty("apiToken");
  });

  it("rotates the token when the operator fills the field in", async () => {
    const calls = stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);
    await user.click(screen.getByRole("button", { name: /Edit key #1/i }));
    await user.type(screen.getByLabelText(/API token/i), "a-rotated-token");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() =>
      expect(calls.some((call) => call.path === "/api/admin/keys/1")).toBe(true)
    );
    const update = calls.find((call) => call.path === "/api/admin/keys/1");
    expect(update?.body).toMatchObject({ apiToken: "a-rotated-token" });
  });

  it("masks the token until the operator asks to see it", async () => {
    stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);
    await user.click(screen.getByRole("button", { name: /Edit key #1/i }));

    const token = screen.getByLabelText(/API token/i) as HTMLInputElement;
    expect(token.type).toBe("password");
    await user.click(screen.getByRole("button", { name: /Show token/i }));
    expect(token.type).toBe("text");
  });

  it("dismisses the drawer on Escape", async () => {
    stubApi();
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);
    await user.click(
      screen.getByRole("button", { name: /Add new provider key/i })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("asks before deleting a key and then deletes it", async () => {
    const calls = stubApi();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);
    await user.click(screen.getByRole("button", { name: /Delete key #1/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        calls.some((call) => call.path.endsWith("/api/admin/keys/1/delete"))
      ).toBe(true)
    );
  });

  it("keeps the key when the operator declines the delete", async () => {
    const calls = stubApi();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderWorkbench();

    await unlock(user);
    await user.click(screen.getByRole("button", { name: /Delete key #1/i }));

    expect(
      calls.some((call) => call.path.endsWith("/api/admin/keys/1/delete"))
    ).toBe(false);
  });

  it("keeps the keyboard inside the drawer", async () => {
    stubApi();
    const user = userEvent.setup();
    renderWorkbench();
    await unlock(user);

    await user.click(
      screen.getByRole("button", { name: /Add new provider key/i })
    );
    const dialog = document.getElementById("adminSheet");
    expect(dialog).not.toBeNull();
    const focusable = Array.from(
      dialog!.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )
    );
    expect(focusable.length).toBeGreaterThan(2);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Tab past the last control wraps to the first.
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);

    // Shift+Tab before the first wraps to the last.
    first.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it("drops the credential payload when the provider goes away", async () => {
    stubApi();
    const user = userEvent.setup();
    const { client, unmount } = renderWorkbench();
    await unlock(user);

    // The payload is cached under the unlock session.
    await waitFor(() =>
      expect(
        client.getQueriesData({ queryKey: ["admin", "health"] })
      ).not.toEqual([])
    );

    unmount();

    // The key and the payload it unlocked do not outlive the provider.
    expect(client.getQueriesData({ queryKey: ["admin", "health"] })).toEqual(
      []
    );
  });

  it("does not close a drawer that replaced the submitted one", async () => {
    // The operator can dismiss a drawer while its save is in flight and
    // open another one. A late answer must not close the new drawer.
    let releaseSave: (() => void) | null = null;
    const deferred = new Promise<Response>((resolve) => {
      releaseSave = () => resolve(jsonResponse(true, {}));
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = typeof input === "string" ? input : input.toString();
        if (path === "/api/admin/keys" && (init?.method ?? "GET") === "POST") {
          return deferred;
        }
        if (path === "/api/admin/health") return jsonResponse(true, HEALTH);
        if (path === "/api/internal/models") return jsonResponse(true, []);
        return jsonResponse(true, {});
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderWorkbench();
    await unlock(user);

    // Open the add drawer and submit it.
    await user.click(
      screen.getByRole("button", { name: /Add new provider key/i })
    );
    await user.type(screen.getByLabelText(/Cloudflare account ID/i), "acct-9");
    await user.type(screen.getByLabelText(/API token/i), "a-long-enough-token");
    await user.click(screen.getByRole("button", { name: "Add key" }));

    // The save is in flight. Dismiss the drawer and open another one.
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    await waitFor(() =>
      expect(document.getElementById("adminSheet")).toBeNull()
    );
    await user.click(screen.getByRole("button", { name: /Edit key #1/i }));
    await waitFor(() =>
      expect(document.getElementById("adminSheet")).not.toBeNull()
    );

    // The late answer lands.
    releaseSave!();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (call) =>
            String(call[0]) === "/api/admin/keys" &&
            (call[1]?.method ?? "GET") === "POST"
        )
      ).toBe(true)
    );

    // The drawer that replaced the submitted one is still open.
    expect(document.getElementById("adminSheet")).not.toBeNull();
    expect(document.getElementById("adminSheetTitle")?.textContent).toContain(
      "Edit Key #1"
    );
  });

  it("leaves a replacement drawer free to save while the first one waits", async () => {
    // The drawer that replaced the submitted one is a drawer of its own:
    // the request the other one sent does not make it busy.
    let releaseSave: (() => void) | null = null;
    const deferred = new Promise<Response>((resolve) => {
      releaseSave = () => resolve(jsonResponse(true, {}));
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = typeof input === "string" ? input : input.toString();
        if (path === "/api/admin/keys" && (init?.method ?? "GET") === "POST") {
          return deferred;
        }
        if (path === "/api/admin/health") return jsonResponse(true, HEALTH);
        if (path === "/api/internal/models") return jsonResponse(true, []);
        return jsonResponse(true, {});
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderWorkbench();
    await unlock(user);

    await user.click(
      screen.getByRole("button", { name: /Add new provider key/i })
    );
    await user.type(screen.getByLabelText(/Cloudflare account ID/i), "acct-9");
    await user.type(screen.getByLabelText(/API token/i), "a-long-enough-token");
    await user.click(screen.getByRole("button", { name: "Add key" }));

    // Dismiss the drawer and open another one while the save waits.
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    await waitFor(() =>
      expect(document.getElementById("adminSheet")).toBeNull()
    );
    await user.click(screen.getByRole("button", { name: /Edit key #1/i }));
    await waitFor(() =>
      expect(document.getElementById("adminSheet")).not.toBeNull()
    );

    const save = screen.getByRole("button", { name: /^Save$/i });
    expect((save as HTMLButtonElement).disabled).toBe(false);

    releaseSave!();
  });

  it("does not free a replacement drawer's button when the first request answers", async () => {
    // The first drawer's answer arrives after the second drawer sent its
    // own request. It must not clear the second drawer's busy state, or
    // the operator could send the same save twice.
    let releaseAdd: (() => void) | null = null;
    let releaseEdit: (() => void) | null = null;
    const addDeferred = new Promise<Response>((resolve) => {
      releaseAdd = () => resolve(jsonResponse(true, {}));
    });
    const editDeferred = new Promise<Response>((resolve) => {
      releaseEdit = () => resolve(jsonResponse(true, {}));
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        if (path === "/api/admin/keys" && method === "POST") return addDeferred;
        if (path === "/api/admin/keys/1" && method === "PATCH") {
          return editDeferred;
        }
        if (path === "/api/admin/health") return jsonResponse(true, HEALTH);
        if (path === "/api/internal/models") return jsonResponse(true, []);
        return jsonResponse(true, {});
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderWorkbench();
    await unlock(user);

    // The first drawer sends an add and waits for the answer.
    await user.click(
      screen.getByRole("button", { name: /Add new provider key/i })
    );
    await user.type(screen.getByLabelText(/Cloudflare account ID/i), "acct-9");
    await user.type(screen.getByLabelText(/API token/i), "a-long-enough-token");
    await user.click(screen.getByRole("button", { name: "Add key" }));

    // Dismiss it and send an edit from the drawer that replaces it.
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    await waitFor(() =>
      expect(document.getElementById("adminSheet")).toBeNull()
    );
    await user.click(screen.getByRole("button", { name: /Edit key #1/i }));
    await waitFor(() =>
      expect(document.getElementById("adminSheet")).not.toBeNull()
    );
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /^Save$/i }) as HTMLButtonElement)
          .disabled
      ).toBe(true)
    );

    // The first request answers now. The second drawer is still waiting
    // for its own answer, so its button has to stay disabled. The
    // answer is applied when the key change refreshes the health
    // payload, so the assertion waits for that and not for the clock.
    const healthCalls = () =>
      fetchMock.mock.calls.filter(
        (call) => String(call[0]) === "/api/admin/health"
      ).length;
    const before = healthCalls();
    releaseAdd!();
    await waitFor(() => expect(healthCalls()).toBeGreaterThan(before));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /^Save$/i }) as HTMLButtonElement)
          .disabled
      ).toBe(true)
    );

    releaseEdit!();
    await waitFor(() =>
      expect(document.getElementById("adminSheet")).toBeNull()
    );
  });

  it("locks the panel and says why when the credential payload cannot be read", async () => {
    // An error the operator cannot see is not an error they can act on,
    // and a panel that cannot read the credentials must not stay open
    // with the management key in memory.
    stubApi((route) =>
      route.path === "/api/admin/health"
        ? jsonResponse(
            false,
            { error: { message: "the pool is on fire" } },
            500
          )
        : null
    );
    const user = userEvent.setup();
    renderWorkbench();

    await user.type(screen.getByLabelText(/Management Key/i), "management-key");
    await user.click(screen.getByRole("button", { name: /Unlock/i }));

    expect(await screen.findByText("the pool is on fire")).toBeInTheDocument();
    expect(document.getElementById("adminPanel")?.className).toContain(
      "hidden"
    );
  });

  it("closes the panel and drops the cached payload when the operator locks", async () => {
    stubApi();
    const user = userEvent.setup();
    const { client } = renderWorkbench();

    await unlock(user);
    await user.click(
      screen.getByRole("button", { name: /Lock provider credentials/i })
    );

    await waitFor(() =>
      expect(
        screen.getByText("Unlock Provider Administration")
      ).toBeInTheDocument()
    );
    expect(client.getQueryData(["admin", "health"])).toBeUndefined();
  });

  it("does not put the credential payload back when a request fails after the lock", async () => {
    // The operator can lock the panel while a request is still open. A
    // late failure must not undo the lock by restoring the payload the
    // lock dropped.
    let releaseToggle: (() => void) | null = null;
    const deferred = new Promise<Response>((resolve) => {
      releaseToggle = () =>
        resolve(jsonResponse(false, { error: { message: "boom" } }, 500));
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = typeof input === "string" ? input : input.toString();
        if (
          path === "/api/admin/keys/1" &&
          (init?.method ?? "GET") === "PATCH"
        ) {
          return deferred;
        }
        if (path === "/api/admin/health") return jsonResponse(true, HEALTH);
        if (path === "/api/internal/models") return jsonResponse(true, []);
        return jsonResponse(true, {});
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    const { client } = renderWorkbench();
    await unlock(user);

    // The toggle is in flight, then the operator locks the panel.
    await user.click(screen.getByRole("switch", { name: /Disable key-1/i }));
    await user.click(
      screen.getByRole("button", { name: /Lock provider credentials/i })
    );
    await waitFor(() =>
      expect(
        screen.getByText("Unlock Provider Administration")
      ).toBeInTheDocument()
    );

    // The request fails after the lock.
    releaseToggle!();
    await screen.findByText(/boom/i);

    // The payload the lock dropped does not come back.
    const entries = client.getQueriesData({ queryKey: ["admin", "health"] });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(([, data]) => data === undefined)).toBe(true);
  });

  it("keeps a row busy while its own request is open", async () => {
    // Two rows can be acted on at once. Each row must stay busy until
    // its own request is answered, not until the last request is.
    const releases = new Map<string, () => void>();
    const twoKeys = {
      ...HEALTH,
      keys: [
        HEALTH.keys[0],
        { ...HEALTH.keys[0], id: 2, label: "key-2", accountId: "acct-2" },
      ],
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = typeof input === "string" ? input : input.toString();
        if (
          path.startsWith("/api/admin/keys/") &&
          (init?.method ?? "GET") === "PATCH"
        ) {
          const id = path.slice("/api/admin/keys/".length);
          await new Promise<void>((resolve) => {
            releases.set(id, resolve);
          });
          return jsonResponse(true, {});
        }
        if (path === "/api/admin/health") return jsonResponse(true, twoKeys);
        if (path === "/api/internal/models") return jsonResponse(true, []);
        return jsonResponse(true, {});
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderWorkbench();
    await unlock(user);

    const first = screen.getByRole("switch", { name: /Disable key-1/i });
    const second = screen.getByRole("switch", { name: /Disable key-2/i });

    await user.click(first);
    await waitFor(() => expect(first).toBeDisabled());

    // The second row is acted on while the first is still open.
    await user.click(second);
    await waitFor(() => expect(second).toBeDisabled());

    // The first row's own request is still open, so it stays busy.
    expect(first).toBeDisabled();

    releases.get("1")?.();
    releases.get("2")?.();
  });

  it("does not clear a panel error with a late answer from a dismissed drawer", async () => {
    // The panel error belongs to the panel. A drawer the operator has
    // already dismissed has nothing to say about it, so its late
    // answer must not wipe a message the operator is reading.
    let releaseSave: (() => void) | null = null;
    const deferred = new Promise<Response>((resolve) => {
      releaseSave = () => resolve(jsonResponse(true, {}));
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        if (path === "/api/admin/keys" && method === "POST") return deferred;
        if (path.endsWith("/delete")) {
          return jsonResponse(
            false,
            { error: { message: "Delete failed." } },
            500
          );
        }
        if (path === "/api/admin/health") return jsonResponse(true, HEALTH);
        if (path === "/api/internal/models") return jsonResponse(true, []);
        return jsonResponse(true, {});
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    renderWorkbench();
    await unlock(user);

    // The add request goes out and waits.
    await user.click(
      screen.getByRole("button", { name: /Add new provider key/i })
    );
    await user.type(screen.getByLabelText(/Cloudflare account ID/i), "acct-9");
    await user.type(screen.getByLabelText(/API token/i), "a-long-enough-token");
    await user.click(screen.getByRole("button", { name: "Add key" }));

    // The operator dismisses the drawer and deletes a key instead.
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    await waitFor(() =>
      expect(document.getElementById("adminSheet")).toBeNull()
    );
    await user.click(screen.getByRole("button", { name: /Delete key #1/i }));

    // The delete fails, so the panel says why.
    await waitFor(() =>
      expect(document.getElementById("adminPanelError")?.textContent).toContain(
        "Delete failed."
      )
    );

    // The add answers late.
    releaseSave!();
    const healthCalls = () =>
      fetchMock.mock.calls.filter(
        (call) => String(call[0]) === "/api/admin/health"
      ).length;
    const before = healthCalls();
    await waitFor(() => expect(healthCalls()).toBeGreaterThan(before));

    // The message the operator is reading is still there.
    expect(document.getElementById("adminPanelError")?.textContent).toContain(
      "Delete failed."
    );
  });

  it("shows the server's reason when the admin gate is disabled", async () => {
    // A disabled admin gate is not the operator's key being wrong, so
    // the server's own reason is shown when it says which it was.
    stubApi((route) =>
      route.path === "/api/admin/health"
        ? jsonResponse(
            false,
            {
              error: {
                message: "Admin API is disabled.",
                code: "admin_disabled",
              },
            },
            403
          )
        : null
    );
    const user = userEvent.setup();
    renderWorkbench();

    await user.type(screen.getByLabelText(/Management Key/i), "management-key");
    await user.click(screen.getByRole("button", { name: /Unlock/i }));

    expect(
      await screen.findByText("Admin API is disabled.")
    ).toBeInTheDocument();
    expect(document.getElementById("adminPanel")?.className).toContain(
      "hidden"
    );
  });

  it("ends the session when the credential payload is refused", async () => {
    // A 401 means the bearer key is no longer accepted, so the whole
    // session is over and the operator has to sign in again.
    stubApi((route) =>
      route.path === "/api/admin/health"
        ? jsonResponse(false, { error: { message: "Unauthorized." } }, 401)
        : null
    );
    const user = userEvent.setup();
    renderWorkbench();

    await user.type(screen.getByLabelText(/Management Key/i), "management-key");
    await user.click(screen.getByRole("button", { name: /Unlock/i }));

    expect(await screen.findByText(/Session expired/i)).toBeInTheDocument();
    expect(document.getElementById("adminPanel")?.className).toContain(
      "hidden"
    );
  });
});
