import { useState, type FormEvent } from "react";
import { useAuth } from "../../app/auth";

/**
 * The API-key prompt. Shown whenever the tab holds no bearer key, which
 * is what the legacy page did: the modal is visible on a first visit, and
 * a key that the server does not require still signs the operator in.
 */
export function LoginDialog() {
  const { login, endedReason } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(apiKey);
      setApiKey("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  // A refused attempt is the most recent word, but a session that ended
  // on its own still has to be explained: the operator was sent back
  // here, and the prompt is where they land.
  const message = error ?? endedReason;

  return (
    <div
      id="loginModal"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <form className="card p-8 max-w-md w-full mx-4" onSubmit={submit}>
        <h2 className="text-2xl font-bold mb-4 flex items-center">
          <i className="fa-solid fa-lock mr-2 text-primary" />
          Login Required
        </h2>
        <p className="text-sm mb-4 opacity-75">
          Enter your API key to access the image generator.
        </p>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1"
            >
              Password / API Key
            </label>
            <input
              type="password"
              id="password"
              className="w-full"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
          <div
            id="loginError"
            className={`text-sm text-red-500${message ? "" : " hidden"}`}
            role="alert"
          >
            {message ?? ""}
          </div>
          <button
            id="loginButton"
            type="submit"
            className="btn btn-primary w-full py-3"
            disabled={busy}
          >
            <i
              className={`fa-solid ${
                busy ? "fa-spinner fa-spin" : "fa-sign-in-alt"
              } mr-2`}
            />
            {busy ? "Logging in..." : "Login"}
          </button>
        </div>
      </form>
    </div>
  );
}
