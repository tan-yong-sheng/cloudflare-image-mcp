import { useCallback, useEffect, useRef, useState } from "react";
import {
  useCallerKeys,
  useCreateCallerKey,
  useDeleteCallerKey,
  useRenameCallerKey,
  useRotateCallerKey,
  useToggleCallerKey,
} from "../../api/admin";
import { useAdminKey, useAdminSession } from "../../app/admin-key";
import { useAuth, SESSION_EXPIRED_MESSAGE } from "../../app/auth";
import { LogoutButton, ThemeToggleButton } from "../AppHeader";
import type { AdminCallerKey } from "../../api/types";
import { adminRefusal, gateErrorFor } from "./admin-gate";
import { CallerKeyCreate } from "./CallerKeyCreate";
import { CallerKeyTable } from "./CallerKeyTable";
import { ConfirmDialog } from "./ConfirmDialog";
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

  // Every piece of one-shot secret material this page holds. Teardown
  // clears all of it in one place so no session-ending path can forget a
  // field (review M2: the 401 and 403 paths used to lock without clearing).
  const [created, setCreated] = useState<{
    kind: "created" | "rotated";
    name: string;
    secret: string;
    /** Set when rotation could not revoke the old secret. */
    warning?: string;
  } | null>(null);
  const [rotating, setRotating] = useState<AdminCallerKey | null>(null);
  const [deleting, setDeleting] = useState<AdminCallerKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const clearSecretState = useCallback(() => {
    // Synchronous invalidation first: the state updates below are applied
    // on the next render, and a request that resolves before then must
    // already see the session as over.
    unlockedRef.current = false;
    setCreated(null);
    setRotating(null);
    setDeleting(null);
    setNotice(null);
  }, []);

  // A refused read is a refused session whichever page hit it: the
  // bearer key is no longer accepted, so the session is over and the
  // management key must not outlive it. A refused gate (403) means the
  // key itself was refused, which is the gate's answer, not a dead
  // session.
  const endRefusedSession = useCallback(() => {
    logout(SESSION_EXPIRED_MESSAGE);
    lock();
    clearSecretState();
  }, [clearSecretState, lock, logout]);

  const callerKeys = useCallerKeys(session);
  const createKey = useCreateCallerKey(session, endRefusedSession);
  const rotateKey = useRotateCallerKey(session, endRefusedSession);
  const toggleKey = useToggleCallerKey(session, endRefusedSession);
  const renameKey = useRenameCallerKey(session, endRefusedSession);
  const deleteKey = useDeleteCallerKey(session, endRefusedSession);

  const [gateError, setGateError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const handledError = useRef<unknown>(null);
  // Whether the panel is unlocked right now, read from an async
  // continuation that may outlive the render it started in (review M2:
  // a create/rotate that resolves after a lock must not put the plaintext
  // back into state).
  // Read by async continuations that may outlive the render they started
  // in. Teardown sets it false SYNCHRONOUSLY: `lock()` only schedules a
  // state update, so a promise resolving in that window would otherwise
  // pass the guard and put the plaintext back after the teardown
  // (review round 2).
  const unlockedRef = useRef(false);
  useEffect(() => {
    unlockedRef.current = adminKey !== null;
  }, [adminKey]);

  // A notice fades on its own, the way the workbench's notice does.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

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
      clearSecretState();
      setGateError(gateErrorFor(refusal));
      return;
    }
    setPanelError(failure instanceof Error ? failure.message : String(failure));
  }, [
    callerKeys.isError,
    callerKeys.error,
    clearSecretState,
    endRefusedSession,
    lock,
  ]);

  const unlocked = adminKey !== null;

  const handleLock = () => {
    // The provider owns the teardown: it drops the key and the cached
    // list together — and the one-shot secret and the open confirmation
    // with them. A locked panel leaves nothing behind to read.
    lock();
    setGateError(null);
    setPanelError(null);
    clearSecretState();
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

      <p id="apiKeysIntro" className="text-sm text-muted mb-4 max-w-3xl">
        The keys your clients send in{" "}
        <span className="font-mono">Authorization: Bearer</span> to call this
        Worker&apos;s <span className="font-mono">/v1</span> and{" "}
        <span className="font-mono">/mcp</span> endpoints. They are not provider
        credentials: a provider key authenticates the Worker to Cloudflare. It
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
        {/*
          Mounted only while unlocked (review M2). The panel is hidden by
          class when locked, and a hidden-but-mounted form kept the
          operator's typed secret in its own state across the session
          boundary — visible again to whoever unlocked next. Unmounting is
          the teardown: the child's state cannot outlive the session.
        */}
        {unlocked ? (
          <>
            <CallerKeyCreate
              busy={createKey.isPending}
              created={created}
              onDismiss={() => setCreated(null)}
              onSubmit={async (values) => {
                const result = await createKey.mutateAsync(values);
                // The session may have ended while the request was open: a
                // locked panel must not receive the plaintext (review M2).
                if (!unlockedRef.current) return;
                setCreated({
                  kind: "created",
                  name: result.key.name,
                  secret: result.secret,
                });
              }}
            />
            {notice ? (
              <p
                id="apiKeysNotice"
                role="status"
                className="text-sm p-3 rounded bg-amber-900/30 text-amber-300 border border-amber-700"
              >
                {notice}
              </p>
            ) : null}
            <CallerKeyTable
              keys={callerKeys.data?.keys ?? []}
              loading={callerKeys.isPending}
              failed={callerKeys.isError}
              onRotate={(key) => {
                // One dialog at a time: both instances hardcode the same DOM
                // ids, so a second open would duplicate them (review F5).
                setDeleting(null);
                setRotating(key);
              }}
              onToggle={(key, _enabled) => {
                setPanelError(null);
                toggleKey.mutate(
                  { keyId: key.id },
                  {
                    onSuccess: (result) => {
                      if (result.warning) setNotice(result.warning);
                    },
                    onError: (cause) =>
                      setPanelError(
                        cause instanceof Error ? cause.message : String(cause)
                      ),
                  }
                );
              }}
              onRenameSubmit={async (key, name) => {
                setPanelError(null);
                try {
                  await renameKey.mutateAsync({ keyId: key.id, name });
                } catch (cause) {
                  setPanelError(
                    cause instanceof Error ? cause.message : String(cause)
                  );
                  throw cause;
                }
              }}
              onDelete={(key) => {
                setRotating(null);
                setDeleting(key);
              }}
              pendingIds={[
                rotating?.id,
                deleting?.id,
                ...(rotateKey.isPending ? [rotateKey.variables?.keyId] : []),
                ...(toggleKey.isPending ? [toggleKey.variables?.keyId] : []),
                ...(renameKey.isPending ? [renameKey.variables?.keyId] : []),
                ...(deleteKey.isPending ? [deleteKey.variables?.keyId] : []),
              ].filter((id): id is number => typeof id === "number")}
            />
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={
          deleting
            ? {
                title: `Delete “${deleting.name}”?`,
                message:
                  "This cannot be undone. Clients using this key will lose access. The audit trail stays; the key does not come back.",
              }
            : null
        }
        confirmLabel="Delete"
        busy={deleteKey.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            const result = await deleteKey.mutateAsync({ keyId: deleting.id });
            if (result.warning) setNotice(result.warning);
            setDeleting(null);
          } catch (cause) {
            setPanelError(
              cause instanceof Error ? cause.message : String(cause)
            );
            setDeleting(null);
          }
        }}
      />

      <ConfirmDialog
        open={
          rotating
            ? {
                title: `Rotate “${rotating.name}”?`,
                message:
                  "Clients using this key will need the new key. The old secret stops working when the rotation lands — unless that same secret is also set in API_KEYS, in which case it keeps working and you are told so afterwards.",
              }
            : null
        }
        confirmLabel="Rotate"
        busy={rotateKey.isPending}
        onCancel={() => setRotating(null)}
        onConfirm={async () => {
          if (!rotating) return;
          try {
            const result = await rotateKey.mutateAsync({ keyId: rotating.id });
            setRotating(null);
            if (!unlockedRef.current) return;
            setCreated({
              kind: "rotated",
              name: result.key.name,
              secret: result.secret,
              ...(result.warning ? { warning: result.warning } : {}),
            });
          } catch (cause) {
            setPanelError(
              cause instanceof Error ? cause.message : String(cause)
            );
            setRotating(null);
          }
        }}
      />

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
