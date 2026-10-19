import { useState, type FormEvent } from "react";

interface UnlockGateProps {
  /** The error the server answered with, if any. */
  error: string | null;
  /** Whether the gate is hidden, because the panel is unlocked. */
  hidden?: boolean;
  onUnlock: (managementKey: string) => void;
}

/**
 * The management-key gate.
 *
 * Nothing behind the gate is requested before the operator unlocks: the
 * panel asks for nothing, so an unauthorized operator cannot inspect
 * credential status by watching the network.
 */
export function UnlockGate({ error, hidden, onUnlock }: UnlockGateProps) {
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      setLocalError("Enter the management key.");
      return;
    }
    setLocalError(null);
    onUnlock(value.trim());
  };

  return (
    <div
      id="adminGate"
      className={`max-w-md mx-auto my-12${hidden ? " hidden" : ""}`}
    >
      <form className="card p-6 space-y-4" onSubmit={submit}>
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-2">
            <i className="fa-solid fa-shield-halved text-xl" />
          </div>
          <h2 className="text-lg font-bold">Unlock Provider Administration</h2>
          <p className="text-xs opacity-60">
            Enter your management key to inspect and configure provider
            credentials.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="adminKey" className="block text-xs font-medium">
            Management key
          </label>
          <input
            type="password"
            id="adminKey"
            className="w-full"
            placeholder="Management key (never stored)"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <p
            id="adminError"
            className={`text-xs text-red-500${
              localError || error ? "" : " hidden"
            }`}
            role="alert"
          >
            {localError ?? error}
          </p>
        </div>
        <button
          id="adminUnlock"
          type="submit"
          className="btn btn-primary w-full py-2 flex items-center justify-center"
        >
          <i className="fa-solid fa-unlock mr-2" />
          Unlock
        </button>
      </form>
    </div>
  );
}
