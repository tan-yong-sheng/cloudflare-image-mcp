import { useEffect, useRef } from "react";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isOpen = open !== null;

  // Keyboard handling lives on the document, not the backdrop (review F5).
  // The dialog is a SIBLING of the table that opens it, so focus stays on the
  // Rotate/Delete button — never a descendant of this element — and an
  // onKeyDown here never fired: Escape did nothing while the comment
  // promised it. KeySheet already does exactly this for the same reason.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busy) onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      // Keep Tab inside the dialog: `aria-modal` claims it, and without this
      // focus walks into the table and can activate a second row's action.
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled])"
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // Move focus in on open, so the dialog is reachable without a mouse and
    // Escape has somewhere sane to return from.
    cancelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, busy, onCancel]);

  if (!open) return null;
  return (
    <div
      id="callerKeyConfirmBackdrop"
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      role="presentation"
      onClick={() => {
        // A request already left the dialog: dismissing it here would hide
        // the only surface that reports the answer, and (for rotate) free
        // the row to be acted on again while its secret is being replaced
        // (review M4). Escape and Cancel are guarded the same way.
        if (!busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
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
            ref={cancelRef}
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
