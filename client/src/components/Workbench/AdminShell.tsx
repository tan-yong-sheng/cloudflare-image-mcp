import { useCallback, useEffect, useState } from "react";
import { useAdminKey } from "../../app/admin-key";
import type { Route } from "../../app/hash-route";
import { LogoutButton, ThemeToggleButton } from "../AppHeader";
import { AdminView } from "./AdminView";
import { ApiKeysPage } from "./ApiKeysPage";
import { adminRefusal, gateErrorFor } from "./admin-gate";
import { UnlockGate } from "./UnlockGate";

type AdminRoute = Extract<Route, "admin" | "admin-api-keys">;

/** One administrative space. A new space is one entry here. */
interface AdminSpace {
  route: AdminRoute;
  label: string;
  icon: string;
  hash: string;
  badge?: number;
}

/** A navigation group that contains related spaces. */
interface AdminNavGroup {
  name: string;
  icon: string;
  spaces: AdminSpace[];
}

/**
 * The navigation groups for the admin sidebar.
 *
 * Groups are ordered by workflow: Generate (model configuration),
 * Manage (keys and operations), Configure (settings and deployment).
 * Group headers are not rendered; only the space items are shown.
 */
const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    name: "Generate",
    icon: "fa-wand-magic-sparkles",
    spaces: [
      {
        route: "admin",
        label: "Provider credentials",
        icon: "fa-server",
        hash: "#admin",
      },
    ],
  },
  {
    name: "Manage",
    icon: "fa-sliders",
    spaces: [
      {
        route: "admin-api-keys",
        label: "API keys",
        icon: "fa-key",
        hash: "#admin/api-keys",
        badge: 0, // Dynamic count can be added later
      },
    ],
  },
  {
    name: "Configure",
    icon: "fa-gear",
    spaces: [
      // Future: settings, deployment, etc.
    ],
  },
];

/** The heading each space owns, focused when the space opens. */
const CONTENT_HEADINGS: Record<AdminRoute, string> = {
  admin: "adminViewTitle",
  "admin-api-keys": "apiKeysTitle",
};

/**
 * The administrative area.
 *
 * The playground is the product and keeps its own header; this shell
 * belongs to the operator screens only. It owns the full-height collapsible
 * sidebar navigation (w-16 when collapsed, w-56 to w-60 when expanded),
 * the one management-key gate, and the lock/theme/logout controls that
 * sit in the main header.
 *
 * The gate lives here rather than in each screen for one reason: moving
 * between Provider credentials and API keys is one session, so one gate
 * covers the area and a 403 re-shows it from one place. The screens
 * assume a session and ask for nothing before the key is in hand.
 *
 * The main content container maintains the max-w-6xl (1152px) width
 * budget, while the sidebar spans the full height of the viewport with
 * an on-border toggle button.
 */
export function AdminShell({ route }: { route: AdminRoute }) {
  const { adminKey, unlock, lock } = useAdminKey();
  const [gateError, setGateError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const unlocked = adminKey !== null;

  // A page says the gate refused it. The session is over, so the shell
  // locks and explains itself on the gate — an error the operator cannot
  // see is not one they can act on.
  const reportGateRefusal = useCallback(
    (failure: unknown) => {
      const refusal = adminRefusal(failure);
      lock();
      setGateError(
        refusal
          ? gateErrorFor(refusal)
          : failure instanceof Error
            ? failure.message
            : String(failure)
      );
    },
    [lock]
  );

  const handleLock = useCallback(() => {
    // The provider owns the teardown: it drops the key and the cached
    // payloads together. The screen closes its own drawer: the key going
    // away is the signal it watches.
    lock();
    setGateError(null);
  }, [lock]);

  // Moving between spaces must not leave focus on the nav item; the
  // operator's next Tab should start from the screen they just opened.
  // A heading inside the locked panel is skipped: focusing an element in
  // a hidden subtree does nothing and would strand focus on the rail.
  useEffect(() => {
    const heading = document.getElementById(CONTENT_HEADINGS[route]);
    if (!heading || heading.closest(".hidden")) return;
    heading.focus();
    setMobileMenuOpen(false);
  }, [route, unlocked]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div
      id="adminShell"
      className="flex flex-col md:flex-row min-h-screen w-full bg-background text-text overflow-x-hidden relative"
    >
      {/* Mobile Drawer Backdrop Scrim */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
          aria-hidden="true"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Full-height Collapsible Sidebar / Mobile Drawer */}
      <nav
        id="adminNav"
        aria-label="Administration"
        className={`fixed md:sticky top-0 bottom-0 left-0 h-screen flex flex-col flex-shrink-0 border-r border-border bg-[var(--card-bg)] transition-all duration-300 z-50 ${
          mobileMenuOpen
            ? "translate-x-0 shadow-2xl"
            : "-translate-x-full md:translate-x-0"
        } ${sidebarCollapsed ? "md:w-20" : "w-72 md:w-56 lg:w-60"}`}
      >
        {/*
          A skip link has to be a link, but the router owns the hash:
          following `#adminContent` would land on the generator, because
          an unknown fragment is not an admin route. The click is
          intercepted and focus moved instead, which is what the skip
          link was for.
        */}
        <a
          id="adminSkipLink"
          href="#adminContent"
          className="absolute -top-96 left-4 z-50 rounded bg-[var(--primary)] px-4 py-3 min-h-[48px] h-12 text-white whitespace-nowrap focus:top-4 transition-[top] flex items-center justify-center text-sm font-medium"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("adminContent")?.focus();
            setMobileMenuOpen(false);
          }}
        >
          Skip to content
        </a>

        {/* Brand Header */}
        <div
          className={`flex items-center justify-between px-3 py-4 border-b border-border/60 mb-2 ${
            sidebarCollapsed ? "md:justify-center" : ""
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-shield-halved text-sm" />
            </div>
            {(!sidebarCollapsed || mobileMenuOpen) && (
              <div className="flex flex-col min-w-0 overflow-hidden">
                <span className="text-sm font-bold truncate">Admin</span>
                <span className="text-[11px] text-text-light truncate">
                  Control Console
                </span>
              </div>
            )}
          </div>

          {/* Mobile Close Button */}
          <button
            type="button"
            className="md:hidden flex items-center justify-center w-10 h-10 min-h-[44px] min-w-[44px] rounded-lg text-text-light hover:text-text hover:bg-[var(--secondary)] transition-colors"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <i className="fa-solid fa-xmark text-lg" />
          </button>

          {/* Desktop Rail Toggle */}
          <button
            type="button"
            className={`hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-text-light hover:text-text hover:bg-[var(--secondary)] transition-colors ${
              sidebarCollapsed ? "hidden" : ""
            }`}
            onClick={() => setSidebarCollapsed(true)}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <i className="fa-solid fa-chevron-left text-xs" />
          </button>
        </div>

        {/* Desktop Expand Button when collapsed */}
        {sidebarCollapsed && (
          <div className="hidden md:flex justify-center mb-2 px-2">
            <button
              type="button"
              className="flex items-center justify-center w-10 h-10 rounded-lg text-text-light hover:text-text hover:bg-[var(--secondary)] transition-colors"
              onClick={() => setSidebarCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <i className="fa-solid fa-chevron-right text-xs" />
            </button>
          </div>
        )}

        {/* Back to Playground */}
        <div className="px-2 mb-2">
          <a
            id="adminNavPlayground"
            href="#"
            className={`flex items-center min-h-[48px] h-12 px-3 py-3 rounded-lg text-sm text-text-light hover:text-text hover:bg-[var(--secondary)] transition-colors duration-150 ${
              sidebarCollapsed ? "md:justify-center" : "gap-3"
            }`}
            aria-label="Back to the playground"
            title="Back to the playground"
            onClick={() => setMobileMenuOpen(false)}
          >
            <i className="fa-solid fa-arrow-left flex-shrink-0 w-4 text-center" />
            <span className={sidebarCollapsed ? "md:hidden" : ""}>
              Playground
            </span>
          </a>
        </div>

        {/* Section Divider */}
        <div className="mx-3 my-1 border-t border-border/60" />

        {/* Admin Spaces - Flat list of items */}
        <div
          id="adminNavSpaces"
          className={`flex flex-col gap-1 px-2 flex-1 overflow-y-auto${unlocked ? "" : " hidden"}`}
        >
          {ADMIN_NAV_GROUPS.flatMap((group) =>
            group.spaces.map((space) => {
              const active = space.route === route;
              return (
                <a
                  key={space.route}
                  id={`adminNav-${space.route}`}
                  href={space.hash}
                  aria-current={active ? "page" : undefined}
                  title={space.label}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center min-h-[48px] h-12 px-3 py-3 rounded-lg text-sm transition-colors duration-150 relative ${
                    sidebarCollapsed ? "md:justify-center" : "gap-3"
                  } ${
                    active
                      ? "font-medium text-primary dark:text-primary-light bg-[rgba(var(--primary-rgb),0.12)]"
                      : "text-text-light hover:text-text hover:bg-[var(--secondary)]"
                  }`}
                >
                  {active && (!sidebarCollapsed || mobileMenuOpen) && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r" />
                  )}
                  <i
                    className={`fa-solid ${space.icon} flex-shrink-0 w-4 text-center ${
                      active
                        ? "text-primary dark:text-primary-light"
                        : "opacity-80"
                    }`}
                  />
                  <span
                    className={`flex-1 truncate ${sidebarCollapsed ? "md:hidden" : ""}`}
                  >
                    {space.label}
                  </span>
                  {space.badge !== undefined &&
                    space.badge > 0 &&
                    (!sidebarCollapsed || mobileMenuOpen) && (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary dark:text-primary-light">
                        {space.badge}
                      </span>
                    )}
                </a>
              );
            })
          )}
        </div>

        {/* Bottom utility: Lock admin session */}
        <div className="p-2 border-t border-border/60 mt-auto">
          <button
            id="adminLock"
            type="button"
            className={`w-full flex items-center min-h-[48px] h-12 px-3 py-3 rounded-lg text-sm text-text-light hover:text-text hover:bg-[var(--secondary)] transition-colors duration-150 ${
              sidebarCollapsed ? "md:justify-center" : "gap-3"
            }${unlocked ? "" : " hidden"}`}
            aria-label="Lock the administrative area"
            title="Lock administration session"
            onClick={() => {
              setMobileMenuOpen(false);
              handleLock();
            }}
          >
            <i className="fa-solid fa-lock flex-shrink-0 w-4 text-center" />
            {(!sidebarCollapsed || mobileMenuOpen) && <span>Lock</span>}
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-background">
        {/* Top Navbar */}
        <header className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-border bg-[var(--background)] sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Trigger */}
            <button
              type="button"
              className="md:hidden flex items-center justify-center w-10 h-10 min-h-[44px] min-w-[44px] rounded-lg text-text hover:bg-[var(--secondary)] transition-colors border border-border"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="adminNav"
            >
              <i className="fa-solid fa-bars text-base" />
            </button>

            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-lg sm:text-xl font-bold truncate">
                Cloudflare Image MCP
              </span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary dark:text-primary-light border border-primary/20 whitespace-nowrap">
                Administration
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <ThemeToggleButton id="themeToggleAdmin" />
            <LogoutButton id="logoutButtonAdmin" />
          </div>
        </header>

        {/* Main Content Container */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <div className="max-w-6xl mx-auto w-full">
            <div id="adminContent" className="min-w-0" tabIndex={-1}>
              {route === "admin" ? (
                <AdminView onGateRefusal={reportGateRefusal} />
              ) : (
                <ApiKeysPage onGateRefusal={reportGateRefusal} />
              )}

              <UnlockGate
                key={unlocked ? "unlocked" : "locked"}
                hidden={unlocked}
                error={gateError}
                onUnlock={(key) => {
                  setGateError(null);
                  unlock(key);
                }}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
