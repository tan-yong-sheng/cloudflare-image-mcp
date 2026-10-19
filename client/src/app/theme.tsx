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

export type Theme = "light" | "dark";

/** The legacy page stored the operator's choice under this key. */
const STORAGE_KEY = "theme";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * An explicit choice always wins over the system preference; the system
 * preference is only consulted when nothing is stored. Same rule as the
 * legacy page, which read `localStorage.theme` and fell back to
 * `prefers-color-scheme` only when the key was absent.
 */
export function resolveInitialTheme(): Theme {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can throw when the browser withholds it (private mode, a
    // site-data policy). The theme still has to resolve.
    stored = null;
  }
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);
  // The toggle needs the theme that is on screen without re-creating
  // itself on every change, and the state updater must stay pure.
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    // The theme lives on the <html> element, the way the legacy page
    // did it: the .dark class is what the token block keys off.
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = themeRef.current === "dark" ? "light" : "dark";
    setTheme(next);
    // Only an explicit choice is stored. The legacy page wrote
    // localStorage.theme from its toggle handler and nowhere else, so
    // an operator who never chose kept following the system
    // preference. Storing the resolved theme here would have frozen
    // that preference at the first visit and turned it into a choice
    // the operator never made.
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A blocked storage backend must not break the toggle.
    }
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be called inside a ThemeProvider");
  }
  return value;
}
