import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAdminMutations,
  useHealth,
  usePendingAdminKeyIds,
} from "../../api/admin";
import type { AdminKey, KeyTestRun, RunKeyTestRequest } from "../../api/types";
import { useAdminKey, useAdminSession } from "../../app/admin-key";
import { useAuth, SESSION_EXPIRED_MESSAGE } from "../../app/auth";
import { LogoutButton, ThemeToggleButton } from "../AppHeader";
import type { AdminApiError } from "../../api/admin";
import { adminRefusal, gateErrorFor } from "./admin-gate";
import { FamilyRail } from "./FamilyRail";
import { KeySheet, type SheetValues } from "./KeySheet";
import { KeyTable } from "./KeyTable";
import { LiveTestCard } from "./LiveTestCard";
import { ModelFilterCard } from "./ModelFilterCard";
import { OperationsRail } from "./OperationsRail";
import { UnlockGate } from "./UnlockGate";

type SheetState = {
  mode: "add" | "edit";
  key: AdminKey | null;
  /** Set when the drawer was entered from a row's rotate action. */
  entry?: "rotate";
} | null;

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
  const [selected, setSelected] = useState("");
  // The operations rail collapses below the md breakpoint; this toggle
  // opens it there. At md and above the rail is visible regardless, so
  // the state only feeds the CSS classes and the toggle's expanded
  // state — never a matchMedia branch.
  const [operationsOpen, setOperationsOpen] = useState(false);
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
  // Card 2's most recent run, lifted here so Card 1's Working chip can
  // read the same data (see handleRunTest): the request carries the
  // scope the run used, the results carry the per-pairing outcomes.
  const [lastRun, setLastRun] = useState<KeyTestRun | null>(null);
  // The run's request-level failure, if the POST itself was refused.
  const [testError, setTestError] = useState<string | null>(null);
  const handledError = useRef<unknown>(null);

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

  // Card 1's Working chip reads the most recent run's passes: the model
  // ids that answered ok. A new run replaces the set (handleRunTest);
  // empty keeps the chip in its greyed pre-run state.
  const workingModels = new Set(
    (lastRun?.results ?? [])
      .filter((result) => result.ok)
      .map((result) => result.modelId)
  );

  // A rejected key re-locks the panel and explains itself on the gate.
  useEffect(() => {
    if (!health.isError) {
      handledError.current = null;
      return;
    }
    if (handledError.current === health.error) return;
    handledError.current = health.error;
    const failure = health.error;
    const refusal = adminRefusal(failure);
    if (refusal?.status === 401) {
      endRefusedSession(refusal);
      return;
    }
    // The credential payload could not be read, so the admin session is
    // over: the management key goes with it, and the gate says why. An
    // error the operator cannot see is not an error they can act on.
    lock();
    if (refusal?.status === 403) {
      setGateError(gateErrorFor(refusal));
      return;
    }
    setGateError(failure instanceof Error ? failure.message : String(failure));
  }, [health.isError, health.error, endRefusedSession, lock]);

  // A notice fades on its own, the way the legacy page's did.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Locking drops the probe results with the rest of the session's
  // payload: a re-unlocked panel starts pre-run, its Working chip greyed
  // again until the operator runs a fresh test.
  useEffect(() => {
    if (unlocked) return;
    setLastRun(null);
    setTestError(null);
  }, [unlocked]);

  // The unlocked state as of the moment a run's answer lands (same
  // read-during-render pattern as sheetRef above), so a late answer
  // knows whether the session it belongs to still exists.
  const unlockedRef = useRef(unlocked);
  unlockedRef.current = unlocked;

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
        // One sequential add per pasted token, in the order the operator
        // entered them. A refusal stops the batch where it is: the
        // server's reason goes to the drawer, which stays open, and the
        // keys the server already took stay added.
        const batchLabel = "key-" + Date.now();
        for (let index = 0; index < values.apiTokens.length; index += 1) {
          await mutations.addKey.mutateAsync({
            providerId: family?.id ?? "",
            label: batchLabel + "-" + (index + 1),
            apiToken: values.apiTokens[index],
            accountId: values.accountId,
            weight: values.weight,
            enabled: values.enabled,
          });
        }
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

  // Card 2's run. The card owns the scope and the concrete selection;
  // the outcome is lifted here so Card 1's Working chip reads the same
  // data. A completed run replaces the previous one — the working set
  // is the latest run's passes, never an accumulation.
  const handleRunTest = (request: RunKeyTestRequest) => {
    setTestError(null);
    mutations.testKeys.mutate(request, {
      onSuccess: (response) => {
        // The probe can take a while — the pairings run sequentially —
        // so the operator may lock before it answers. An answer that
        // lands after the lock belongs to a session that is over: the
        // lock dropped the results, and it must not put them back.
        if (!unlockedRef.current) return;
        setLastRun({ request, results: response.results });
      },
      onError: (cause) => {
        if (!unlockedRef.current) return;
        setTestError(cause instanceof Error ? cause.message : String(cause));
      },
    });
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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <button
            id="adminBackBtn"
            type="button"
            className="btn btn-secondary p-2 h-12 flex items-center justify-center rounded"
            aria-label="Back to Image Generator"
            onClick={() => {
              window.location.hash = "";
            }}
          >
            <i className="fa-solid fa-arrow-left mr-2" />
            Back
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            id="adminOpsToggle"
            type="button"
            className={`btn btn-primary p-2 h-10 flex items-center justify-center${
              unlocked ? "" : " hidden"
            }`}
            aria-label="Toggle operations rail"
            title="Toggle operations rail"
            aria-expanded={operationsOpen}
            onClick={() => setOperationsOpen((open) => !open)}
          >
            <i className="fa-solid fa-gear mr-2" />
            Operations
          </button>
          <button
            id="adminApiKeysBtn"
            type="button"
            className="btn btn-secondary p-2 h-10 flex items-center justify-center"
            aria-label="Open API keys"
            onClick={() => {
              window.location.hash = "#admin/api-keys";
            }}
          >
            <i className="fa-solid fa-key mr-2" />
            API keys
          </button>
          <button
            id="adminLock"
            type="button"
            className={`btn btn-secondary p-2 h-12 flex items-center justify-center${
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
              onRotate={(key) => {
                setSheetError(null);
                setSheet({ mode: "edit", key, entry: "rotate" });
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
          <OperationsRail
            open={operationsOpen}
            filters={
              <ModelFilterCard
                providers={providers}
                workingModels={workingModels}
              />
            }
            test={
              <LiveTestCard
                keys={keys}
                running={mutations.testKeys.isPending}
                error={testError}
                lastRun={lastRun}
                onRun={handleRunTest}
              />
            }
          />
        </div>
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
          entry={sheet.entry}
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
