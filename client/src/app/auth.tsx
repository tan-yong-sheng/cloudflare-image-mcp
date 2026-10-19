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

interface AuthContextValue {
  /** The bearer API key, or null when the operator is not signed in. */
  token: string | null;
  isAuthenticated: boolean;
  login: (apiKey: string) => Promise<void>;
  logout: () => void;
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
    try {
      window.sessionStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // Storage can be withheld; the session still holds the key.
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
  }, []);

  const value = useMemo(
    () => ({ token, isAuthenticated: token !== null, login, logout }),
    [token, login, logout]
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
