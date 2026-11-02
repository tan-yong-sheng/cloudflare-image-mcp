import { useState, type CSSProperties } from "react";
import { keyTestScope, type KeyTestScope } from "../../api/admin";
import { useModels } from "../../api/models";
import type {
  AdminKey,
  KeyTestResult,
  KeyTestRun,
  ModelConfig,
  RunKeyTestRequest,
} from "../../api/types";

export interface LiveTestCardProps {
  /** The provider keys from the health payload; labels stay masked. */
  keys: AdminKey[];
  /** Whether the run request is in flight. */
  running: boolean;
  /** The message of the run's failed request, when the request failed. */
  error: string | null;
  /** The most recent run: the scope it used and its per-pairing results. */
  lastRun: KeyTestRun | null;
  /** Starts a run with the scoped body the card builds. */
  onRun: (request: RunKeyTestRequest) => void;
}

function scopeChipClass(active: boolean): string {
  return `chip ${active ? "text-white" : "text-muted"}`;
}

function scopeChipStyle(active: boolean): CSSProperties | undefined {
  return active
    ? { backgroundColor: "var(--primary)", borderColor: "var(--primary)" }
    : undefined;
}

/**
 * Card 2 of the operations rail: a two-scope live provider probe.
 *
 * One side of every run is a concrete single selection and the other is
 * the wildcard, so the all-keys × all-models body the endpoint refuses
 * cannot be built here — the scope buttons pick which side is concrete,
 * and the run trigger stays dead until that side is chosen.
 */
export function LiveTestCard({
  keys,
  running,
  error,
  lastRun,
  onRun,
}: LiveTestCardProps) {
  const registry = useModels();
  const models = registry.data ?? [];
  const [scope, setScope] = useState<KeyTestScope>("key");
  const [keyId, setKeyId] = useState("");
  const [modelId, setModelId] = useState("");

  // The concrete side must be chosen before a run can fire; the wildcard
  // side is supplied by the scope itself.
  const ready = scope === "key" ? keyId !== "" : modelId !== "";

  const run = () => {
    if (scope === "key" && keyId !== "") {
      onRun({ keyIds: [Number(keyId)], modelIds: ["*"] });
      return;
    }
    if (scope === "model" && modelId !== "") {
      onRun({ keyIds: ["*"], modelIds: [modelId] });
    }
  };

  const labelFor = (row: KeyTestResult): string => {
    if (!lastRun || keyTestScope(lastRun.request) === "model") {
      const key = keys.find((entry) => entry.id === row.keyId);
      return key
        ? `${key.label} (${key.maskedKey ?? `#${key.id}`})`
        : `key #${row.keyId}`;
    }
    const model = models.find((entry) => entry.id === row.modelId);
    return model?.name ?? row.modelId;
  };

  // A 200 whose body is not the pinned shape is a broken answer, not a
  // crash: the strip renders what arrived, nothing if nothing did.
  const runResults = lastRun?.results ?? [];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          id="adminOpsScopeKey"
          className={scopeChipClass(scope === "key")}
          style={scopeChipStyle(scope === "key")}
          aria-pressed={scope === "key"}
          title="Probe every exposed model with one key"
          onClick={() => setScope("key")}
        >
          1 key → all models
        </button>
        <button
          type="button"
          id="adminOpsScopeModel"
          className={scopeChipClass(scope === "model")}
          style={scopeChipStyle(scope === "model")}
          aria-pressed={scope === "model"}
          title="Probe one model with every key"
          onClick={() => setScope("model")}
        >
          all keys → 1 model
        </button>
      </div>
      <div className="mt-3 space-y-2">
        <select
          id="adminOpsTestKeySelect"
          aria-label="Key to test"
          className="w-full text-sm"
          value={keyId}
          disabled={scope !== "key" || running}
          onChange={(event) => setKeyId(event.target.value)}
        >
          <option value="">Select a key…</option>
          {keys.map((key) => (
            <option key={key.id} value={String(key.id)}>
              {key.label} ({key.maskedKey ?? `#${key.id}`})
            </option>
          ))}
        </select>
        <select
          id="adminOpsTestModelSelect"
          aria-label="Model to test"
          className="w-full text-sm"
          value={modelId}
          disabled={scope !== "model" || running}
          onChange={(event) => setModelId(event.target.value)}
        >
          <option value="">Select a model…</option>
          {models.map((model: ModelConfig) => (
            // The id, not the display name: several families can serve
            // models that share a name, and the probe targets one entry.
            <option key={model.id} value={model.id}>
              {model.id}
            </option>
          ))}
        </select>
        <button
          type="button"
          id="adminOpsTestRun"
          className="btn btn-primary text-sm w-full"
          disabled={!ready || running}
          onClick={run}
        >
          {running ? "Testing…" : "Run test"}
        </button>
      </div>
      <p
        id="adminOpsTestWarning"
        className="alert-warning text-xs p-2 mt-3 rounded"
      >
        All-keys × all-models is never offered: one accidental run could burn
        every key's provider quota at once. Each scope fires the minimum calls —
        N models or N keys, never N×M.
      </p>
      {error ? (
        <p
          id="adminOpsTestError"
          role="alert"
          className="text-xs p-2 mt-3 rounded bg-red-900/30 text-red-300 border border-red-700"
        >
          {error}
        </p>
      ) : null}
      {lastRun ? (
        <div id="adminOpsTestResults" className="mt-3">
          <ul className="space-y-1">
            {runResults.map((row) => (
              <li
                key={`${row.keyId}-${row.modelId}`}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">{labelFor(row)}</span>
                {row.ok ? (
                  <span
                    className="font-mono whitespace-nowrap"
                    style={{ color: "var(--success)" }}
                  >
                    {row.ms} ms
                  </span>
                ) : (
                  <span
                    className="font-mono truncate"
                    title={row.error}
                    style={{ color: "var(--error)" }}
                  >
                    {row.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
