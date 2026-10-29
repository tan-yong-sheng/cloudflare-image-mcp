import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdminApiError,
  useAdminMutations,
  useCallerKeys,
  useHealth,
  usePendingAdminKeyIds,
} from "../../api/admin";
import type { AdminKey } from "../../api/types";
import { useAdminKey, useAdminSession } from "../../app/admin-key";
import { useAuth, SESSION_EXPIRED_MESSAGE } from "../../app/auth";
import { LogoutButton, ThemeToggleButton } from "../AppHeader";
import { CallerKeyTable } from "./CallerKeyTable";
import { FamilyRail } from "./FamilyRail";
import { KeySheet, type SheetValues } from "./KeySheet";
import { KeyTable } from "./KeyTable";
import { UnlockGate } from "./UnlockGate";

type SheetState = { mode: "add" | "edit"; key: AdminKey | null } | null;

/**
 * The provider credentials workbench.
 *
 * The management key lives in memory only, so the panel is a gate until
 * the operator unlocks it. Nothing behind the gate is requested before
 * that: the health route is only read once a key is in hand.
 */
export function AdminView() {
  const session = useAdminSession();
  const { adminKey, unlock, lock } = useAdminKey();
  const { logout } = useAuth();

  // A refused session is a refused session whichever request hit it:
  // the bearer key is no longer accepted, so the whole session is over
  // and the management key must not outlive it. The workbench ends its
  // own session here instead of waiting for the shell to notice the
  // sign-out, and the reason travels with the sign-out, because the
  // shell tears this screen down with the session.
  const endRefusedSession = useCallback(
    (_failure: AdminApiError) => {
      logout(SESSION_EXPIRED_MESSAGE);
      lock();
    },
    [lock, logout]
  );

  const health = useHealth(session);
  const mutations = useAdminMutations(session, endRefusedSession);
  // Caller keys are a second list: the bearer tokens clients send to reach
  // this Worker, as opposed to the provider credentials the Worker sends
  // to Cloudflare. It is read on its own so one list failing does not take
  // the other down with it.
  const callerKeys = useCallerKeys(session);

  const [selected, setSelected] = useState("");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  // The drawer whose own save is in flight. Another drawer opened while
  // it waits is not busy: only the request it sent is outstanding.
  const [savingSheet, setSavingSheet] = useState<SheetState>(null);
  // The drawer whose own request is in flight. The flag has to name
  // that drawer, not just "a request": a dismissed drawer's late answer
  // must not free the drawer that replaced it, or the operator could
  // send the same save twice.
  const savingSheetRef = useRef<SheetState>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const handledError = useRef<unknown>(null);
  const handledCallerError = useRef<unknown>(null);

  const unlocked = adminKey !== null;
  const providers = health.data?.providers ?? [];
  const keys = health.data?.keys ?? [];
  // The panel opens as soon as the operator unlocks, but the payload
  // behind it is still in flight; until it lands there is nothing to
  // count, so the chips stay hidden rather than claiming zero.
  const healthLoaded = health.data !== undefined;

  // The selected family stays selected while it exists; a family that
  // disappears hands the selection to the first remaining one.
  const selectedId = providers.some((provider) => provider.id === selected)
    ? selected
    : (providers[0]?.id ?? "");
  const family =
    providers.find((provider) => provider.id === selectedId) ?? null;

  // A rejected key re-locks the panel and explains itself on the gate.
  useEffect(() => {
    if (!health.isError) {
      handledError.current = null;
      return;
    }
    if (handledError.current === health.error) return;
    handledError.current = health.error;
    const failure = health.error;
    if (failure instanceof AdminApiError && failure.status === 401) {
      endRefusedSession(failure);
      return;
    }
    // The credential payload could not be read, so the admin session is
    // over: the management key goes with it, and the gate says why. An
    // error the operator cannot see is not an error they can act on.
    lock();
    if (failure instanceof AdminApiError && failure.status === 403) {
      // A disabled admin gate is not the operator's key being wrong, so
      // the server's own reason is shown when it says which it was.
      setGateError(
        failure.code === "admin_disabled"
          ? failure.message
          : "Management key rejected."
      );
      return;
    }
    setGateError(failure instanceof Error ? failure.message : String(failure));
  }, [health.isError, health.error, endRefusedSession, lock]);

  // A caller-key failure is not the provider payload's business: the
  // provider workbench keeps working. Only a refused session or a refused
  // gate ends the panel; anything else is reported and the rest of the
  // workbench carries on.
  useEffect(() => {
    if (!callerKeys.isError) {
      handledCallerError.current = null;
      return;
    }
    if (handledCallerError.current === callerKeys.error) return;
    handledCallerError.current = callerKeys.error;
    const failure = callerKeys.error;
    if (failure instanceof AdminApiError && failure.status === 401) {
      endRefusedSession(failure);
      return;
    }
    if (failure instanceof AdminApiError && failure.status === 403) {
      lock();
      setGateError(
        failure.code === "admin_disabled"
          ? failure.message
          : "Management key rejected."
      );
      return;
    }
    setPanelError(failure instanceof Error ? failure.message : String(failure));
  }, [callerKeys.isError, callerKeys.error, endRefusedSession, lock]);

  // A notice fades on its own, the way the legacy page's did.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Escape leaves the workbench for the generator. The add/edit drawer
  // owns its own Escape, so an open drawer swallows it first.
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (sheetRef.current) return;
      if (window.location.hash === "#admin") {
        window.location.hash = "";
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleLock = () => {
    // The provider owns the teardown: it drops the key and the cached
    // credential payload together.
    lock();
    setGateError(null);
    setPanelError(null);
    setSheet(null);
    setSelected("");
  };

  const handleSave = async (values: SheetValues) => {
    // The drawer the request was sent from. The operator may dismiss it
    // and open another one while the request is in flight, so a late
    // answer must not close or annotate the drawer that replaced it.
    const submitted = sheet;
    setSavingSheet(submitted);
    savingSheetRef.current = submitted;
    try {
      if (submitted?.mode === "edit" && submitted.key) {
        await mutations.updateKey.mutateAsync({
          keyId: submitted.key.id,
          accountId: values.accountId,
          weight: values.weight,
          enabled: values.enabled,
          // A blank token keeps the stored version; a value rotates it.
          ...(values.apiToken ? { apiToken: values.apiToken } : {}),
        });
      } else {
        await mutations.addKey.mutateAsync({
          providerId: family?.id ?? "",
          label: "key-" + Date.now(),
          apiToken: values.apiToken,
          accountId: values.accountId,
          weight: values.weight,
          enabled: values.enabled,
        });
      }
      // The panel error belongs to the panel, not to this drawer. A
      // late answer from a drawer the operator has already dismissed
      // must not wipe a message another request has just put there.
      if (sheetRef.current === submitted) {
        setPanelError(null);
        setSheet(null);
      }
    } catch (cause) {
      if (sheetRef.current === submitted) {
        setSheetError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      // Only the drawer that sent the request may clear the busy state.
      // Another drawer may have taken over in the meantime.
      if (savingSheetRef.current === submitted) {
        savingSheetRef.current = null;
        setSavingSheet(null);
      }
    }
  };

  // Every key with a request in flight, not just the last one the
  // operator touched: two rows can be acted on at once, and each row
  // must stay busy until its own request is answered.
  const pendingKeyIds = usePendingAdminKeyIds();

  return (
    <main
      id="adminView"
      className="container mx-auto px-4 py-4 max-w-6xl"
      role="main"
      aria-labelledby="adminViewTitle"
    >
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <button
            id="adminBackBtn"
            type="button"
            className="btn btn-secondary p-2 h-10 flex items-center justify-center rounded"
            aria-label="Back to Image Generator"
            onClick={() => {
              window.location.hash = "";
            }}
          >
            <i className="fa-solid fa-arrow-left mr-2" />
            Back
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <span
            id="adminChipsActive"
            className={`chip chip-ok${
              unlocked && healthLoaded ? "" : " hidden"
            }`}
          >
            {keys.filter((key) => key.enabled).length}/{keys.length} active keys
          </span>
          <span
            id="adminChipsFamilies"
            className={`chip${unlocked && healthLoaded ? "" : " hidden"}`}
          >
            {providers.length}{" "}
            {providers.length === 1 ? "provider family" : "provider families"}
          </span>
          <button
            id="adminLock"
            type="button"
            className={`btn btn-secondary p-2 h-10 flex items-center justify-center${
              unlocked ? "" : " hidden"
            }`}
            aria-label="Lock provider credentials"
            onClick={handleLock}
          >
            <i className="fa-solid fa-lock mr-2" />
            Lock
          </button>
          <ThemeToggleButton id="themeToggleAdmin" />
          <LogoutButton id="logoutButtonAdmin" />
        </div>
      </div>

      <p
        id="adminNotice"
        className={`text-sm p-3 mb-4 rounded bg-green-900/30 text-green-300 border border-green-700${
          notice ? "" : " hidden"
        }`}
        role="status"
      >
        {notice}
      </p>

      <p
        id="adminPanelError"
        className={`text-sm p-3 mb-4 rounded bg-red-900/30 text-red-300 border border-red-700${
          panelError ? "" : " hidden"
        }`}
        role="alert"
      >
        {panelError}
      </p>

      <div id="adminPanel" className={`space-y-4${unlocked ? "" : " hidden"}`}>
        <div className="flex flex-col md:flex-row gap-6">
          <aside
            className="card p-4 md:w-64 flex-shrink-0"
            aria-label="Provider families"
          >
            <h1
              id="adminViewTitle"
              className="text-xl font-bold flex items-center mb-4 pb-3 border-b border-gray-700"
            >
              <i className="fa-solid fa-server mr-2 text-primary" />
              Administration
            </h1>
            <FamilyRail
              providers={providers}
              keys={keys}
              selected={selectedId}
              loading={health.isPending}
              onSelect={setSelected}
            />
          </aside>
          <div className="flex-1 min-w-0 flex flex-col">
            <KeyTable
              family={family}
              keys={keys}
              loading={health.isPending}
              pendingKeyIds={pendingKeyIds}
              onEdit={(key) => {
                setSheetError(null);
                setSheet({ mode: "edit", key });
              }}
              onDelete={(key) => {
                setPanelError(null);
                mutations.deleteKey.mutate(
                  { keyId: key.id },
                  {
                    onSuccess: () => setNotice("Deleted key #" + key.id + "."),
                    onError: (cause) =>
                      setPanelError(
                        cause instanceof Error ? cause.message : String(cause)
                      ),
                  }
                );
              }}
              onToggle={(key, enabled) => {
                setPanelError(null);
                mutations.toggleKey.mutate(
                  { keyId: key.id, enabled },
                  {
                    onError: (cause) =>
                      setPanelError(
                        cause instanceof Error ? cause.message : String(cause)
                      ),
                  }
                );
              }}
            />
            <div className="mt-4 flex justify-end">
              <button
                id="adminAddKey"
                type="button"
                className={`btn btn-primary text-sm py-1.5 px-4${
                  family ? "" : " hidden"
                }`}
                aria-label="Add new provider key"
                onClick={() => {
                  setSheetError(null);
                  setSheet({ mode: "add", key: null });
                }}
              >
                <i className="fa-solid fa-plus mr-1" />
                New key
              </button>
            </div>
          </div>
        </div>
        <CallerKeyTable
          keys={callerKeys.data?.keys ?? []}
          loading={callerKeys.isPending}
        />
      </div>

      <UnlockGate
        key={unlocked ? "unlocked" : "locked"}
        hidden={unlocked}
        error={gateError}
        onUnlock={(key) => {
          setGateError(null);
          unlock(key);
        }}
      />

      {sheet ? (
        <KeySheet
          mode={sheet.mode}
          provider={family}
          editingKey={sheet.key}
          saving={savingSheet === sheet}
          error={sheetError}
          onClose={() => {
            setSheetError(null);
            setSheet(null);
          }}
          onSave={handleSave}
        />
      ) : null}
    </main>
  );
}
