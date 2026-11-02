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
  /** Opens the edit drawer primed for rotating this key's token. */
  onRotate?: (key: AdminKey) => void;
}

/**
 * An account id is identity, not a secret: it cannot authenticate anything.
 * It still names the operator's account, so the table shows enough to tell
 * two accounts apart and nothing more. The full value stays in the edit
 * sheet and in this cell's tooltip, where it is actually needed.
 */
function maskAccountId(accountId: string): string {
  if (accountId.length <= 8) return "…";
  return accountId.slice(0, 4) + "…" + accountId.slice(-4);
}

/**
 * The key table.
 *
 * Two identity columns: `Key` is the server-computed masked hint of the
 * sealed token, and `Account ID` belongs to the transport, not the family —
 * an openai-compat provider has no Cloudflare account behind it, so that
 * column only exists for `cloudflare-rest`.
 *
 * The hint is computed server-side because the browser never holds a token
 * and cannot mask one. A key whose envelope will not open arrives without a
 * hint and reads as a dash, so the row that repairs it stays reachable.
 *
 * `data-key-id` is the row's stable anchor: the account id and the hint are
 * both masked or absent, so neither can identify a row to a test or a tool.
 */
export function KeyTable({
  family,
  keys,
  loading,
  pendingKeyIds,
  onEdit,
  onDelete,
  onToggle,
  onRotate,
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
          <tr className="text-left text-muted border-b border-gray-800">
            <th id="adminKeysHead" className="p-3 font-medium">
              Key
            </th>
            {hasAccount ? (
              <th className="p-3 font-medium">Account ID</th>
            ) : null}
            <th className="p-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody id="adminKeys">
          {rows.map((key) => {
            const pending = pendingKeyIds.includes(key.id);
            return (
              <tr
                key={key.id}
                data-key-id={key.id}
                style={key.enabled ? undefined : { opacity: ".55" }}
              >
                <td className="p-3 font-mono text-sm">
                  {key.maskedKey || "—"}
                  {key.activeVersion !== null &&
                  key.activeVersion !== undefined ? (
                    <span className="text-muted text-xs ml-2">
                      v{key.activeVersion}
                    </span>
                  ) : null}
                </td>
                {hasAccount ? (
                  <td
                    className="p-3 font-mono text-sm"
                    title={key.accountId || undefined}
                  >
                    {key.accountId ? maskAccountId(key.accountId) : "—"}
                  </td>
                ) : null}
                <td className="p-3 whitespace-nowrap text-right">
                  <span className="inline-flex items-center gap-3">
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

                    <span
                      className="inline-block h-4 w-px"
                      style={{ backgroundColor: "var(--border)" }}
                      aria-hidden="true"
                    />

                    <span className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm-icon text-xs"
                        aria-label={"Rotate key #" + key.id}
                        title={"Rotate key #" + key.id}
                        disabled={pending}
                        onClick={() => onRotate?.(key)}
                      >
                        <i className="fa-solid fa-rotate-right" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm-icon text-xs"
                        aria-label={"Edit key #" + key.id}
                        title={"Edit key #" + key.id}
                        disabled={pending}
                        onClick={() => onEdit(key)}
                      >
                        <i className="fa-solid fa-pen" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm-icon text-xs"
                        aria-label={"Delete key #" + key.id}
                        title={"Delete key #" + key.id}
                        disabled={pending}
                        onClick={() => {
                          const who =
                            key.maskedKey ||
                            key.accountId ||
                            key.label ||
                            "#" + key.id;
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
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p
        id="adminEmpty"
        className={`text-sm text-muted text-center py-10${
          rows.length > 0 ? " hidden" : ""
        }`}
      >
        {loading ? "Loading keys…" : "No keys yet."}
      </p>
    </section>
  );
}
