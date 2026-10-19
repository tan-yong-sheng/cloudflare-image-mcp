import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "../api/client";

/**
 * The bearer API key lives in sessionStorage, as it did on the legacy
 * page: it survives a reload of the tab but not the browser session.
 *
 * This is NOT the management key. The management key that gates
 * /api/admin/* is strictly in-memory and never reaches any storage
 * backend — see the workbench slice.
 */
const STORAGE_KEY = "api_key";

/**
 * Shown when the server refuses the bearer key the session is using.
 *
 * The message belongs to the sign-in prompt rather than to the page
 * that asked for the key: a refused session ends the whole session, so
 * whatever asked for the key is torn down with it. A note left there
 * would never be read.
 */
export const SESSION_EXPIRED_MESSAGE = "Session expired. Please sign in again.";

interface AuthContextValue {
  /** The bearer API key, or null when the operator is not signed in. */
  token: string | null;
  isAuthenticated: boolean;
  /**
   * Why the session ended, when it ended for a reason the operator
   * should know. Null while the session is alive, and null after a
   * sign-out the operator asked for.
   */
  endedReason: string | null;
  login: (apiKey: string) => Promise<void>;
  /** End the session. The reason, if any, is shown at the sign-in prompt. */
  logout: (reason?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readStoredToken);
  const [endedReason, setEndedReason] = useState<string | null>(null);

  const login = useCallback(async (apiKey: string) => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error("Please enter a password");
    }

    // Validate against an authenticated route: /health is public by
    // design, so any key would pass. /v1/models 401s on a bad key and
    // 200s on a good one (or when no API_KEYS are configured).
    const result = await apiFetch("/v1/models", { authToken: trimmed });
    if (!result.ok) {
      throw new Error("Invalid API key");
    }

    setToken(trimmed);
    setEndedReason(null);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // Storage can be withheld; the session still holds the key.
    }
  }, []);

  const logout = useCallback((reason?: string) => {
    setToken(null);
    setEndedReason(reason ?? null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
  }, []);

  const value = useMemo(
    () => ({
      token,
      isAuthenticated: token !== null,
      endedReason,
      login,
      logout,
    }),
    [token, endedReason, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be called inside an AuthProvider");
  }
  return value;
}
