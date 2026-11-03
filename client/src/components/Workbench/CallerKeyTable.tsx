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
  /** Ids of rows whose rotate request is in flight; those rows wait. */
  pendingRotateIds?: number[];
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
  pendingRotateIds = [],
}: CallerKeyTableProps) {
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
            {onRotate ? <th className="p-3 font-medium">Actions</th> : null}
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
                <span
                  className={`chip ${key.enabled ? "chip-ok" : "chip-off"}`}
                >
                  {key.enabled ? "Enabled" : "Disabled"}
                </span>
              </td>
              {onRotate ? (
                <td className="p-3">
                  <button
                    id={`adminCallerKeyRotate-${key.id}`}
                    type="button"
                    className="btn btn-secondary text-xs py-1 px-3"
                    disabled={pendingRotateIds.includes(key.id)}
                    onClick={() => onRotate(key)}
                  >
                    {pendingRotateIds.includes(key.id) ? "Rotating…" : "Rotate"}
                  </button>
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
