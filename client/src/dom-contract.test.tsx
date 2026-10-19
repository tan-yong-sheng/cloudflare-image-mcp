import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AdminKeyProvider } from "./app/admin-key";
import { AuthProvider } from "./app/auth";
import { ThemeProvider } from "./app/theme";
import { AdminView } from "./components/Workbench/AdminView";
import { GeneratorView } from "./components/Playground/GeneratorView";

/**
 * The DOM contract.
 *
 * The legacy page's element ids are a published contract: the Playwright
 * suite, the documentation and the operator's own bookmarks all address
 * them. The React client keeps every one of them, so a selector written
 * against the old page still finds its element.
 */

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
];

function jsonResponse(ok: boolean, body: unknown, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = typeof input === "string" ? input : input.toString();
      if (path === "/api/internal/models") return jsonResponse(true, MODELS);
      if (path === "/api/admin/health") return jsonResponse(true, HEALTH);
      return jsonResponse(true, {});
    })
  );
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <AuthProvider>
            <AdminKeyProvider>{children}</AdminKeyProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe("the generator's DOM contract", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem("api_key", "bearer-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps every element id the legacy page published", async () => {
    stubApi();
    render(<GeneratorView />, { wrapper: wrapper(newClient()) });

    // The ids that are always present.
    for (const id of [
      "generatorView",
      "generatorViewTitle",
      "model",
      "modelError",
      "prompt",
      "toggleAdvanced",
      "advancedOptions",
      "noKeysWarning",
      "submitButton",
      "downloadButton",
      "loadingOverlay",
      "initialPrompt",
      "aiImage",
      "imageInfo",
      "usedModel",
      "generationTime",
      "generateError",
      "themeToggle",
      "logoutButton",
      "adminWorkbenchButton",
    ]) {
      expect(document.getElementById(id), id).not.toBeNull();
    }

    // The ids that belong to controls the selected model declares. The
    // model here declares width, height and steps, so the size and steps
    // controls are rendered; guidance and the negative prompt are not.
    await userEvent.click(document.getElementById("toggleAdvanced")!);
    await waitFor(() =>
      expect(document.getElementById("sizeWrap")).not.toBeNull()
    );
    for (const id of ["sizeWrap", "size", "stepsWrap", "steps"]) {
      expect(document.getElementById(id), id).not.toBeNull();
    }
    expect(document.getElementById("guidanceWrap")).toBeNull();
    expect(document.getElementById("negativePromptWrap")).toBeNull();
  });
});

describe("the workbench's DOM contract", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem("api_key", "bearer-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps every element id the legacy page published", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<AdminView />, { wrapper: wrapper(newClient()) });

    // The ids that are always present, locked or not.
    for (const id of [
      "adminView",
      "adminViewTitle",
      "adminBackBtn",
      "adminGate",
      "adminKey",
      "adminUnlock",
      "adminError",
      "adminNotice",
      "adminPanelError",
      "adminChipsActive",
      "adminChipsFamilies",
      "adminLock",
      "themeToggleAdmin",
      "logoutButtonAdmin",
    ]) {
      expect(document.getElementById(id), id).not.toBeNull();
    }

    await user.type(screen.getByLabelText(/Management Key/i), "management-key");
    await user.click(screen.getByRole("button", { name: /Unlock/i }));
    await waitFor(() =>
      expect(document.getElementById("adminRail")).not.toBeNull()
    );

    // The ids that need the panel open.
    for (const id of [
      "adminPanel",
      "adminRail",
      "adminKeys",
      "adminKeysHead",
      "adminAddKey",
      "adminFamilyName",
    ]) {
      expect(document.getElementById(id), id).not.toBeNull();
    }
  });

  it("keeps every element id of the add/edit drawer", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<AdminView />, { wrapper: wrapper(newClient()) });

    await user.type(screen.getByLabelText(/Management Key/i), "management-key");
    await user.click(screen.getByRole("button", { name: /Unlock/i }));
    await waitFor(() =>
      expect(document.getElementById("adminAddKey")).not.toBeNull()
    );
    await user.click(document.getElementById("adminAddKey")!);
    await waitFor(() =>
      expect(document.getElementById("adminSheet")).not.toBeNull()
    );

    for (const id of [
      "adminSheet",
      "adminSheetEyebrow",
      "adminSheetTitle",
      "adminSheetNote",
      "adminSheetAcctField",
      "adminSheetAcct",
      "adminSheetToken",
      "adminSheetTokenHint",
      "adminSheetTokenEye",
      "adminSheetWeight",
      "adminSheetEnabled",
      "adminSheetError",
      "adminSheetSave",
      "adminSheetCancel",
    ]) {
      expect(document.getElementById(id), id).not.toBeNull();
    }
  });
});
