import type { AdminCallerKey } from "../../api/types";

interface CallerKeyTableProps {
  keys: AdminCallerKey[];
  /** Whether the list is still in flight. */
  loading: boolean;
  /**
   * Whether the list could not be read.
   *
   * A failed read is not an empty list. Without this the table would say
   * "No caller keys yet." about a request that never came back — a claim
   * the server never made. The panel's alert line carries the reason;
   * this only says that the list is unknown.
   */
  failed?: boolean;
}

/**
 * The caller-key list.
 *
 * A caller key is the bearer token a client sends to reach this Worker's
 * API — a different kind of secret from the provider credentials in the
 * rail above, so it gets its own table rather than a row in that one.
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
}: CallerKeyTableProps) {
  // A failed refresh leaves the last good rows on screen (TanStack Query
  // keeps the data), so the failure is a statement about those rows, not
  // about the table being empty: the rows are stale, and the panel's
  // alert carries the reason.
  const failureText = failed
    ? keys.length > 0
      ? "Could not refresh caller keys."
      : "Could not load caller keys."
    : null;

  return (
    <section
      id="adminCallerKeysSection"
      className="card p-6"
      aria-labelledby="adminCallerKeysTitle"
    >
      <div className="mb-4 pb-3 border-b border-gray-700">
        <h2
          id="adminCallerKeysTitle"
          className="font-semibold text-lg flex items-center"
        >
          <i className="fa-solid fa-key mr-2 text-primary" />
          Caller keys
        </h2>
        <p className="text-sm opacity-70 mt-1">
          The bearer tokens clients send to reach this Worker&apos;s API. They
          are not provider credentials: a provider key authenticates the Worker
          to Cloudflare, a caller key authenticates the caller to the Worker.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left opacity-60 border-b border-gray-800">
            <th id="adminCallerKeysHead" className="p-3 font-medium">
              Name
            </th>
            <th className="p-3 font-medium">Masked key</th>
            <th className="p-3 font-medium">Status</th>
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
        {failureText ??
          (loading ? "Loading caller keys…" : "No caller keys yet.")}
      </p>
    </section>
  );
}
