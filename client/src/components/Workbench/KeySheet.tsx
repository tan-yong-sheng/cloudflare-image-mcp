import { useEffect, useRef, useState } from "react";
import type { AdminKey, AdminProvider } from "../../api/types";
import { MAX_WEIGHT } from "../../config/limits";

export interface SheetValues {
  accountId: string;
  apiToken: string;
  weight: number;
  enabled: boolean;
}

interface KeySheetProps {
  mode: "add" | "edit";
  provider: AdminProvider | null;
  /** The key being edited; null when adding. */
  editingKey: AdminKey | null;
  onClose: () => void;
  onSave: (values: SheetValues) => void;
  saving: boolean;
  /** The error the server answered with, if any. */
  error: string | null;
}

/** The shortest token worth accepting as a pasted credential. */
const MIN_TOKEN_LENGTH = 8;

/**
 * The add/edit drawer.
 *
 * The account field belongs to the transport, not to the family: only a
 * cloudflare-rest provider addresses /accounts/{id}/ai/run, so only it
 * has an account to fill in.
 */
export function KeySheet({
  mode,
  provider,
  editingKey,
  onClose,
  onSave,
  saving,
  error,
}: KeySheetProps) {
  const isEdit = mode === "edit" && editingKey !== null;
  const needsAccountId = provider?.transport === "cloudflare-rest";

  const [accountId, setAccountId] = useState(
    isEdit ? editingKey.accountId || "" : ""
  );
  const [token, setToken] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);
  const [weight, setWeight] = useState(
    isEdit ? String(editingKey.weight) : "1"
  );
  const [enabled, setEnabled] = useState(isEdit ? !!editingKey.enabled : true);
  const [localError, setLocalError] = useState<string | null>(null);

  const accountRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The close handler is re-created on every render, so the listener
  // reads it through a ref instead of re-subscribing each time.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus the first field the operator can actually fill.
  useEffect(() => {
    if (needsAccountId) accountRef.current?.focus();
    else tokenRef.current?.focus();
  }, [needsAccountId]);

  // The drawer is a modal: Escape dismisses it and Tab stays inside it,
  // so a keyboard user cannot wander into the page behind it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const fail = (
    message: string,
    focus: "account" | "token" | "weight"
  ): void => {
    setLocalError(message);
    if (focus === "account") accountRef.current?.focus();
    if (focus === "token") tokenRef.current?.focus();
    if (focus === "weight") weightRef.current?.focus();
  };

  const submit = () => {
    if (saving) return;
    const trimmedAccount = accountId.trim();
    const trimmedToken = token.trim();
    const rawWeight = weight.trim();
    const parsedWeight = rawWeight === "" ? 1 : Number(rawWeight);

    if (needsAccountId && !trimmedAccount) {
      fail("Cloudflare account ID is required.", "account");
      return;
    }
    if (!isEdit && !trimmedToken) {
      fail("API token is required.", "token");
      return;
    }
    if (trimmedToken && trimmedToken.length < MIN_TOKEN_LENGTH) {
      fail(
        isEdit
          ? "Token looks too short — paste the full value, or leave blank to keep."
          : "Token looks too short — paste the full value.",
        "token"
      );
      return;
    }
    if (
      !Number.isInteger(parsedWeight) ||
      parsedWeight < 0 ||
      parsedWeight > MAX_WEIGHT
    ) {
      fail(
        "Weight must be an integer between 0 and " + MAX_WEIGHT + ".",
        "weight"
      );
      return;
    }

    setLocalError(null);
    onSave({
      accountId: trimmedAccount,
      apiToken: trimmedToken,
      weight: parsedWeight,
      enabled,
    });
  };

  const versionTag =
    isEdit &&
    editingKey.activeVersion !== null &&
    editingKey.activeVersion !== undefined
      ? " · v" + editingKey.activeVersion
      : "";

  return (
    <div
      id="adminSheet"
      className="fixed inset-0 flex items-stretch justify-end z-50"
      style={{ background: "rgba(0,0,0,.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="adminSheetTitle"
      onClick={(event) => {
        // The backdrop dismisses; a click inside the drawer does not.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="card p-6 w-full flex flex-col"
        style={{
          maxWidth: "30rem",
          height: "100%",
          overflowY: "auto",
          borderRadius: 0,
          borderTop: 0,
          borderRight: 0,
          borderBottom: 0,
        }}
      >
        <p id="adminSheetEyebrow" className="text-xs opacity-60 font-mono mb-1">
          {isEdit ? "EDIT" : "NEW"}
        </p>
        <h3 id="adminSheetTitle" className="text-lg font-bold mb-1">
          {isEdit
            ? "Edit Key #" +
              editingKey.id +
              " (" +
              editingKey.providerId +
              versionTag +
              ")"
            : "New Key (" + (provider?.id ?? "") + ")"}
        </h3>
        <p id="adminSheetNote" className="text-xs opacity-60 mb-3">
          {isEdit
            ? "Leave the token blank to keep the current version. Filling it rotates as part of save."
            : "The key will be sealed server-side on save."}
        </p>

        <div className="space-y-3 flex-1">
          <div
            id="adminSheetAcctField"
            className={needsAccountId ? "" : "hidden"}
          >
            <label
              htmlFor="adminSheetAcct"
              className="block text-xs opacity-60 mb-1"
            >
              Cloudflare account ID
            </label>
            <input
              id="adminSheetAcct"
              ref={accountRef}
              className="w-full"
              placeholder="e.g. abc123def456"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            />
            <p className="text-xs opacity-60 mt-1">
              Required — inference calls{" "}
              <code>{"/accounts/{account_id}/ai/run/…"}</code>. Stored alongside
              the key (not sealed).
            </p>
          </div>

          <div>
            <label
              htmlFor="adminSheetToken"
              className="block text-xs opacity-60 mb-1"
            >
              API token{" "}
              <span id="adminSheetTokenHint" className="opacity-60">
                {isEdit &&
                editingKey.activeVersion !== null &&
                editingKey.activeVersion !== undefined
                  ? "(blank = keep v" + editingKey.activeVersion + ")"
                  : ""}
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type={tokenVisible ? "text" : "password"}
                id="adminSheetToken"
                ref={tokenRef}
                className="w-full"
                autoComplete="new-password"
                data-1p-ignore="true"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
              <button
                id="adminSheetTokenEye"
                type="button"
                className="btn btn-secondary p-2"
                aria-label={tokenVisible ? "Hide token" : "Show token"}
                title={tokenVisible ? "Hide token" : "Show token"}
                onClick={() => {
                  setTokenVisible((visible) => !visible);
                  tokenRef.current?.focus();
                }}
              >
                <i
                  className={`fa-solid ${
                    tokenVisible ? "fa-eye-slash" : "fa-eye"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label
                htmlFor="adminSheetWeight"
                className="block text-xs opacity-60 mb-1"
              >
                Scheduling weight
              </label>
              <input
                type="number"
                id="adminSheetWeight"
                ref={weightRef}
                className="w-full"
                min={0}
                max={MAX_WEIGHT}
                step={1}
                placeholder="1"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
              />
            </div>
            <label className="flex gap-2 items-center text-xs pb-2">
              <input
                type="checkbox"
                id="adminSheetEnabled"
                style={{ width: "auto" }}
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              Enabled{" "}
              <span className="opacity-60">— uncheck to park the key</span>
            </label>
          </div>
          <p className="text-xs opacity-60">
            Default 1 · ≤ 0 is excluded · maximum{" "}
            {MAX_WEIGHT.toLocaleString("en-US")}.
          </p>
          <p
            id="adminSheetError"
            className={`text-sm text-red-500${
              localError || error ? "" : " hidden"
            }`}
            role="alert"
          >
            {localError ?? error}
          </p>
        </div>

        <div className="flex gap-2 mt-4 justify-end">
          <button
            id="adminSheetCancel"
            type="button"
            className="btn btn-secondary text-sm py-1 px-3"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            id="adminSheetSave"
            type="button"
            className="btn btn-primary text-sm py-1 px-3"
            disabled={saving}
            onClick={submit}
          >
            {isEdit ? "Save" : "Add key"}
          </button>
        </div>
      </div>
    </div>
  );
}
