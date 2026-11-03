import { useCallback, useEffect, useRef, useState } from "react";
import { useCallerKeys, useCreateCallerKey } from "../../api/admin";
import { useAdminKey, useAdminSession } from "../../app/admin-key";
import { useAuth, SESSION_EXPIRED_MESSAGE } from "../../app/auth";
import { LogoutButton, ThemeToggleButton } from "../AppHeader";
import { adminRefusal, gateErrorFor } from "./admin-gate";
import { CallerKeyCreate } from "./CallerKeyCreate";
import { CallerKeyTable } from "./CallerKeyTable";
import { UnlockGate } from "./UnlockGate";

/**
 * The API-keys page.
 *
 * These are the keys a client presents to reach this Worker — the
 * `Authorization: Bearer` values for `/v1/*` and `/mcp*`. They are not
 * provider credentials: a provider key authenticates the Worker to
 * Cloudflare, and it lives on the workbench next door.
 *
 * The page exists rather than a section because it is a different job
 * with a different audience: rotating what your clients use has nothing
 * to do with which provider credentials are servable. The workbench
 * keeps provider credentials; this keeps what callers present.
 *
 * It is behind the same management-key gate as the workbench, and the
 * unlock is shared: arriving here from the workbench keeps the session,
 * opening it cold asks for the key. Nothing behind the gate is requested
 * before it is in hand.
 */
export function ApiKeysPage() {
  const session = useAdminSession();
  const { adminKey, unlock, lock } = useAdminKey();
  const { logout } = useAuth();

  // A refused read is a refused session whichever page hit it: the
  // bearer key is no longer accepted, so the session is over and the
  // management key must not outlive it. A refused gate (403) means the
  // key itself was refused, which is the gate's answer, not a dead
  // session.
  const endRefusedSession = useCallback(() => {
    logout(SESSION_EXPIRED_MESSAGE);
    lock();
  }, [lock, logout]);

  const callerKeys = useCallerKeys(session);
  const createKey = useCreateCallerKey(session, endRefusedSession);

  const [gateError, setGateError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  // The one-shot secret from the last create, held in component state so
  // the operator can actually copy it. Locking tears it down with the
  // session; nothing ever writes it to storage.
  const [created, setCreated] = useState<{
    name: string;
    secret: string;
  } | null>(null);
  const handledError = useRef<unknown>(null);

  useEffect(() => {
    if (!callerKeys.isError) {
      handledError.current = null;
      setPanelError(null);
      return;
    }
    if (handledError.current === callerKeys.error) return;
    handledError.current = callerKeys.error;
    const failure = callerKeys.error;
    const refusal = adminRefusal(failure);
    if (refusal?.status === 401) {
      endRefusedSession();
      return;
    }
    if (refusal?.status === 403) {
      lock();
      setGateError(gateErrorFor(refusal));
      return;
    }
    setPanelError(failure instanceof Error ? failure.message : String(failure));
  }, [callerKeys.isError, callerKeys.error, endRefusedSession, lock]);

  const unlocked = adminKey !== null;

  const handleLock = () => {
    // The provider owns the teardown: it drops the key and the cached
    // list together — and the one-shot secret with them. A locked panel
    // leaves nothing behind to read.
    lock();
    setGateError(null);
    setPanelError(null);
    setCreated(null);
  };

  return (
    <main
      id="apiKeysView"
      className="container mx-auto px-4 py-4 max-w-6xl"
      role="main"
      aria-labelledby="apiKeysTitle"
    >
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <button
            id="apiKeysBackBtn"
            type="button"
            className="btn btn-secondary p-2 h-10 flex items-center justify-center rounded"
            aria-label="Back to the provider workbench"
            onClick={() => {
              window.location.hash = "#admin";
            }}
          >
            <i className="fa-solid fa-arrow-left mr-2" />
            Workbench
          </button>
          <h1 id="apiKeysTitle" className="text-xl font-bold">
            API keys
          </h1>
        </div>
        <div className="flex items-center space-x-2">
          <button
            id="apiKeysLock"
            type="button"
            className={`btn btn-secondary p-2 h-10 flex items-center justify-center${
              unlocked ? "" : " hidden"
            }`}
            aria-label="Lock API keys"
            onClick={handleLock}
          >
            <i className="fa-solid fa-lock mr-2" />
            Lock
          </button>
          <ThemeToggleButton id="themeToggleApiKeys" />
          <LogoutButton id="logoutButtonApiKeys" />
        </div>
      </div>

      <p id="apiKeysIntro" className="text-sm opacity-70 mb-4 max-w-3xl">
        The keys your clients send in{" "}
        <span className="font-mono">Authorization: Bearer</span> to call this
        Worker&apos;s <span className="font-mono">/v1</span> and{" "}
        <span className="font-mono">/mcp</span> endpoints. They are not provider
        credentials: a provider key authenticates the Worker to Cloudflare and
        lives on the workbench.
      </p>

      <p
        id="apiKeysError"
        className={`text-sm p-3 mb-4 rounded bg-red-900/30 text-red-300 border border-red-700${
          panelError ? "" : " hidden"
        }`}
        role="alert"
      >
        {panelError}
      </p>

      <div
        id="apiKeysPanel"
        className={`space-y-4${unlocked ? "" : " hidden"}`}
      >
        <CallerKeyCreate
          busy={createKey.isPending}
          created={created}
          onDismiss={() => setCreated(null)}
          onSubmit={async (values) => {
            const result = await createKey.mutateAsync(values);
            setCreated({ name: result.key.name, secret: result.secret });
          }}
        />
        <CallerKeyTable
          keys={callerKeys.data?.keys ?? []}
          loading={callerKeys.isPending}
          failed={callerKeys.isError}
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
    </main>
  );
}
