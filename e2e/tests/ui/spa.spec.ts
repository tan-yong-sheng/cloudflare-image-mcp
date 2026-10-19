import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { getApiKey } from "../../lib/auth";

/**
 * The React SPA journey (issue #96).
 *
 * The API-level specs in tests/api/ prove the Worker's contract; this
 * one proves the operator's path through the React client: the login
 * modal, the playground form, the workbench unlock, and the key drawer.
 * Playwright drives a real browser against the served Worker, so a
 * broken selector, a leaked management key or a form that never reaches
 * the API all fail here.
 *
 * Three deliberate choices keep the spec deterministic and cheap:
 * - The model registry is stubbed, so the playground journey does not
 *   depend on the target having a servable provider credential.
 * - The generation request is intercepted and answered locally, so no
 *   provider is called and the spec stays inside the contract tier.
 * - The context carries no injected Authorization header. A real
 *   operator's browser sends only the key the client itself holds, and
 *   that is the wiring worth proving.
 */
test.use({ extraHTTPHeaders: {} });

// The file runs in order, in one worker: the sweep at the end must not
// delete the key the lifecycle test is still using.
test.describe.configure({ mode: "default" });

/** The account ids this suite creates. */
const SWEEP_PREFIX = "e2e-ui-";

/** A 1x1 PNG, so the gallery has something real to render. */
const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** A synthetic model, so the picker does not depend on the target's pool. */
const STUB_MODEL = {
  id: "e2e-stub-model",
  name: "E2E Stub",
  description: "A synthetic model for the journey spec.",
  taskTypes: ["text-to-image"],
  parameters: {
    width: { cfParam: "width", type: "integer", min: 512, max: 4096 },
    height: { cfParam: "height", type: "integer", min: 512, max: 4096 },
    steps: { cfParam: "steps", type: "integer", min: 1, max: 20, default: 4 },
    guidance: { cfParam: "guidance", type: "number", min: 1, max: 30 },
    negative_prompt: { cfParam: "negative_prompt", type: "string" },
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
};

function apiKey(): string {
  // A target without API_KEYS accepts any key, so the placeholder is
  // fine there; the login still has to succeed for the journey to run.
  return getApiKey() ?? "ui-e2e-placeholder-key";
}

function managementKey(): string {
  const key = process.env.ADMIN_API_KEY_E2E?.trim();
  expect(
    key,
    "ADMIN_API_KEY_E2E must be set to run the workbench journey (the target worker secret ADMIN_API_KEY)"
  ).toBeTruthy();
  return key!;
}

/** Answer the model registry with the synthetic model. */
async function stubRegistry(page: Page, available = true) {
  await page.route("**/api/internal/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ ...STUB_MODEL, available }]),
    });
  });
}

async function signIn(page: Page) {
  await page.goto("/");
  await expect(page.locator("#loginModal")).toBeVisible();
  await page.fill("#password", apiKey());
  await page.click("#loginButton");
  await expect(page.locator("#generatorView")).toBeVisible();
  await expect(page.locator("#loginModal")).toHaveCount(0);
}

/** Unlock the workbench with the management key. */
async function unlock(page: Page) {
  await page.fill("#adminKey", managementKey());
  await page.click("#adminUnlock");
  await expect(page.locator("#adminKeys tr").first()).toBeVisible();
}

/** The headers the admin routes need: both keys, like the client sends. */
function adminHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "X-Admin-Key": managementKey(),
  };
}

interface HealthKey {
  id: number;
  accountId: string | null;
  enabled: boolean;
}

async function healthKeys(request: APIRequestContext): Promise<HealthKey[]> {
  const response = await request.get("/api/admin/health", {
    headers: adminHeaders(),
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { keys: HealthKey[] };
  return body.keys ?? [];
}

/**
 * Delete every key this suite created.
 *
 * The lifecycle test removes its own key, but a run that fails before
 * that leaves a row behind, and the target's key table should not grow
 * one run at a time.
 */
async function sweep(request: APIRequestContext): Promise<void> {
  for (const key of await healthKeys(request)) {
    if ((key.accountId ?? "").startsWith(SWEEP_PREFIX)) {
      await request.post(`/api/admin/keys/${key.id}/delete`, {
        headers: adminHeaders(),
      });
    }
  }
}

test.describe("SPA shell", () => {
  test("the login modal signs the operator in", async ({ page }) => {
    await signIn(page);
    // The bearer is remembered for the tab, so a reload stays signed in.
    await page.reload();
    await expect(page.locator("#generatorView")).toBeVisible();
    await expect(page.locator("#loginModal")).toHaveCount(0);
  });

  test("the header switches between the playground and the workbench", async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.locator("#generatorView")).toBeVisible();

    await page.click("#adminWorkbenchButton");
    await expect(page.locator("#adminView")).toBeVisible();
    await expect(page.locator("#adminGate")).toBeVisible();
    // No credential data is requested before the management key.
    await expect(page.locator("#adminPanel")).toBeHidden();
    await expect(page.locator("#adminKeys tr")).toHaveCount(0);

    await page.click("#adminBackBtn");
    await expect(page.locator("#generatorView")).toBeVisible();
  });

  test("/admin opens the workbench directly", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin");
    await expect(page.locator("#adminView")).toBeVisible();
    await expect(page.locator("#adminGate")).toBeVisible();
  });

  test("the workbench can be left when the operator came in on /admin", async ({
    page,
  }) => {
    // The path is an entry alias. If it kept pinning the route, the
    // Back button would do nothing and the operator would be stuck.
    await signIn(page);
    await page.goto("/admin");
    await expect(page.locator("#adminView")).toBeVisible();

    await page.click("#adminBackBtn");
    await expect(page.locator("#generatorView")).toBeVisible();
    await expect(page.locator("#adminView")).toHaveCount(0);
  });
});

test.describe("Playground", () => {
  test("the form posts the selected model and prompt", async ({ page }) => {
    await stubRegistry(page);
    await signIn(page);

    const picker = page.locator("#model");
    await expect(picker).toBeEnabled({ timeout: 15000 });
    expect(await picker.inputValue()).toBe(STUB_MODEL.id);

    let body: Record<string, unknown> | null = null;
    await page.route("**/v1/images/generations", async (route) => {
      body = JSON.parse(route.request().postData() ?? "{}") as Record<
        string,
        unknown
      >;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ created: 1, data: [{ b64_json: PIXEL }] }),
      });
    });

    await page.fill("#prompt", "a lighthouse at dusk");
    await page.click("#submitButton");

    await expect(page.locator("#aiImage")).toBeVisible();
    expect(body).not.toBeNull();
    expect(body!["prompt"]).toBe("a lighthouse at dusk");
    expect(body!["model"]).toBe(STUB_MODEL.id);
    // Only the parameters the model declares are sent.
    expect(body!["size"]).toBe("1024x1024");
    expect(body!["steps"]).toBe(4);
  });

  test("a failed generation shows the error, not a broken image", async ({
    page,
  }) => {
    await stubRegistry(page);
    await signIn(page);
    await expect(page.locator("#model")).toBeEnabled({ timeout: 15000 });

    await page.route("**/v1/images/generations", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "no provider ready" } }),
      });
    });

    await page.fill("#prompt", "anything");
    await page.click("#submitButton");

    await expect(page.locator("#generateError")).toBeVisible();
    await expect(page.locator("#generateError")).toContainText(
      "no provider ready"
    );
    // The image slot stays in the DOM but holds nothing.
    await expect(page.locator("#aiImage")).toBeHidden();
  });

  test("a target without a servable credential says so", async ({ page }) => {
    await stubRegistry(page, false);
    await signIn(page);

    await expect(page.locator("#noKeysWarning")).toBeVisible();
    await expect(page.locator("#model")).toBeDisabled();
    await expect(page.locator("#submitButton")).toBeDisabled();
  });
});

test.describe("Workbench", () => {
  test("the management key unlocks the credential data", async ({ page }) => {
    await signIn(page);
    await page.click("#adminWorkbenchButton");

    await expect(page.locator("#adminGate")).toBeVisible();
    await unlock(page);
    // The summary chips are only rendered once the payload arrived.
    await expect(page.locator("#adminChipsActive")).toBeVisible();
    await expect(page.locator("#adminChipsFamilies")).toBeVisible();
  });

  test("leaving the workbench ends the admin session", async ({ page }) => {
    await signIn(page);
    await page.click("#adminWorkbenchButton");
    await page.fill("#adminKey", managementKey());
    await page.click("#adminUnlock");
    await expect(page.locator("#adminChipsActive")).toBeVisible();

    // Back to the generator: the management key goes with it.
    await page.click("#adminBackBtn");
    await expect(page.locator("#generatorView")).toBeVisible();

    // Coming back asks for the key again.
    await page.click("#adminWorkbenchButton");
    await expect(page.locator("#adminGate")).toBeVisible();
    await expect(page.locator("#adminKeys tr")).toHaveCount(0);
  });

  test("the wrong management key is refused", async ({ page }) => {
    await signIn(page);
    await page.click("#adminWorkbenchButton");

    await page.fill("#adminKey", "definitely-wrong-management-key");
    await page.click("#adminUnlock");

    await expect(page.locator("#adminError")).toBeVisible();
    await expect(page.locator("#adminKeys tr")).toHaveCount(0);
  });

  test("a key can be added, toggled, rotated and deleted", async ({
    page,
    request,
  }) => {
    await signIn(page);
    await page.click("#adminWorkbenchButton");
    await unlock(page);

    // The workbench opens on the first provider family; pick the
    // Cloudflare one so the account field is the one under test.
    await page.locator("#adminRail button", { hasText: "Cloudflare" }).click();

    const accountId = `${SWEEP_PREFIX}${Date.now()}`;
    try {
      await page.click("#adminAddKey");
      await expect(page.locator("#adminSheet")).toBeVisible();
      await page.fill("#adminSheetAcct", accountId);
      await page.fill("#adminSheetToken", "ui-e2e-token-value");
      await page.click("#adminSheetSave");

      const row = page.locator("#adminKeys tr").filter({ hasText: accountId });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("v1");

      // Toggling parks the key, and the state survives a reload. The
      // switch is optimistic, so wait for the server to agree before
      // reloading: a reload can outrun the request and the key would
      // come back enabled.
      const toggle = row.getByRole("switch");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await expect
        .poll(
          async () =>
            (await healthKeys(request)).find(
              (key) => key.accountId === accountId
            )?.enabled,
          { timeout: 15000 }
        )
        .toBe(false);

      await page.reload();
      await expect(page.locator("#adminGate")).toBeVisible();
      await unlock(page);
      const parked = page
        .locator("#adminKeys tr")
        .filter({ hasText: accountId })
        .getByRole("switch");
      await expect(parked).toHaveAttribute("aria-checked", "false");

      // A new token in the edit drawer rotates the version.
      await page
        .locator("#adminKeys tr")
        .filter({ hasText: accountId })
        .getByRole("button", { name: /^Edit key/ })
        .click();
      await expect(page.locator("#adminSheet")).toBeVisible();
      await page.fill("#adminSheetToken", "ui-e2e-token-value-rotated");
      await page.click("#adminSheetSave");
      await expect(
        page.locator("#adminKeys tr").filter({ hasText: accountId })
      ).toContainText("v2");

      // Clean up: the delete is confirmed by the operator.
      page.once("dialog", (dialog) => void dialog.accept());
      await page
        .locator("#adminKeys tr")
        .filter({ hasText: accountId })
        .getByRole("button", { name: /^Delete key/ })
        .click();
      await expect(
        page.locator("#adminKeys tr").filter({ hasText: accountId })
      ).toHaveCount(0);
    } finally {
      // The key is removed even when an assertion fails, so a broken run
      // does not leave a row behind in the target's key table.
      await sweep(request);
    }
  });

  test("locking drops the credential data from the page", async ({ page }) => {
    await signIn(page);
    await page.click("#adminWorkbenchButton");
    await unlock(page);

    await page.click("#adminLock");
    await expect(page.locator("#adminGate")).toBeVisible();
    await expect(page.locator("#adminPanel")).toBeHidden();
    await expect(page.locator("#adminKeys tr")).toHaveCount(0);
  });

  test("no key this suite created is left behind", async ({ request }) => {
    // Last in the file, so it runs after the lifecycle test: it sweeps
    // what an earlier broken run left in the target's key table.
    await sweep(request);
    const leftovers = (await healthKeys(request)).filter((key) =>
      (key.accountId ?? "").startsWith(SWEEP_PREFIX)
    );
    expect(leftovers).toEqual([]);
  });
});
