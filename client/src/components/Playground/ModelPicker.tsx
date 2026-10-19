import type { ModelConfig } from "../../api/types";

interface ModelPickerProps {
  modelId: string;
  models: ModelConfig[];
  /** "loading" while the registry is in flight, "error" when it failed. */
  status: "loading" | "error" | "ready";
  disabled: boolean;
  error: string | null;
  onChange: (modelId: string) => void;
}

/**
 * The model picker.
 *
 * The options are the models the operator can actually call: the
 * registry already marks each one with the availability the dispatcher
 * uses, so an unservable model is never offered.
 */
export function ModelPicker({
  modelId,
  models,
  status,
  disabled,
  error,
  onChange,
}: ModelPickerProps) {
  return (
    <div>
      <label htmlFor="model" className="block text-sm font-medium mb-1">
        <i className="fa-solid fa-robot mr-1" />
        Model
      </label>
      <select
        id="model"
        className={`w-full${disabled ? " opacity-60" : ""}`}
        value={modelId}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {status === "loading" ? (
          <option value="">Loading models…</option>
        ) : null}
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.id}
          </option>
        ))}
      </select>
      <p
        id="modelError"
        className={`text-sm text-red-500${error ? "" : " hidden"}`}
        role="alert"
      >
        {error}
      </p>
    </div>
  );
}
