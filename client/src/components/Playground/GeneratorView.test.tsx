import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AdminKeyProvider } from "../../app/admin-key";
import { AuthProvider } from "../../app/auth";
import { ThemeProvider } from "../../app/theme";
import { GeneratorView } from "./GeneratorView";

/**
 * The generator.
 *
 * The rules the legacy page kept: the picker only offers a model the
 * request path would accept, the submit button is disabled while that is
 * impossible, an expired session signs the operator out, and a failed
 * generation leaves the previous result alone.
 */

const MODELS = [
  {
    id: "sdxl",
    name: "SDXL",
    description: "A text-to-image model.",
    taskTypes: ["text-to-image"],
    parameters: {
      width: { cfParam: "width", type: "integer" },
      height: { cfParam: "height", type: "integer" },
      steps: { cfParam: "steps", type: "integer" },
    },
    limits: {
      maxPromptLength: 1024,
      defaultSteps: 4,
      maxSteps: 20,
      minWidth: 512,
      maxWidth: 4096,
      minHeight: 512,
      maxHeight: 4096,
      supportedSizes: ["1024x1024"],
    },
    provider: "cloudflare",
    inferenceProvider: "cloudflare",
    available: true,
  },
  {
    id: "img2img-only",
    name: "Image to Image",
    description: "A model with no text-to-image task.",
    taskTypes: ["image-to-image"],
    parameters: {},
    limits: {
      maxPromptLength: 1024,
      defaultSteps: 4,
      maxSteps: 20,
      minWidth: 512,
      maxWidth: 4096,
      minHeight: 512,
      maxHeight: 4096,
      supportedSizes: [],
    },
    provider: "cloudflare",
    inferenceProvider: "cloudflare",
    available: true,
  },
  {
    id: "unservable",
    name: "Unservable",
    description: "A model whose provider holds no servable key.",
    taskTypes: ["text-to-image"],
    parameters: {},
    limits: {
      maxPromptLength: 1024,
      defaultSteps: 4,
      maxSteps: 20,
      minWidth: 512,
      maxWidth: 4096,
      minHeight: 512,
      maxHeight: 4096,
      supportedSizes: [],
    },
    provider: "cloudflare",
    inferenceProvider: "cloudflare",
    available: false,
  },
];

function jsonResponse(ok: boolean, body: unknown, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

type Route = { path: string; body: unknown; method: string };

function stubApi(
  overrides: (route: Route) => Response | Promise<Response> | null = () => null
): Route[] {
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
      if (path === "/api/internal/models") return jsonResponse(true, MODELS);
      return jsonResponse(true, {});
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderGenerator() {
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
  return render(<GeneratorView />, { wrapper });
}

async function ready() {
  // The picker shows a "Loading models…" placeholder option first, so
  // wait for a real model to appear.
  await waitFor(() =>
    expect(
      document.getElementById("model")?.querySelector('option[value="sdxl"]')
    ).not.toBeNull()
  );
}

describe("the generator", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem("api_key", "bearer-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers only the text-to-image models the request path would accept", async () => {
    stubApi();
    renderGenerator();
    await ready();

    const options = Array.from(
      document.getElementById("model")?.querySelectorAll("option") ?? []
    ).map((option) => option.getAttribute("value"));
    expect(options).toEqual(["sdxl"]);
  });

  it("warns and refuses to submit when no credential is servable", async () => {
    stubApi((route) =>
      route.path === "/api/internal/models"
        ? jsonResponse(
            true,
            MODELS.map((model) => ({ ...model, available: false }))
          )
        : null
    );
    renderGenerator();

    await waitFor(() =>
      expect(document.getElementById("noKeysWarning")?.className).not.toContain(
        "hidden"
      )
    );
    expect(
      (document.getElementById("submitButton") as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("offers the size and steps controls the selected model declares", async () => {
    stubApi();
    renderGenerator();
    await ready();

    await userEvent.click(document.getElementById("toggleAdvanced")!);
    await waitFor(() =>
      expect(document.getElementById("sizeWrap")?.className).not.toContain(
        "hidden"
      )
    );
    expect(document.getElementById("stepsWrap")?.className).not.toContain(
      "hidden"
    );
    // The model declares no guidance, so the control is not rendered
    // at all rather than rendered empty.
    expect(document.getElementById("guidanceWrap")).toBeNull();
  });

  it("sends the parameters the selected model declares", async () => {
    const calls = stubApi((route) =>
      route.path === "/v1/images/generations"
        ? jsonResponse(true, { data: [{ b64_json: "AAA" }] })
        : null
    );
    const user = userEvent.setup();
    renderGenerator();
    await ready();

    await user.clear(document.getElementById("prompt")!);
    await user.type(document.getElementById("prompt")!, "a cat");
    await user.click(document.getElementById("submitButton")!);

    await waitFor(() =>
      expect(calls.some((call) => call.path === "/v1/images/generations")).toBe(
        true
      )
    );
    const generation = calls.find(
      (call) => call.path === "/v1/images/generations"
    );
    expect(generation?.body).toMatchObject({
      model: "sdxl",
      prompt: "a cat",
      n: 1,
      size: "1024x1024",
      steps: 4,
    });
    // The model declares neither, so neither is sent.
    expect(generation?.body).not.toHaveProperty("guidance");
    expect(generation?.body).not.toHaveProperty("negative_prompt");
  });

  it("keeps the submit button disabled while a generation is in flight", async () => {
    // A second click must not start a second request for the same
    // prompt, so the button is busy for as long as the request is open.
    let release: (() => void) | null = null;
    const deferred = new Promise<Response>((resolve) => {
      release = () =>
        resolve(jsonResponse(true, { data: [{ b64_json: "AAA" }] }));
    });
    stubApi((route) =>
      route.path === "/v1/images/generations" ? deferred : null
    );
    const user = userEvent.setup();
    renderGenerator();
    await ready();

    const submit = document.getElementById("submitButton") as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    await user.click(submit);
    await waitFor(() => expect(submit.disabled).toBe(true));

    release!();
    await waitFor(() => expect(submit.disabled).toBe(false));
  });

  it("shows the server's message when the generation fails", async () => {
    stubApi((route) =>
      route.path === "/v1/images/generations"
        ? jsonResponse(
            false,
            { error: { message: "Provider rejected it." } },
            500
          )
        : null
    );
    const user = userEvent.setup();
    renderGenerator();
    await ready();

    await user.click(document.getElementById("submitButton")!);

    expect(
      await screen.findByText(/Provider rejected it\./)
    ).toBeInTheDocument();
  });

  it("signs the operator out when the session has expired", async () => {
    stubApi((route) =>
      route.path === "/v1/images/generations"
        ? jsonResponse(false, { error: { message: "Unauthorized" } }, 401)
        : null
    );
    const user = userEvent.setup();
    renderGenerator();
    await ready();

    await user.click(document.getElementById("submitButton")!);

    expect(await screen.findByText(/Session expired/i)).toBeInTheDocument();
    // The bearer key is gone, so the tab is signed out.
    await waitFor(() =>
      expect(window.sessionStorage.getItem("api_key")).toBeNull()
    );
  });

  it("asks for a prompt before it calls the server", async () => {
    const calls = stubApi();
    const user = userEvent.setup();
    renderGenerator();
    await ready();

    await user.clear(document.getElementById("prompt")!);
    await user.click(document.getElementById("submitButton")!);

    expect(
      await screen.findByText(/Please enter a prompt/i)
    ).toBeInTheDocument();
    expect(calls.some((call) => call.path === "/v1/images/generations")).toBe(
      false
    );
  });

  it("keeps the model list and the picker in step after a failed refetch", async () => {
    // The workbench refetches the registry after a key mutation, and
    // that refetch can fail. The stale options must not survive it.
    let failModels = false;
    stubApi((route) => {
      if (route.path === "/api/internal/models") {
        if (failModels) {
          return jsonResponse(false, { error: "boom" }, 500);
        }
        return jsonResponse(true, MODELS);
      }
      return null;
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
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
    render(<GeneratorView />, { wrapper });
    await ready();

    expect(
      document.getElementById("model")?.querySelectorAll("option").length
    ).toBe(1);

    failModels = true;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["models"] });
    });

    await waitFor(() =>
      expect(
        document.getElementById("model")?.querySelectorAll("option").length
      ).toBe(0)
    );
    // The submit is refused while the registry is unreadable.
    expect(
      (document.getElementById("submitButton") as HTMLButtonElement).disabled
    ).toBe(true);
    expect(document.getElementById("modelError")?.className).not.toContain(
      "hidden"
    );
  });
});
