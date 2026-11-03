export interface ConfirmDialogProps {
  /** Null hides the dialog. */
  open: {
    /** The row the dialog is about — named in title and message. */
    title: string;
    message: string;
  } | null;
  confirmLabel: string;
  /** The request is in flight; the confirm button waits for its answer. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The confirmation dialog the destructive key actions share.
 *
 * Rotate and delete both hand out consequences the operator cannot take
 * back from this page — clients holding the old secret, clients losing
 * access — so the request is sent only from a button that was reached on
 * purpose. Escape and the backdrop close it without sending.
 */
export function ConfirmDialog({
  open,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div
      id="callerKeyConfirmBackdrop"
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onCancel();
      }}
      onClick={() => {
        // A request already left the dialog: dismissing it here would hide
        // the only surface that reports the answer, and (for rotate) free
        // the row to be acted on again while its secret is being replaced
        // (review M4). Escape and Cancel are guarded the same way.
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="callerKeyConfirmTitle"
        className="card p-6 max-w-md w-full mx-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="callerKeyConfirmTitle" className="text-lg font-bold mb-2">
          {open.title}
        </h3>
        <p id="callerKeyConfirmMessage" className="text-sm opacity-70 mb-4">
          {open.message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            id="callerKeyConfirmCancel"
            type="button"
            className="btn btn-secondary text-sm py-1.5 px-4"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            id="callerKeyConfirmOk"
            type="button"
            className="btn btn-primary text-sm py-1.5 px-4"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
