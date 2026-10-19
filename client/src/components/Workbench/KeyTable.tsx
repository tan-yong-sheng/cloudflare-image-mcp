import type { AdminKey, AdminProvider } from "../../api/types";
import { FamilyMark } from "./FamilyMark";

interface KeyTableProps {
  family: AdminProvider | null;
  keys: AdminKey[];
  /** Whether the health payload is still in flight. */
  loading: boolean;
  /** The key ids with a request in flight, so their row cannot be acted on twice. */
  pendingKeyIds: number[];
  onEdit: (key: AdminKey) => void;
  onDelete: (key: AdminKey) => void;
  onToggle: (key: AdminKey, enabled: boolean) => void;
}

/**
 * The key table.
 *
 * The account column belongs to the transport, not to the family: an
 * openai-compat provider has no Cloudflare account behind it, so its
 * rows are identified by key id instead.
 */
export function KeyTable({
  family,
  keys,
  loading,
  pendingKeyIds,
  onEdit,
  onDelete,
  onToggle,
}: KeyTableProps) {
  const hasAccount = family?.transport === "cloudflare-rest";
  const rows = family ? keys.filter((key) => key.providerId === family.id) : [];

  return (
    <section className="card p-6 flex-1 min-w-0">
      <div className="mb-4 pb-3 border-b border-gray-700 flex items-center justify-between">
        <h3
          id="adminFamilyName"
          className="font-semibold text-lg flex items-center"
        >
          {family ? (
            <>
              <FamilyMark providerId={family.id} />
              {family.displayName || family.id}
            </>
          ) : null}
        </h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left opacity-60 border-b border-gray-800">
            <th id="adminKeysHead" className="p-3 font-medium">
              {hasAccount ? "Account ID" : "Key"}
            </th>
            <th className="p-3 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody id="adminKeys">
          {rows.map((key) => {
            const pending = pendingKeyIds.includes(key.id);
            return (
              <tr
                key={key.id}
                style={key.enabled ? undefined : { opacity: ".55" }}
              >
                <td className="p-3 font-mono text-sm">
                  {hasAccount ? key.accountId || "—" : "#" + key.id}
                  {key.activeVersion !== null &&
                  key.activeVersion !== undefined ? (
                    <span className="opacity-60 text-xs ml-2">
                      v{key.activeVersion}
                    </span>
                  ) : null}
                </td>
                <td className="p-3 whitespace-nowrap text-right">
                  <span className="inline-flex gap-2 items-center">
                    <label
                      className="tswitch"
                      title={(key.enabled ? "Disable " : "Enable ") + key.label}
                    >
                      <input
                        type="checkbox"
                        role="switch"
                        aria-checked={key.enabled}
                        aria-label={
                          (key.enabled ? "Disable " : "Enable ") + key.label
                        }
                        checked={key.enabled}
                        disabled={pending}
                        onChange={(event) =>
                          onToggle(key, event.target.checked)
                        }
                      />
                      <span className="track">
                        <span className="thumb" />
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary text-xs py-1 px-2"
                      aria-label={"Edit key #" + key.id}
                      title={"Edit key #" + key.id}
                      disabled={pending}
                      onClick={() => onEdit(key)}
                    >
                      <i className="fa-solid fa-pen" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger text-xs py-1 px-2"
                      aria-label={"Delete key #" + key.id}
                      title={"Delete key #" + key.id}
                      disabled={pending}
                      onClick={() => {
                        const who = key.accountId || key.label || "#" + key.id;
                        if (
                          !window.confirm(
                            "Delete key #" +
                              key.id +
                              " (" +
                              who +
                              ")? This cannot be undone."
                          )
                        ) {
                          return;
                        }
                        onDelete(key);
                      }}
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p
        id="adminEmpty"
        className={`text-sm opacity-60 text-center py-10${
          rows.length > 0 ? " hidden" : ""
        }`}
      >
        {loading ? "Loading keys…" : "No keys yet."}
      </p>
    </section>
  );
}
