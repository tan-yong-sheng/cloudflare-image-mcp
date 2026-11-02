import { useState } from "react";
import type { AdminCallerKey } from "../../api/types";

interface CallerKeyTableProps {
  keys: AdminCallerKey[];
  /** Whether the list is still in flight. */
  loading: boolean;
  /**
   * Whether the list could not be read.
   *
   * A failed read is not an empty list. Without this the table would say
   * "No API keys yet." about a request that never came back — a claim
   * the server never made. The panel's alert line carries the reason;
   * this only says that the list is unknown.
   */
  failed?: boolean;
  /**
   * Opens the rotate confirmation for the key (#127). The request is the
   * page's to send — the table only names the row the button is on.
   */
  onRotate?: (key: AdminCallerKey) => void;
  /** Flips the key's enabled state (#128); the switch shows the ask. */
  onToggle?: (key: AdminCallerKey, enabled: boolean) => void;
  /**
   * Saves an inline rename (#128). Resolves only on success — a rejected
   * rename keeps the input open with the server's reason on the panel.
   */
  onRenameSubmit?: (key: AdminCallerKey, name: string) => Promise<void>;
  /** Opens the delete confirmation for the key (#128). */
  onDelete?: (key: AdminCallerKey) => void;
  /**
   * Ids of rows with a request in flight. A busy row's controls wait for
   * the server's answer, so no key can be acted on twice at once.
   */
  pendingIds?: number[];
}

/**
 * The caller-key list.
 *
 * These are the keys a client presents to reach this Worker — the
 * bearer tokens for /v1 and /mcp. The UI calls them API keys, which is
 * what the operator knows them as; the code, the table and the HTTP
 * route keep the domain term *caller key*, so they are not confused with
 * the management key or with provider credentials.
 *
 * The server sends the masked hint and never the secret, so there is
 * nothing here that could be used as a key. That is why the column shows
 * a hint and not a value the operator could copy.
 *
 * The enabled state is shown as a chip rather than a switch: flipping a
 * key is a write, and until the write path lands a switch would be a
 * control that looks live and is not. A parked key's row reads muted, so
 * it is visible at a glance — muted by colour rather than by fading the
 * whole row, because a faded row takes the text below the contrast bar
 * with it.
 */
export function CallerKeyTable({
  keys,
  loading,
  failed = false,
  onRotate,
  onToggle,
  onRenameSubmit,
  onDelete,
  pendingIds = [],
}: CallerKeyTableProps) {
  // Inline rename state: which row is being renamed, and what the field
  // holds. Local to the table — the page only receives the submit.
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const hasMutations = Boolean(onToggle || onRenameSubmit || onDelete);
  // A failed refresh leaves the last good rows on screen (TanStack Query
  // keeps the data), so the failure is a statement about those rows, not
  // about the table being empty: the rows are stale, and the panel's
  // alert carries the reason.
  const failureText = failed
    ? keys.length > 0
      ? "Could not refresh API keys."
      : "Could not load API keys."
    : null;

  return (
    <section
      id="adminCallerKeysSection"
      className="card p-6"
      aria-label="API keys"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left opacity-60 border-b border-gray-800">
            <th id="adminCallerKeysHead" className="p-3 font-medium">
              Name
            </th>
            <th className="p-3 font-medium">Masked key</th>
            <th className="p-3 font-medium">Status</th>
            {hasMutations || onRotate ? (
              <th className="p-3 font-medium">Actions</th>
            ) : null}
          </tr>
        </thead>
        <tbody id="adminCallerKeys">
          {keys.map((key) => (
            <tr
              key={key.id}
              data-testid={`admin-caller-key-${key.id}`}
              className={key.enabled ? "" : "row-muted"}
            >
              <td className="p-3">{key.name}</td>
              <td className="p-3 font-mono text-sm">{key.maskedKey}</td>
              <td className="p-3">
                {onToggle ? (
                  <button
                    id={`adminCallerKeySwitch-${key.id}`}
                    type="button"
                    role="switch"
                    aria-checked={key.enabled}
                    aria-label={
                      (key.enabled ? "Disable " : "Enable ") + key.name
                    }
                    disabled={pendingIds.includes(key.id)}
                    onClick={() => onToggle(key, !key.enabled)}
                  />
                ) : null}{" "}
                <span
                  className={`chip ${key.enabled ? "chip-ok" : "chip-off"}`}
                >
                  {key.enabled ? "Enabled" : "Disabled"}
                </span>
              </td>
              {hasMutations || onRotate ? (
                <td className="p-3">
                  {onRenameSubmit && renamingId === key.id ? (
                    <>
                      <input
                        id={`adminCallerKeyRenameInput-${key.id}`}
                        type="text"
                        className="text-sm p-1 rounded bg-gray-800 border border-gray-700 focus:border-primary focus:outline-none"
                        value={renameValue}
                        maxLength={120}
                        aria-label={`New name for ${key.name}`}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setRenamingId(null);
                        }}
                      />
                      <div className="flex gap-1 mt-1">
                        <button
                          id={`adminCallerKeyRenameSave-${key.id}`}
                          type="button"
                          className="btn btn-primary text-xs py-1 px-3"
                          disabled={renaming || pendingIds.includes(key.id)}
                          onClick={async () => {
                            setRenaming(true);
                            try {
                              await onRenameSubmit(key, renameValue);
                              setRenamingId(null);
                            } finally {
                              setRenaming(false);
                            }
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary text-xs py-1 px-3"
                          disabled={renaming}
                          onClick={() => setRenamingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <span className="inline-flex gap-1 items-center">
                      {onRotate ? (
                        <button
                          id={`adminCallerKeyRotate-${key.id}`}
                          type="button"
                          className="btn btn-secondary text-xs py-1 px-3"
                          disabled={pendingIds.includes(key.id)}
                          onClick={() => onRotate(key)}
                        >
                          Rotate
                        </button>
                      ) : null}
                      {onRenameSubmit ? (
                        <button
                          id={`adminCallerKeyRename-${key.id}`}
                          type="button"
                          className="btn btn-secondary text-xs py-1 px-3"
                          disabled={pendingIds.includes(key.id)}
                          onClick={() => {
                            setRenamingId(key.id);
                            setRenameValue(key.name);
                          }}
                        >
                          Rename
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button
                          id={`adminCallerKeyDelete-${key.id}`}
                          type="button"
                          className="btn btn-danger text-xs py-1 px-3"
                          disabled={pendingIds.includes(key.id)}
                          onClick={() => onDelete(key)}
                        >
                          Delete
                        </button>
                      ) : null}
                      {pendingIds.includes(key.id) ? (
                        <span className="text-xs opacity-60">Working…</span>
                      ) : null}
                    </span>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      <p
        id="adminCallerKeysEmpty"
        className={`text-sm opacity-60 text-center py-10${
          keys.length > 0 && !failureText ? " hidden" : ""
        }`}
      >
        {failureText ?? (loading ? "Loading API keys…" : "No API keys yet.")}
      </p>
    </section>
  );
}
