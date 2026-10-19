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

function stubFetch(impl: (url: string) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    impl(typeof input === "string" ? input : input.toString())
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("the client shell", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
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
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("/v1/models");
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
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("shows the generator by default", () => {
    stubFetch(() => jsonResponse(true, { data: [] }));
    render(<App />);

    expect(document.getElementById("generatorView")).not.toBeNull();
    expect(document.getElementById("adminView")).toBeNull();
  });
});
