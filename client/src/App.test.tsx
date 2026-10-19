import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

/**
 * The shell tests cover the behaviour the legacy page promised and the
 * Playwright suite asserts on: the API-key prompt, the sign-in flow, the
 * theme toggle and the hash route.
 */

function jsonResponse(ok: boolean, body: unknown, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function stubFetch(impl: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      impl(typeof input === "string" ? input : input.toString(), init)
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const HEALTH = {
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

describe("the client shell", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    window.location.hash = "";
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for an API key when the tab holds none", () => {
    stubFetch(() => jsonResponse(true, { data: [] }));
    render(<App />);

    expect(document.getElementById("loginModal")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: /Login Required/i })
    ).toBeInTheDocument();
  });

  it("signs the operator in with a valid key", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() =>
      jsonResponse(true, { object: "list", data: [] })
    );
    render(<App />);

    await user.type(
      screen.getByLabelText(/Password \/ API Key/i),
      "secret-key"
    );
    await user.click(screen.getByRole("button", { name: /^Login$/i }));

    await waitFor(() =>
      expect(document.getElementById("loginModal")).toBeNull()
    );
    expect(window.sessionStorage.getItem("api_key")).toBe("secret-key");
    // The key is validated against an authenticated route. The registry
    // read is public and may come first, so ask whether the key was
    // sent, not what was sent first.
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]) === "/v1/models")
    ).toBe(true);
  });

  it("keeps the prompt up and explains itself when the key is refused", async () => {
    const user = userEvent.setup();
    stubFetch(() => jsonResponse(false, { error: "Unauthorized" }, 401));
    render(<App />);

    await user.type(screen.getByLabelText(/Password \/ API Key/i), "wrong-key");
    await user.click(screen.getByRole("button", { name: /^Login$/i }));

    expect(await screen.findByText("Invalid API key")).toBeInTheDocument();
    expect(document.getElementById("loginModal")).not.toBeNull();
    expect(window.sessionStorage.getItem("api_key")).toBeNull();
  });

  it("refuses an empty key without asking the server", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => jsonResponse(true, { data: [] }));
    render(<App />);

    await user.click(screen.getByRole("button", { name: /^Login$/i }));

    expect(
      await screen.findByText("Please enter a password")
    ).toBeInTheDocument();
    // The key is never sent: an empty key cannot be validated.
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]) === "/v1/models")
    ).toBe(false);
  });

  it("keeps a key that was already in the tab", () => {
    window.sessionStorage.setItem("api_key", "stored-key");
    stubFetch(() => jsonResponse(true, { data: [] }));
    render(<App />);

    expect(document.getElementById("loginModal")).toBeNull();
  });

  it("toggles the dark theme on the document element", async () => {
    const user = userEvent.setup();
    stubFetch(() => jsonResponse(true, { data: [] }));
    render(<App />);

    expect(document.documentElement).not.toHaveClass("dark");
    await user.click(screen.getByRole("button", { name: "Toggle dark theme" }));
    expect(document.documentElement).toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "Toggle dark theme" }));
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("opens the workbench on the admin hash route", () => {
    window.location.hash = "#admin";
    stubFetch(() => jsonResponse(true, { data: [] }));
    render(<App />);

    expect(document.getElementById("adminView")).not.toBeNull();
    expect(document.getElementById("generatorView")).toBeNull();
  });

  it("re-syncs the route on a history navigation that announces no hash change", async () => {
    // The legacy shell listened to both events. A history navigation
    // can announce the new URL through popstate alone, and the route
    // has to follow it.
    stubFetch(() => jsonResponse(true, { data: [] }));
    // A hash change left over from the previous test would answer the
    // question for us: it is delivered with whatever the hash is by
    // then, so it is flushed while the hash is still empty.
    await new Promise((resolve) => setTimeout(resolve, 0));
    render(<App />);

    expect(document.getElementById("generatorView")).not.toBeNull();

    // replaceState announces nothing; the popstate does.
    window.history.replaceState(null, "", "/#admin");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() =>
      expect(document.getElementById("adminView")).not.toBeNull()
    );
    expect(document.getElementById("generatorView")).toBeNull();
  });

  it("leaves the workbench when the operator came in on the /admin path", async () => {
    // The path is an entry alias. If it kept pinning the route, the
    // Back button would be dead: the hash never changes, so nothing
    // would change the route either.
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/admin");
    stubFetch(() => jsonResponse(true, { data: [] }));
    render(<App />);

    expect(document.getElementById("adminView")).not.toBeNull();

    await user.click(
      screen.getByRole("button", { name: /Back to Image Generator/i })
    );

    await waitFor(() =>
      expect(document.getElementById("generatorView")).not.toBeNull()
    );
    expect(document.getElementById("adminView")).toBeNull();
  });

  it("keeps the workbench when the operator signs in on the /admin path", async () => {
    // The legacy shell reacted to an auth change, not to the first
    // render: an operator who opened `/admin` before signing in landed
    // in the workbench once they did.
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/admin");
    stubFetch(() => jsonResponse(true, { object: "list", data: [] }));
    render(<App />);

    expect(document.getElementById("loginModal")).not.toBeNull();

    await user.type(
      screen.getByLabelText(/Password \/ API Key/i),
      "secret-key"
    );
    await user.click(screen.getByRole("button", { name: /^Login$/i }));

    await waitFor(() =>
      expect(document.getElementById("loginModal")).toBeNull()
    );
    expect(document.getElementById("adminView")).not.toBeNull();
    expect(document.getElementById("generatorView")).toBeNull();
  });

  it("shows the generator by default", () => {
    stubFetch(() => jsonResponse(true, { data: [] }));
    render(<App />);

    expect(document.getElementById("generatorView")).not.toBeNull();
    expect(document.getElementById("adminView")).toBeNull();
  });

  it("does not send the management key again after the workbench is left", async () => {
    // The management key must not travel after the admin session ended.
    window.sessionStorage.setItem("api_key", "bearer-key");
    window.location.hash = "#admin";
    let healthCalls = 0;
    stubFetch((url) => {
      if (url === "/api/admin/health") {
        healthCalls += 1;
        return jsonResponse(true, HEALTH);
      }
      if (url === "/api/internal/models") return jsonResponse(true, []);
      return jsonResponse(true, { data: [] });
    });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/Management Key/i), "management-key");
    await user.click(screen.getByRole("button", { name: /Unlock/i }));
    await waitFor(() => expect(healthCalls).toBe(1));

    // Leave the workbench: no further credentialed request goes out.
    await user.click(
      screen.getByRole("button", { name: /Back to Image Generator/i })
    );
    await waitFor(() =>
      expect(document.getElementById("generatorView")).not.toBeNull()
    );
    expect(healthCalls).toBe(1);
  });

  it("asks for the management key again after the workbench is left", async () => {
    // The management key lives exactly as long as the workbench is open,
    // so leaving it ends the admin session.
    window.sessionStorage.setItem("api_key", "bearer-key");
    window.location.hash = "#admin";
    stubFetch((url) => {
      if (url === "/api/admin/health") return jsonResponse(true, HEALTH);
      if (url === "/api/internal/models") return jsonResponse(true, []);
      return jsonResponse(true, { data: [] });
    });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/Management Key/i), "management-key");
    await user.click(screen.getByRole("button", { name: /Unlock/i }));
    await waitFor(() =>
      expect(document.getElementById("adminPanel")?.className).not.toContain(
        "hidden"
      )
    );

    // Leave the workbench for the generator.
    await user.click(
      screen.getByRole("button", { name: /Back to Image Generator/i })
    );
    await waitFor(() =>
      expect(document.getElementById("generatorView")).not.toBeNull()
    );

    // Come back: the workbench asks for the key again.
    await user.click(
      screen.getByRole("button", { name: /Manage provider credentials/i })
    );
    await waitFor(() =>
      expect(document.getElementById("adminView")).not.toBeNull()
    );
    expect(
      screen.getByText("Unlock Provider Administration")
    ).toBeInTheDocument();
    expect(document.getElementById("adminPanel")?.className).toContain(
      "hidden"
    );
  });
});
