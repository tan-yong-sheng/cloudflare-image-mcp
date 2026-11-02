import { useEffect, useRef, useState } from "react";
import type { AdminKey, AdminProvider } from "../../api/types";
import { MAX_WEIGHT } from "../../config/limits";

export interface SheetValues {
  accountId: string;
  /** Edit mode: the replacement token; blank keeps the stored version. */
  apiToken: string;
  /** Add mode: the parsed tokens to provision, in entry order. Empty in edit mode. */
  apiTokens: string[];
  weight: number;
  enabled: boolean;
}

interface KeySheetProps {
  mode: "add" | "edit";
  provider: AdminProvider | null;
  /** The key being edited; null when adding. */
  editingKey: AdminKey | null;
  /** Set when the operator came in through a row's rotate action: the
   * token field takes the focus on mount and the note explains the
   * supersede. */
  entry?: "rotate";
  onClose: () => void;
  onSave: (values: SheetValues) => void;
  saving: boolean;
  /** The error the server answered with, if any. */
  error: string | null;
}

/** The shortest token worth accepting as a pasted credential. */
const MIN_TOKEN_LENGTH = 8;

/**
 * Splits the drawer's raw token text into the tokens worth adding: each
 * line is trimmed, blank and too-short lines are dropped, and exact
 * duplicates are removed in first-seen order. The counter and the
 * submit path both read this list, so what the operator is shown is
 * exactly what will be provisioned.
 */
function parseTokens(raw: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split("\n")) {
    const token = line.trim();
    if (token.length < MIN_TOKEN_LENGTH) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

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
  entry,
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

  // The tokens the operator is bringing in. Edit mode replaces a single
  // stored version, so it never parses the field into a batch.
  const parsedTokens = isEdit ? [] : parseTokens(token);

  const accountRef = useRef<HTMLInputElement>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const tokenAreaRef = useRef<HTMLTextAreaElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Exactly one of the two token fields is mounted; focus that one.
  const focusToken = (): void => {
    if (tokenAreaRef.current) tokenAreaRef.current.focus();
    else tokenInputRef.current?.focus();
  };

  // The close handler is re-created on every render, so the listener
  // reads it through a ref instead of re-subscribing each time.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus the first field the operator can actually fill. A rotate
  // entry is about the token, so it takes the focus even when an
  // account field is present.
  useEffect(() => {
    if (entry === "rotate") {
      focusToken();
      return;
    }
    if (needsAccountId) accountRef.current?.focus();
    else focusToken();
  }, [needsAccountId, entry]);

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
    if (focus === "token") focusToken();
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
    if (!isEdit && parsedTokens.length === 0) {
      // Nothing in the field can be provisioned. A blank field is a
      // missing token; anything typed that is only too short is a
      // truncated paste.
      fail(
        trimmedToken
          ? "Token looks too short — paste the full value."
          : "API token is required.",
        "token"
      );
      return;
    }
    if (isEdit && trimmedToken && trimmedToken.length < MIN_TOKEN_LENGTH) {
      fail(
        "Token looks too short — paste the full value, or leave blank to keep.",
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
      apiTokens: parsedTokens,
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
        <p id="adminSheetEyebrow" className="text-xs text-muted font-mono mb-1">
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
        <p id="adminSheetNote" className="text-xs text-muted mb-3">
          {isEdit
            ? entry === "rotate"
              ? "Submitting supersedes the active version — the previous token is sealed, not deleted. Leave the token blank to keep the active version."
              : "Leave the token blank to keep the current version. Filling it rotates as part of save."
            : "The key will be sealed server-side on save."}
        </p>

        <div className="space-y-3 flex-1">
          <div
            id="adminSheetAcctField"
            className={needsAccountId ? "" : "hidden"}
          >
            <label
              htmlFor="adminSheetAcct"
              className="block text-xs text-muted mb-1"
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
            <p className="text-xs text-muted mt-1">
              Required — inference calls{" "}
              <code>{"/accounts/{account_id}/ai/run/…"}</code>. Stored alongside
              the key (not sealed).
            </p>
          </div>

          <div>
            <label
              htmlFor="adminSheetToken"
              className="block text-xs text-muted mb-1"
            >
              API token{" "}
              <span id="adminSheetTokenHint" className="text-muted">
                {isEdit &&
                editingKey.activeVersion !== null &&
                editingKey.activeVersion !== undefined
                  ? (editingKey.maskedKey ? editingKey.maskedKey + " · " : "") +
                    "(blank = keep v" +
                    editingKey.activeVersion +
                    ")"
                  : ""}
              </span>
            </label>
            {isEdit ? (
              <div className="flex gap-2 items-center">
                <input
                  type={tokenVisible ? "text" : "password"}
                  id="adminSheetToken"
                  ref={tokenInputRef}
                  className="w-full"
                  autoComplete="new-password"
                  data-1p-ignore="true"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
                <button
                  id="adminSheetTokenEye"
                  type="button"
                  className="btn btn-secondary btn-icon rounded"
                  aria-label={tokenVisible ? "Hide token" : "Show token"}
                  title={tokenVisible ? "Hide token" : "Show token"}
                  onClick={() => {
                    setTokenVisible((visible) => !visible);
                    tokenInputRef.current?.focus();
                  }}
                >
                  <i
                    className={`fa-solid ${
                      tokenVisible ? "fa-eye-slash" : "fa-eye"
                    }`}
                  />
                </button>
              </div>
            ) : (
              <>
                <textarea
                  id="adminSheetToken"
                  ref={tokenAreaRef}
                  className={`w-full font-mono${
                    tokenVisible ? "" : " token-masked"
                  }`}
                  rows={5}
                  autoComplete="new-password"
                  data-1p-ignore="true"
                  spellCheck={false}
                  placeholder="One token per line"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
                <div className="flex gap-2 items-center mt-1">
                  <p
                    id="adminSheetTokenCount"
                    className="text-xs text-muted flex-1"
                    role="status"
                  >
                    {parsedTokens.length === 1
                      ? "1 valid token ready to add."
                      : `${parsedTokens.length} valid tokens ready to add.`}
                  </p>
                  <button
                    id="adminSheetTokenEye"
                    type="button"
                    className="btn btn-secondary btn-icon rounded"
                    aria-label={tokenVisible ? "Hide token" : "Show token"}
                    title={tokenVisible ? "Hide token" : "Show token"}
                    onClick={() => {
                      setTokenVisible((visible) => !visible);
                      focusToken();
                    }}
                  >
                    <i
                      className={`fa-solid ${
                        tokenVisible ? "fa-eye-slash" : "fa-eye"
                      }`}
                    />
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label
                htmlFor="adminSheetWeight"
                className="block text-xs text-muted mb-1"
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
              <span className="text-muted">— uncheck to park the key</span>
            </label>
          </div>
          <p className="text-xs text-muted">
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
