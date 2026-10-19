import { useAuth } from "../app/auth";
import { useTheme } from "../app/theme";

/**
 * The header controls the legacy page carried in two headers. They are
 * separate components rather than one configurable one because the two
 * headers place them differently and the DOM ids are a preserved
 * contract: `themeToggle`/`logoutButton` on the generator, and
 * `themeToggleAdmin`/`logoutButtonAdmin` on the workbench.
 */

export function ThemeToggleButton({ id }: { id: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      id={id}
      type="button"
      className="btn btn-secondary p-2 h-10 w-10 flex items-center justify-center"
      aria-label="Toggle dark theme"
      onClick={toggleTheme}
    >
      <i
        className={theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon"}
      />
    </button>
  );
}

export function LogoutButton({ id }: { id: string }) {
  const { isAuthenticated, logout } = useAuth();
  return (
    <button
      id={id}
      type="button"
      className={`btn btn-secondary p-2 h-10 flex items-center justify-center${
        isAuthenticated ? "" : " hidden"
      }`}
      aria-label="Logout"
      onClick={logout}
    >
      <i className="fa-solid fa-sign-out-alt mr-2" />
      Logout
    </button>
  );
}

export function AdminWorkbenchButton() {
  const { isAuthenticated } = useAuth();
  return (
    <button
      id="adminWorkbenchButton"
      type="button"
      className={`btn btn-secondary p-2 h-10 flex items-center justify-center${
        isAuthenticated ? "" : " hidden"
      }`}
      aria-label="Manage provider credentials"
      onClick={() => {
        window.location.hash = "#admin";
      }}
    >
      <i className="fa-solid fa-key mr-2" />
      Admin
    </button>
  );
}
