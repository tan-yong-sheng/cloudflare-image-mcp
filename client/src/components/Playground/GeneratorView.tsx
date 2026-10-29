import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../api/client";
import { useModels } from "../../api/models";
import type { GenerationResponse } from "../../api/types";
import { useAuth, SESSION_EXPIRED_MESSAGE } from "../../app/auth";
import { useCredentialsConfigured } from "../../app/credentials";
import {
  AdminWorkbenchButton,
  LogoutButton,
  ThemeToggleButton,
} from "../AppHeader";
import { AdvancedOptions } from "./AdvancedOptions";
import { ModelPicker } from "./ModelPicker";
import { ResultPanel, type MissingSlot } from "./ResultPanel";
import {
  buildGenerationBody,
  deriveModelControls,
  type ModelOverrides,
} from "./model-controls";

/** The inference budget, matching the legacy page's abort timer. */
const GENERATION_TIMEOUT_MS = 120_000;

/** The server said the bearer key is no longer accepted. */
class SessionExpired extends Error {
  constructor() {
    super(SESSION_EXPIRED_MESSAGE);
    this.name = "SessionExpired";
  }
}

/**
 * What a request came back with.
 *
 * A batch that stops early answers with a 4xx or 5xx yet still carries the
 * images it did produce, so "failed" is not the absence of images. The
 * status decides `ok`; `images` is whatever arrived either way.
 */
type GenerationOutcome =
  | { ok: true; images: string[] }
  | { ok: false; images: string[]; message: string };

/** The server's own message, or the ADR-001 missing-credential wording. */
function describeFailure(message: string): string {
  return !message || message === "null" || message === "undefined"
    ? "Image generation failed. Please check your API credentials in the admin panel."
    : "Error: " + message;
}

export function GeneratorView() {
  const { token, logout } = useAuth();
  const models = useModels();
  const credentialsConfigured = useCredentialsConfigured();

  const [chosenModelId, setChosenModelId] = useState("");
  const [prompt, setPrompt] = useState("cyberpunk cat");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [overrides, setOverrides] = useState<ModelOverrides>({});
  const [seed, setSeed] = useState("");
  const [count, setCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    images: string[];
    missing: MissingSlot[];
    model: string;
    elapsed: string;
  } | null>(null);
  const [pending, setPending] = useState<{
    images: string[];
    missing: MissingSlot[];
    model: string;
  } | null>(null);
  // The request a retry replays, kept whole so the retry sends the same
  // prompt, model and seed the failed batch was asked for.
  const lastRequest = useRef<{
    body: Record<string, unknown>;
    modelId: string;
  } | null>(null);
  const [generationId, setGenerationId] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // When the current generation started, so the elapsed time is measured
  // to the moment the image is on screen.
  const startedAt = useRef(0);

  // A new session starts with a clean slate: an error that belonged to
  // the previous session is not an error of this one. The message stays
  // while the session is over, because it is the only thing that says
  // why the operator is back at the sign-in prompt.
  const sessionToken = useRef(token);
  useEffect(() => {
    if (sessionToken.current === token) return;
    sessionToken.current = token;
    if (token) setError(null);
  }, [token]);

  // Only the models the operator can actually call: the task types the
  // playground supports, and the ones whose provider has a servable key.
  //
  // A failed refetch yields an empty list, not the last good one: those
  // options may no longer be servable, and offering one is how a
  // blank-picker state ends up submitting anyway. The operator's
  // choice is kept for the next successful load.
  const selectable = useMemo(
    () =>
      models.isError
        ? []
        : (models.data ?? []).filter(
            (model) =>
              model.taskTypes.includes("text-to-image") &&
              model.available === true
          ),
    [models.data, models.isError]
  );

  // The operator's choice survives a refetch; it only moves if the model
  // is gone from the list.
  const modelId = selectable.some((model) => model.id === chosenModelId)
    ? chosenModelId
    : (selectable[0]?.id ?? "");
  const model = selectable.find((entry) => entry.id === modelId) ?? null;
  const controls = deriveModelControls(model, overrides);

  const generate = useMutation({
    mutationFn: async (
      body: Record<string, unknown>
    ): Promise<GenerationOutcome> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
      try {
        const response = await apiFetch<GenerationResponse>(
          "/v1/images/generations",
          {
            method: "POST",
            body,
            authToken: token,
            signal: controller.signal,
          }
        );
        if (response.status === 401) throw new SessionExpired();
        const payload = response.data;
        const images = (payload?.data ?? [])
          .map((image) =>
            image.b64_json
              ? "data:image/png;base64," + image.b64_json
              : (image.url ?? "")
          )
          .filter((url) => url.length > 0);
        if (response.ok && images.length > 0) return { ok: true, images };
        if (response.ok) {
          // A 2xx with nothing usable is still a failure, and there is no
          // error envelope to read a message from.
          return { ok: false, images, message: "Generation failed" };
        }
        const message =
          typeof payload?.error?.message === "string"
            ? payload.error.message
            : "";
        return { ok: false, images, message };
      } finally {
        clearTimeout(timer);
      }
    },
  });

  const images = pending?.images ?? result?.images ?? [];
  const missing = pending?.missing ?? result?.missing ?? [];
  const loading = generate.isPending || pending !== null;

  const run = async (body: Record<string, unknown>, requestModelId: string) => {
    if (generate.isPending) return;
    setError(null);
    // A new request supersedes any generation still waiting for its image
    // to load. Leaving that state behind would let the old image commit
    // over this one's result and keep the panel loading forever.
    setPending(null);
    startedAt.current = Date.now();
    lastRequest.current = { body, modelId: requestModelId };
    const requested = typeof body.n === "number" && body.n > 0 ? body.n : 1;
    try {
      const outcome = await generate.mutateAsync(body);
      // The Worker stops a batch at the first failure, so a short answer is
      // exactly one refused slot followed by the slots it never sent.
      const gaps: MissingSlot[] = outcome.ok
        ? []
        : [
            { kind: "failed" },
            ...Array.from(
              { length: Math.max(0, requested - outcome.images.length - 1) },
              (): MissingSlot => ({ kind: "notAttempted" })
            ),
          ];
      if (!outcome.ok) setError(describeFailure(outcome.message));
      setActiveIndex(0);
      if (outcome.images.length === 0) {
        // No image will fire `load`, so the placeholders are committed here
        // instead of leaving the panel waiting for an image that never came.
        setResult({
          images: [],
          missing: gaps,
          model: requestModelId,
          elapsed: ((Date.now() - startedAt.current) / 1000).toFixed(1) + "s",
        });
        return;
      }
      setGenerationId((prev) => prev + 1);
      setPending({
        images: outcome.images,
        missing: gaps,
        model: requestModelId,
      });
    } catch (cause) {
      if (cause instanceof SessionExpired) {
        logout(SESSION_EXPIRED_MESSAGE);
        setError(cause.message);
        return;
      }
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setError("Error: generation timed out after 120s — please retry");
        return;
      }
      setError(
        describeFailure(cause instanceof Error ? cause.message : String(cause))
      );
    }
  };

  const submit = () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }
    if (!modelId) {
      setError("Models are still loading — please wait");
      return;
    }
    void run(
      buildGenerationBody(
        {
          modelId,
          prompt,
          negativePrompt,
          size: controls.size,
          steps: controls.steps.value,
          guidance: controls.guidance.value,
          seed,
          count,
        },
        model
      ),
      modelId
    );
  };

  const retry = () => {
    const request = lastRequest.current;
    if (!request) return;
    void run(request.body, request.modelId);
  };

  const commitResult = () => {
    if (!pending) return;
    setResult({
      images: pending.images,
      missing: pending.missing,
      model: pending.model,
      elapsed: ((Date.now() - startedAt.current) / 1000).toFixed(1) + "s",
    });
    setPending(null);
  };

  const failResult = () => {
    // The prior result stays on screen: the failed image never replaces
    // it, so the operator still has the last good one.
    setPending(null);
    setError("Could not load the generated image (expired or blocked URL)");
  };

  return (
    <main
      id="generatorView"
      className="container mx-auto px-4 py-4 max-w-6xl"
      role="main"
      aria-labelledby="generatorViewTitle"
    >
      <div className="flex items-center justify-between mb-6">
        <h1
          id="generatorViewTitle"
          className="text-2xl md:text-3xl font-bold flex items-center"
        >
          <i className="fa-solid fa-image mr-2" />
          AI Image Generator
        </h1>
        <div className="flex items-center space-x-2">
          <AdminWorkbenchButton />
          <LogoutButton id="logoutButton" />
          <ThemeToggleButton id="themeToggle" />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 mobile-flex-col">
        <div className="w-full lg:w-2/5 space-y-4">
          <div className="card p-4 space-y-4 fade-in">
            <h2 className="text-lg font-semibold flex items-center">
              <i className="fa-solid fa-sliders mr-2 text-primary" />
              Settings
            </h2>

            <ModelPicker
              modelId={modelId}
              models={selectable}
              status={
                models.isError
                  ? "error"
                  : models.isPending
                    ? "loading"
                    : "ready"
              }
              disabled={!credentialsConfigured || selectable.length === 0}
              unavailableReason={
                !credentialsConfigured
                  ? "No API keys configured"
                  : "No model available for the configured keys"
              }
              error={
                models.isError
                  ? "Could not load models: " +
                    (models.error instanceof Error
                      ? models.error.message
                      : String(models.error))
                  : null
              }
              onChange={setChosenModelId}
            />

            <div>
              <label
                htmlFor="prompt"
                className="block text-sm font-medium mb-1"
              >
                <i className="fa-solid fa-wand-magic-sparkles mr-1" />
                Prompt
              </label>
              <textarea
                id="prompt"
                rows={3}
                placeholder="Describe your image... Use --param=value for additional settings"
                className="w-full"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>

            {controls.showNegativePrompt ? (
              <div id="negativePromptWrap">
                <label
                  htmlFor="negative_prompt"
                  className="block text-sm font-medium mb-1"
                >
                  <i className="fa-solid fa-ban mr-1" />
                  Negative Prompt
                </label>
                <textarea
                  id="negative_prompt"
                  rows={2}
                  placeholder="Elements to avoid..."
                  className="w-full"
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                />
              </div>
            ) : null}
          </div>

          <AdvancedOptions
            open={advancedOpen}
            onToggle={() => setAdvancedOpen((open) => !open)}
            controls={controls}
            onSizeChange={(size) =>
              setOverrides((current) => ({
                ...current,
                [modelId]: { ...current[modelId], size },
              }))
            }
            onStepsChange={(steps) =>
              setOverrides((current) => ({
                ...current,
                [modelId]: { ...current[modelId], steps },
              }))
            }
            onGuidanceChange={(guidance) =>
              setOverrides((current) => ({
                ...current,
                [modelId]: { ...current[modelId], guidance },
              }))
            }
            seed={seed}
            onSeedChange={setSeed}
            count={count}
            onCountChange={setCount}
          />

          <p
            id="noKeysWarning"
            className={`text-sm p-3 mb-3 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-700${
              credentialsConfigured ? " hidden" : ""
            }`}
            role="alert"
          >
            <i className="fa-solid fa-triangle-exclamation mr-2" />
            No API keys configured.{" "}
            <a href="#admin" className="underline hover:text-yellow-200">
              Set up credentials
            </a>{" "}
            in the admin panel first.
          </p>

          <button
            id="submitButton"
            type="button"
            className="btn btn-primary w-full py-3 flex items-center justify-center"
            // A generation in flight keeps Submit disabled, so a second
            // click cannot start a second request for the same prompt.
            disabled={
              generate.isPending ||
              !credentialsConfigured ||
              selectable.length === 0
            }
            title={credentialsConfigured ? undefined : "No API keys configured"}
            onClick={submit}
          >
            <i className="fa-solid fa-wand-magic-sparkles mr-2" />
            Generate Image
          </button>
        </div>

        <div className="w-full lg:w-3/5">
          <ResultPanel
            generationId={generationId}
            images={images}
            missing={missing}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            loading={loading}
            showInitial={!result && !pending && !generate.isPending}
            error={error}
            usedModel={loading ? "…" : (result?.model ?? "-")}
            generationTime={loading ? "…" : (result?.elapsed ?? "-")}
            canDownload={!!result && result.images.length > 0}
            onImageLoad={commitResult}
            onImageError={failResult}
            onRetry={
              missing.length > 0 && !generate.isPending ? retry : undefined
            }
          />
        </div>
      </div>
    </main>
  );
}
