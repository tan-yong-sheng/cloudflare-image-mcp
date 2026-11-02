import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AdminKeyProvider } from "../../app/admin-key";
import { AuthProvider } from "../../app/auth";
import { ThemeProvider } from "../../app/theme";
import { CALLER_KEYS_QUERY_FAMILY } from "../../api/admin";
import { ApiKeysPage } from "./ApiKeysPage";

/**
 * The API-keys page.
 *
 * These are the keys a client presents to reach this Worker's API (the
 * domain calls them caller keys; the UI calls them API keys). The rules
 * these tests pin: the list is behind the management-key gate like
 * everything else behind it, each key is shown by name and masked hint,
 * a disabled key is visible as disabled, and locking the page leaves
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

function stubApi(
  callerKeys: unknown = CALLER_KEYS,
  callerKeysStatus: number | ((attempt: number) => number) = 200
) {
  const calls: Route[] = [];
  let attempt = 0;
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input.toString();
      calls.push({ path, method: init?.method ?? "GET" });
      if (path === "/api/admin/health") return jsonResponse(HEALTH);
      if (path === "/api/admin/caller-keys") {
        const status =
          typeof callerKeysStatus === "function"
            ? callerKeysStatus(attempt++)
            : callerKeysStatus;
        return jsonResponse(callerKeys, status);
      }
      if (path === "/api/internal/models") return jsonResponse([]);
      return jsonResponse({});
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderApiKeysPage() {
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
  const utils = render(<ApiKeysPage />, { wrapper });
  return { ...utils, client };
}

async function unlock(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Management Key/i), "management-key");
  await user.click(screen.getByRole("button", { name: /Unlock/i }));
  await waitFor(() =>
    expect(document.getElementById("adminCallerKeys")?.children.length).toBe(2)
  );
}

describe("the API-keys page", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem("api_key", "bearer-key");
    window.location.hash = "#admin/api-keys";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for the caller keys only after the management key is entered", async () => {
    const calls = stubApi();
    const user = userEvent.setup();
    renderApiKeysPage();

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
    renderApiKeysPage();

    await unlock(user);

    const body = document.getElementById("adminCallerKeys");
    expect(body?.textContent).toContain("Laptop");
    expect(body?.textContent).toContain("sk-mgmt-…a1b2");
    expect(body?.textContent).toContain("CI");
    expect(body?.textContent).toContain("…c3d4");
  });

  it("marks a disabled caller key and mutes its row", async () => {
    stubApi();
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);

    const enabled = screen.getByTestId("admin-caller-key-1");
    const disabled = screen.getByTestId("admin-caller-key-2");
    expect(enabled.textContent).toContain("Enabled");
    expect(disabled.textContent).toContain("Disabled");
    // A parked key stays visible, but muted so it does not read as
    // active. The muted colour is applied at full opacity — fading the
    // whole row would take the text under the contrast bar with it.
    expect(disabled.className).toContain("row-muted");
    expect(enabled.className).not.toContain("row-muted");
  });

  it("shows an empty state when there are no caller keys", async () => {
    stubApi({ keys: [] });
    const user = userEvent.setup();
    renderApiKeysPage();

    await user.type(screen.getByLabelText(/Management Key/i), "management-key");
    await user.click(screen.getByRole("button", { name: /Unlock/i }));

    await waitFor(() =>
      expect(
        document.getElementById("adminCallerKeysEmpty")?.textContent
      ).toContain("No API keys yet.")
    );
  });

  it("does not present a failed read as an empty list", async () => {
    stubApi({ error: { message: "boom" } }, 500);
    const user = userEvent.setup();
    renderApiKeysPage();

    await user.type(screen.getByLabelText(/Management Key/i), "management-key");
    await user.click(screen.getByRole("button", { name: /Unlock/i }));

    // "No API keys yet." is a claim about what the server said. A
    // request that failed has no answer to claim, so the table says the
    // list is unknown and the panel's alert carries the reason.
    await waitFor(() =>
      expect(
        document.getElementById("adminCallerKeysEmpty")?.textContent
      ).toContain("Could not load API keys.")
    );
    expect(
      document.getElementById("adminCallerKeysEmpty")?.textContent
    ).not.toContain("No API keys yet.");
  });

  it("says a failed refresh left the rows stale", async () => {
    // The first read succeeds, the next one fails.
    stubApi(CALLER_KEYS, (attempt) => (attempt === 0 ? 200 : 500));
    const user = userEvent.setup();
    const { client } = renderApiKeysPage();

    await unlock(user);

    await client.refetchQueries({ queryKey: CALLER_KEYS_QUERY_FAMILY });

    // A failed refetch keeps the last good rows (TanStack Query holds the
    // data) and sets the error state. The rows stay on screen as the last
    // known state, and the table says they could not be refreshed — the
    // failure is not hidden behind them.
    await waitFor(() =>
      expect(
        document.getElementById("adminCallerKeysEmpty")?.textContent
      ).toContain("Could not refresh API keys.")
    );
    // The message has to be visible, not merely present: the paragraph is
    // hidden while rows are on screen, and a hidden message tells the
    // operator nothing.
    expect(
      document.getElementById("adminCallerKeysEmpty")?.className
    ).not.toContain("hidden");
    expect(document.getElementById("adminCallerKeys")?.children.length).toBe(2);
  });

  it("leaves nothing of the list behind when the panel is locked", async () => {
    stubApi();
    const user = userEvent.setup();
    const { client } = renderApiKeysPage();

    await unlock(user);

    await user.click(screen.getByRole("button", { name: /Lock API keys/i }));

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
    renderApiKeysPage();

    await unlock(user);

    for (const storage of [window.sessionStorage, window.localStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index) ?? "";
        expect(key).not.toMatch(/caller/i);
        // The names and hints are what the panel fetched, so a regression
        // that persisted the payload under a generic key would pass a
        // key-name check while still leaving the list behind to read.
        const entry = `${key}=${storage.getItem(key) ?? ""}`;
        for (const { name, maskedKey } of CALLER_KEYS.keys) {
          expect(entry).not.toContain(name);
          expect(entry).not.toContain(maskedKey);
        }
      }
    }
    for (const { name, maskedKey } of CALLER_KEYS.keys) {
      expect(document.cookie).not.toContain(name);
      expect(document.cookie).not.toContain(maskedKey);
    }
  });
});

describe("creating a caller key (#126)", () => {
  // The form is the only writer this page has: name plus an optional
  // secret in, one 201 out whose plaintext is shown once and never
  // again. What these tests pin: the request carries what was typed
  // (nothing more), the banner holds the plaintext until dismissed or
  // locked, the fields clear after success but keep their values through
  // a failure, and nothing lands in a storage backend.

  const CREATED = {
    key: {
      id: 3,
      name: "CI",
      prefix: "sk-mgmt-",
      suffix: "a1b2",
      enabled: true,
      created_at: 1_700_000_200,
    },
    secret: "sk-mgmt-0123456789abcdef012345",
  };

  function stubCreateApi(response: { status: number; body: unknown }) {
    const posts: { body: Record<string, unknown> }[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = typeof input === "string" ? input : input.toString();
        if (init?.method === "POST" && path === "/api/admin/caller-keys") {
          posts.push({ body: JSON.parse(String(init.body)) });
          return jsonResponse(response.body, response.status);
        }
        if (path === "/api/admin/caller-keys") return jsonResponse(CALLER_KEYS);
        if (path === "/api/admin/health") return jsonResponse(HEALTH);
        return jsonResponse({});
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    return posts;
  }

  async function fillAndSubmit(
    user: ReturnType<typeof userEvent.setup>,
    values: { name: string; secret: string }
  ) {
    if (values.name) {
      await user.type(screen.getByLabelText(/Name/), values.name);
    }
    if (values.secret) {
      await user.type(screen.getByLabelText(/Your own secret/), values.secret);
    }
    await user.click(screen.getByRole("button", { name: /Add key/i }));
  }

  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem("api_key", "bearer-key");
    window.location.hash = "#admin/api-keys";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the typed values and shows the plaintext once", async () => {
    const posts = stubCreateApi({ status: 201, body: CREATED });
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);
    await fillAndSubmit(user, { name: "CI", secret: "" });

    // A blank secret field sends no secret key at all: absence is how the
    // client says "generate one", and an empty string would read as a
    // zero-length operator secret.
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ name: "CI" });

    const banner = await waitFor(() =>
      document.getElementById("callerKeySecret")
    );
    expect(banner?.textContent).toContain(CREATED.secret);
    // Success clears the fields — the secret must not linger in an input.
    expect(
      (screen.getByLabelText(/Your own secret/) as HTMLInputElement).value
    ).toBe("");
    expect((screen.getByLabelText(/Name/) as HTMLInputElement).value).toBe("");
    // The list was refetched, so the new row appears without a reload.
    await waitFor(() =>
      expect(
        document.getElementById("adminCallerKeys")?.children.length
      ).toBeGreaterThan(0)
    );
  });

  it("sends an operator secret when one is typed", async () => {
    const posts = stubCreateApi({ status: 201, body: CREATED });
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);
    await fillAndSubmit(user, { name: "brought", secret: "op-secret-1" });

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ name: "brought", secret: "op-secret-1" });
  });

  it("keeps the fields and shows the reason on a validation error", async () => {
    stubCreateApi({
      status: 400,
      body: {
        error: {
          message: "secret must be printable ASCII with no spaces",
          type: "invalid_request_error",
          code: null,
        },
      },
    });
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);
    await fillAndSubmit(user, { name: "CI", secret: "has space" });

    const message = await waitFor(() =>
      document.getElementById("callerKeyAddError")
    );
    expect(message?.textContent).toContain("printable ASCII");
    // A failed create leaves the form as the operator filled it, so the
    // fix is an edit, not a retyping.
    expect((screen.getByLabelText(/Name/) as HTMLInputElement).value).toBe(
      "CI"
    );
    expect(
      (screen.getByLabelText(/Your own secret/) as HTMLInputElement).value
    ).toBe("has space");
    // Nothing was created, so no banner exists to reveal.
    expect(document.getElementById("callerKeyCreated")).toBeNull();
  });

  it("hides the one-shot secret on dismiss and never persists it", async () => {
    stubCreateApi({ status: 201, body: CREATED });
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);
    await fillAndSubmit(user, { name: "CI", secret: "" });
    await waitFor(() =>
      expect(document.getElementById("callerKeySecret")).not.toBeNull()
    );

    await user.click(screen.getByRole("button", { name: /Hide the secret/i }));
    // "Shown once" is a claim the DOM keeps: after the dismiss there is
    // no copy of the plaintext left to read.
    expect(document.getElementById("callerKeyCreated")).toBeNull();
    expect(document.body.textContent).not.toContain(CREATED.secret);

    for (const storage of [window.sessionStorage, window.localStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index) ?? "";
        expect(`${key}=${storage.getItem(key) ?? ""}`).not.toContain(
          CREATED.secret
        );
      }
    }
    expect(document.cookie).not.toContain(CREATED.secret);
  });

  it("tears the one-shot secret down when the panel locks", async () => {
    stubCreateApi({ status: 201, body: CREATED });
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);
    await fillAndSubmit(user, { name: "CI", secret: "" });
    await waitFor(() =>
      expect(document.getElementById("callerKeySecret")).not.toBeNull()
    );

    await user.click(screen.getByRole("button", { name: /Lock API keys/i }));

    // Locking ends the session: the banner goes with it, the same way the
    // cached list does. Re-unlocking starts from a page with no secret.
    expect(document.getElementById("callerKeyCreated")).toBeNull();
    expect(document.body.textContent).not.toContain(CREATED.secret);
  });

  it("toggles the secret field between hidden and plain", async () => {
    stubCreateApi({ status: 201, body: CREATED });
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);

    const secretInput = screen.getByLabelText(
      /Your own secret/
    ) as HTMLInputElement;
    const eye = screen.getByRole("button", { name: /Show secret/i });
    expect(secretInput.type).toBe("password");
    expect(eye.getAttribute("aria-pressed")).toBe("false");

    await user.click(eye);
    expect(secretInput.type).toBe("text");
    expect(eye.getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: /Hide secret/i }));
    expect(secretInput.type).toBe("password");
  });

  it("opts the secret field out of password managers", async () => {
    stubCreateApi({ status: 201, body: CREATED });
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);

    const secretInput = screen.getByLabelText(
      /Your own secret/
    ) as HTMLInputElement;
    // autocomplete="new-password" plus the 1Password opt-out: an
    // operator-supplied secret is a credential, and no manager should
    // offer to save the one the operator just made up.
    expect(secretInput.getAttribute("autocomplete")).toBe("new-password");
    expect(secretInput.hasAttribute("data-1p-ignore")).toBe(true);
  });
});

describe("rotating a caller key (#127)", () => {
  // Rotation hands out a fresh plaintext and kills the old secret. The
  // tests pin the guard rails: the request only ever leaves through the
  // confirmation dialog, the dialog names the row it is about, the new
  // plaintext appears once, and the list refetches to the new mask.

  const ROTATED = {
    key: {
      id: 1,
      name: "Laptop",
      prefix: "sk-mgmt-",
      suffix: "9f8e",
      enabled: true,
      created_at: 1_700_000_000,
    },
    secret: "{{API_KEY_1il4ms0v}}",
  };

  function stubRotateApi(response: { status: number; body: unknown }) {
    const rotates: { path: string }[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = typeof input === "string" ? input : input.toString();
        if (init?.method === "POST" && path.includes("/rotate")) {
          rotates.push({ path });
          return jsonResponse(response.body, response.status);
        }
        if (path === "/api/admin/caller-keys") return jsonResponse(CALLER_KEYS);
        if (path === "/api/admin/health") return jsonResponse(HEALTH);
        return jsonResponse({});
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    return rotates;
  }

  it("opens a confirmation that names the key and its consequence", async () => {
    const rotates = stubRotateApi({ status: 200, body: ROTATED });
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);
    await user.click(
      document.getElementById("adminCallerKeyRotate-1") as HTMLElement
    );

    expect(screen.getByText(/Rotate “Laptop”\?/)).toBeTruthy();
    expect(
      document.getElementById("callerKeyConfirmMessage")?.textContent
    ).toContain("Clients using this key will need the new key");
    // Opening the dialog sends nothing: the request leaves only from the
    // confirm button.
    expect(rotates).toHaveLength(0);
  });

  it("sends nothing when the operator cancels", async () => {
    const rotates = stubRotateApi({ status: 200, body: ROTATED });
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);
    await user.click(
      document.getElementById("adminCallerKeyRotate-1") as HTMLElement
    );
    await user.click(
      document.getElementById("callerKeyConfirmCancel") as HTMLElement
    );

    expect(screen.queryByText(/Rotate “Laptop”\?/)).toBeNull();
    expect(rotates).toHaveLength(0);
  });

  it("rotates from the dialog and shows the new plaintext once", async () => {
    const rotates = stubRotateApi({ status: 200, body: ROTATED });
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);
    await user.click(
      document.getElementById("adminCallerKeyRotate-1") as HTMLElement
    );
    await user.click(
      document.getElementById("callerKeyConfirmOk") as HTMLElement
    );

    await waitFor(() => expect(rotates).toHaveLength(1));
    expect(rotates[0].path).toBe("/api/admin/caller-keys/1/rotate");

    const banner = await waitFor(() =>
      document.getElementById("callerKeySecret")
    );
    expect(banner?.textContent).toContain(ROTATED.secret);
    // The banner tells the rotated story, not the created one.
    expect(document.getElementById("callerKeyCreated")?.textContent).toContain(
      "the old one stopped working"
    );
    // The dialog is done; the mask refetches to the new hint.
    await waitFor(() =>
      expect(screen.queryByText(/Rotate “Laptop”\?/)).toBeNull()
    );
  });

  it("reports a failed rotate on the panel's alert line", async () => {
    stubRotateApi({
      status: 404,
      body: { error: { message: "unknown caller key 1" } },
    });
    const user = userEvent.setup();
    renderApiKeysPage();

    await unlock(user);
    await user.click(
      document.getElementById("adminCallerKeyRotate-1") as HTMLElement
    );
    await user.click(
      document.getElementById("callerKeyConfirmOk") as HTMLElement
    );

    await waitFor(() =>
      expect(document.getElementById("apiKeysError")?.textContent).toContain(
        "unknown caller key 1"
      )
    );
    // A failed rotate produced no plaintext, so there is no banner.
    expect(document.getElementById("callerKeyCreated")).toBeNull();
  });
});
