import { useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { apiFetch } from "../../api/client";
import { useModels } from "../../api/models";
import type { GenerationResponse } from "../../api/types";
import { useAuth } from "../../app/auth";
import { useCredentialsConfigured } from "../../app/credentials";
import {
  AdminWorkbenchButton,
  LogoutButton,
  ThemeToggleButton,
} from "../AppHeader";
import { AdvancedOptions } from "./AdvancedOptions";
import { ModelPicker } from "./ModelPicker";
import { ResultPanel } from "./ResultPanel";
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
    super("Session expired. Please login again.");
    this.name = "SessionExpired";
  }
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
    model: string;
    elapsed: string;
  } | null>(null);
  const [pendingImages, setPendingImages] = useState<string[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // When the current generation started, so the elapsed time is measured
  // to the moment the image is on screen.
  const startedAt = useRef(0);

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
    mutationFn: async (body: Record<string, unknown>) => {
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
        if (!response.ok) {
          if (response.status === 401) throw new SessionExpired();
          const envelope = (
            response.data as { error?: { message?: unknown } } | null
          )?.error;
          const message =
            typeof envelope?.message === "string" ? envelope.message : "";
          throw new Error(message || "Generation failed");
        }
        return response.data as GenerationResponse;
      } finally {
        clearTimeout(timer);
      }
    },
  });

  const images = pendingImages ?? result?.images ?? [];
  const loading = generate.isPending || pendingImages !== null;

  const submit = async () => {
    if (generate.isPending) return;
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }
    if (!modelId) {
      setError("Models are still loading — please wait");
      return;
    }

    setError(null);
    startedAt.current = Date.now();
    try {
      const data = await generate.mutateAsync(
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
        )
      );
      const produced = (data?.data ?? [])
        .map((image) =>
          image.b64_json
            ? "data:image/png;base64," + image.b64_json
            : (image.url ?? "")
        )
        .filter((url) => url.length > 0);
      if (produced.length === 0) {
        setError("Error: Generation failed");
        return;
      }
      setActiveIndex(0);
      setPendingImages(produced);
    } catch (cause) {
      if (cause instanceof SessionExpired) {
        logout();
        setError(cause.message);
        return;
      }
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setError("Error: generation timed out after 120s — please retry");
        return;
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      // A provider that answers with nothing useful is the ADR-001
      // missing-credential case; say that rather than echoing it.
      setError(
        !message || message === "null" || message === "undefined"
          ? "Image generation failed. Please check your API credentials in the admin panel."
          : "Error: " + message
      );
    }
  };

  const commitResult = () => {
    if (!pendingImages) return;
    setResult({
      images: pendingImages,
      model: modelId,
      elapsed: ((Date.now() - startedAt.current) / 1000).toFixed(1) + "s",
    });
    setPendingImages(null);
  };

  const failResult = () => {
    // The prior result stays on screen: the failed image never replaces
    // it, so the operator still has the last good one.
    setPendingImages(null);
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
            images={images}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            loading={loading}
            showInitial={!result && !pendingImages && !generate.isPending}
            error={error}
            usedModel={loading ? "…" : (result?.model ?? "-")}
            generationTime={loading ? "…" : (result?.elapsed ?? "-")}
            canDownload={!!result}
            onImageLoad={commitResult}
            onImageError={failResult}
          />
        </div>
      </div>
    </main>
  );
}
