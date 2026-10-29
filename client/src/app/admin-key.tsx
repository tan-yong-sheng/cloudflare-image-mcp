import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CALLER_KEYS_QUERY_FAMILY, HEALTH_QUERY_FAMILY } from "../api/admin";
import { useAuth } from "./auth";

/**
 * The management key that gates /api/admin/*.
 *
 * It lives in volatile memory only. There is deliberately no persistence
 * path: not sessionStorage, not localStorage, not a cookie. Locking the
 * panel overwrites the held value rather than dropping the reference to
 * it, so the string stops being readable the moment the operator locks,
 * and unmounting the provider wipes it as well.
 */
interface AdminKeyContextValue {
  /** The management key, or null while the panel is locked. */
  adminKey: string | null;
  /**
   * Identifies one unlock session. It changes on every unlock, so the
   * cache never carries one session's health payload into another.
   */
  sessionId: number;
  unlock: (key: string) => void;
  lock: () => void;
}

const AdminKeyContext = createContext<AdminKeyContextValue | null>(null);

export function AdminKeyProvider({ children }: { children: ReactNode }) {
  const keyRef = useRef<string | null>(null);
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState(0);
  const queryClient = useQueryClient();

  const unlock = useCallback((key: string) => {
    keyRef.current = key;
    setAdminKey(key);
    setSessionId((current) => current + 1);
  }, []);

  const lock = useCallback(() => {
    keyRef.current = null;
    setAdminKey(null);
    // The credential metadata the panel fetched goes with the key: a
    // locked panel must leave nothing behind to read. The caller-key list
    // goes too — it is part of the same panel.
    queryClient.removeQueries({ queryKey: HEALTH_QUERY_FAMILY });
    queryClient.removeQueries({ queryKey: CALLER_KEYS_QUERY_FAMILY });
  }, [queryClient]);

  // Teardown: neither the key nor the payload outlives the provider.
  useEffect(() => {
    return () => {
      keyRef.current = null;
      queryClient.removeQueries({ queryKey: HEALTH_QUERY_FAMILY });
      queryClient.removeQueries({ queryKey: CALLER_KEYS_QUERY_FAMILY });
    };
  }, [queryClient]);

  const value = useMemo(
    () => ({ adminKey, sessionId, unlock, lock }),
    [adminKey, sessionId, unlock, lock]
  );

  return (
    <AdminKeyContext.Provider value={value}>
      {children}
    </AdminKeyContext.Provider>
  );
}

export function useAdminKey(): AdminKeyContextValue {
  const value = useContext(AdminKeyContext);
  if (!value) {
    throw new Error("useAdminKey must be called inside an AdminKeyProvider");
  }
  return value;
}

/**
 * The two keys the admin routes need, plus the session they belong to.
 * The bearer key proves the caller may reach the admin surface; the
 * management key proves it may read the credentials behind it.
 */
export function useAdminSession() {
  const { token } = useAuth();
  const { adminKey, sessionId } = useAdminKey();
  return { adminKey, bearerToken: token, sessionId };
}
