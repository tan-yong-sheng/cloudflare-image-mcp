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
 * belongs to the operator screens only. It owns the grouped sidebar
 * navigation, the one management-key gate, and the lock/theme/logout
 * controls that used to be duplicated into each screen's header.
 *
 * The gate lives here rather than in each screen for one reason: moving
 * between Provider credentials and API keys is one session, so one gate
 * covers the area and a 403 re-shows it from one place. The screens
 * assume a session and ask for nothing before the key is in hand.
 *
 * The shell owns the width constraint, not the pages. The sidebar uses
 * the same width budget as before (w-52 to w-56, ~208-224px), keeping
 * the total container at max-w-6xl (1152px). Pages drop their own
 * padding to avoid double-counting.
 */
export function AdminShell({ route }: { route: AdminRoute }) {
  const { adminKey, unlock, lock } = useAdminKey();
  const [gateError, setGateError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
  }, [route, unlocked]);

  return (
    <div id="adminShell" className="container mx-auto px-4 py-4 max-w-6xl">
      {/* Top Navbar: Brand and global utility actions (Lock, Theme Toggle, Logout) */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <i className="fa-solid fa-shield-halved text-base" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">Cloudflare Image MCP</span>
            <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              Administration
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="adminLock"
            type="button"
            className={`btn btn-secondary p-2 h-12 flex items-center justify-center${
              unlocked ? "" : " hidden"
            }`}
            aria-label="Lock the administrative area"
            title="Lock administration session"
            onClick={handleLock}
          >
            <i className="fa-solid fa-lock mr-2" />
            Lock
          </button>
          <ThemeToggleButton id="themeToggleAdmin" />
          <LogoutButton id="logoutButtonAdmin" />
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-6 min-h-screen">
        <nav
          id="adminNav"
          aria-label="Administration"
          className={`card p-2 flex flex-row flex-wrap md:flex-col gap-1 flex-shrink-0 transition-all duration-300 self-stretch${
            sidebarCollapsed ? "md:w-16" : "md:w-52 lg:w-56"
          }`}
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
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded focus:bg-[var(--primary)] focus:px-3 focus:py-2 focus:text-white"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("adminContent")?.focus();
            }}
          >
            Skip to content
          </a>

          {/* Brand Header */}
          <div className="flex items-center justify-between px-3 py-3 border-b border-gray-700/40 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-shield-halved text-sm" />
              </div>
              <span
                className={`text-sm font-semibold transition-all duration-300 ${sidebarCollapsed ? "hidden" : ""}`}
              >
                Admin
              </span>
            </div>
            <button
              type="button"
              className="p-1.5 rounded hover:bg-gray-800/50 transition-colors text-muted hover:text-text"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <i
                className={`fa-solid ${sidebarCollapsed ? "fa-chevron-right" : "fa-chevron-left"} text-sm`}
              />
            </button>
          </div>

          {/* Back to Playground */}
          <a
            id="adminNavPlayground"
            href="#"
            className={`flex items-center px-3 py-2 rounded-lg text-sm text-muted hover:text-text hover:bg-gray-800/30 transition-all ${
              sidebarCollapsed ? "justify-center" : "gap-3"
            }`}
            aria-label="Back to the playground"
            title="Back to the playground"
          >
            <i className="fa-solid fa-arrow-left flex-shrink-0 w-4 text-center" />
            <span className={sidebarCollapsed ? "hidden" : ""}>Playground</span>
          </a>

          {/* Section Divider */}
          <div className={`my-3 px-3 ${sidebarCollapsed ? "hidden" : ""}`}>
            <div className="h-px bg-gray-700/40" />
          </div>

          {/* Admin Spaces - Flat list of items */}
          <div
            id="adminNavSpaces"
            className={`flex flex-col gap-0.5 px-2${unlocked ? "" : " hidden"}`}
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
                    className={`flex items-center px-3 py-2 rounded-lg text-sm transition-all relative${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    }${
                      active
                        ? " font-medium text-primary"
                        : " text-muted hover:text-text hover:bg-gray-800/30"
                    }`}
                  >
                    {active && !sidebarCollapsed && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r" />
                    )}
                    <i
                      className={`fa-solid ${space.icon} flex-shrink-0 w-4 text-center${active ? "" : " opacity-70"}`}
                    />
                    <span
                      className={`flex-1 ${sidebarCollapsed ? "hidden" : ""}`}
                    >
                      {space.label}
                    </span>
                    {space.badge !== undefined &&
                      space.badge > 0 &&
                      !sidebarCollapsed && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                          {space.badge}
                        </span>
                      )}
                  </a>
                );
              })
            )}
          </div>
        </nav>

        <div id="adminContent" className="flex-1 min-w-0" tabIndex={-1}>
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
    </div>
  );
}
