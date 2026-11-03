import { useEffect, useState } from "react";

export interface CallerKeyCreateValues {
  name: string;
  secret: string;
}

export interface CallerKeyCreateProps {
  /** A create request is in flight; the form waits for its own answer. */
  busy: boolean;
  /**
   * The key the server just created, with its one-shot plaintext. Null
   * hides the banner. The parent owns this state so locking the panel
   * tears the secret down with it — the component only displays it.
   */
  created: { name: string; secret: string } | null;
  /** Hides the one-shot banner. The secret is gone from the client. */
  onDismiss: () => void;
  /**
   * Performs the create. Resolves only on success — a failed request
   * throws, and this component shows the failure inline; the fields stay
   * filled so the operator can fix what the server named.
   */
  onSubmit: (values: CallerKeyCreateValues) => Promise<void>;
}

/**
 * The add-key form and the one-shot secret banner (#126).
 *
 * The form is deliberately plain: a name the operator can leave blank,
 * and an optional secret they can bring. Whatever they leave blank, the
 * server fills — a generated name ("Key N") or a generated secret
 * ("sk-mgmt-…"). The secret field is a password field with the eye toggle
 * and 1Password opted out, because an operator-supplied secret is a
 * credential like any other.
 *
 * The banner is the one moment the plaintext exists in the client. It is
 * shown once, above the form, until the operator dismisses it or the
 * panel locks — it is never persisted, and no reveal exists to bring it
 * back: the row holds a verifier, so a lost secret means rotate.
 */
export function CallerKeyCreate({
  busy,
  created,
  onDismiss,
  onSubmit,
}: CallerKeyCreateProps) {
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // A new creation replaces the banner's story: the copy button resets,
  // and the previous secret is gone for good — this state is the only
  // place it ever lived.
  useEffect(() => {
    setCopied(false);
  }, [created]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    try {
      await onSubmit({ name, secret });
      // Success: the answer is in the banner now. The fields clear —
      // including the secret, which must not linger in an input's value.
      setName("");
      setSecret("");
      setVisible(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      id="callerKeyCreateSection"
      className="card p-6"
      aria-label="Add API key"
    >
      {created ? (
        <div
          id="callerKeyCreated"
          role="status"
          className="p-4 mb-4 rounded border border-green-700 bg-green-900/20"
        >
          <p className="text-sm font-medium text-green-300">
            “{created.name}” created. Copy the secret now — it is shown once and
            never again.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <code id="callerKeySecret" className="font-mono text-sm break-all">
              {created.secret}
            </code>
            <button
              id="callerKeyCopyBtn"
              type="button"
              className="btn btn-secondary text-xs py-1 px-3"
              aria-label="Copy secret"
              onClick={copy}
            >
              <i className="fa-solid fa-copy mr-1" />
              {copied ? "Copied." : "Copy"}
            </button>
            <button
              id="callerKeyDismissBtn"
              type="button"
              className="btn btn-secondary text-xs py-1 px-3"
              aria-label="Hide the secret"
              onClick={onDismiss}
            >
              Hide
            </button>
          </div>
          <p className="text-xs opacity-60 mt-2">
            Stored only as a one-way verifier. If it is lost, rotate the key.
          </p>
        </div>
      ) : null}

      <h2 id="callerKeyCreateTitle" className="text-lg font-bold mb-1">
        Add key
      </h2>
      <p id="callerKeyCreateHint" className="text-sm opacity-60 mb-4">
        Both fields are optional: a blank name gets “Key N”, a blank secret gets
        one generated for you. The plaintext is shown once, above, the moment
        the key is created.
      </p>

      <form onSubmit={submit} className="space-y-3" aria-label="Add API key">
        <div>
          <label
            htmlFor="callerKeyAddName"
            className="block text-sm font-medium mb-1"
          >
            Name
          </label>
          <input
            id="callerKeyAddName"
            type="text"
            className="w-full text-sm p-2 rounded bg-gray-800 border border-gray-700 focus:border-primary focus:outline-none"
            value={name}
            maxLength={120}
            autoComplete="off"
            placeholder="e.g. Laptop, CI"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="callerKeyAddSecret"
            className="block text-sm font-medium mb-1"
          >
            Your own secret{" "}
            <span className="opacity-60 font-normal">
              (optional — blank generates one)
            </span>
          </label>
          <div className="flex gap-2">
            <input
              id="callerKeyAddSecret"
              type={visible ? "text" : "password"}
              className="w-full text-sm p-2 rounded bg-gray-800 border border-gray-700 focus:border-primary focus:outline-none font-mono"
              value={secret}
              maxLength={256}
              autoComplete="new-password"
              data-1p-ignore
              placeholder="8–256 printable characters, no spaces"
              onChange={(event) => setSecret(event.target.value)}
            />
            <button
              id="callerKeyAddEye"
              type="button"
              className="btn btn-secondary p-2"
              aria-label={visible ? "Hide secret" : "Show secret"}
              aria-pressed={visible}
              onClick={() => setVisible((current) => !current)}
            >
              <i
                className={
                  visible ? "fa-solid fa-eye-slash" : "fa-solid fa-eye"
                }
              />
            </button>
          </div>
        </div>

        {error ? (
          <p
            id="callerKeyAddError"
            role="alert"
            className="text-sm text-red-500"
          >
            {error}
          </p>
        ) : null}

        <button
          id="callerKeyAddSubmit"
          type="submit"
          className="btn btn-primary text-sm py-1.5 px-4"
          disabled={busy}
        >
          <i className="fa-solid fa-plus mr-1" />
          {busy ? "Adding…" : "Add key"}
        </button>
      </form>
    </section>
  );
}
