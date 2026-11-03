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
}

/**
 * The spaces the rail lists.
 *
 * Provider credentials comes first because it is the screen an operator
 * opens to fix a broken pool; the caller keys are read after that.
 */
const ADMIN_SPACES: AdminSpace[] = [
  {
    route: "admin",
    label: "Provider credentials",
    icon: "fa-server",
    hash: "#admin",
  },
  {
    route: "admin-api-keys",
    label: "API keys",
    icon: "fa-key",
    hash: "#admin/api-keys",
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
 * belongs to the operator screens only. It owns the spaces rail, the one
 * management-key gate, and the lock/theme/logout controls that used to be
 * duplicated into each screen's header.
 *
 * The gate lives here rather than in each screen for one reason: moving
 * between Provider credentials and API keys is one session, so one gate
 * covers the area and a 403 re-shows it from one place. The screens
 * assume a session and ask for nothing before the key is in hand.
 *
 * The shell owns the width constraint, not the pages. The issue's width
 * math counts the rail inside the same 1152px the screens already used
 * (at 1301px: `max-w-6xl`, a 256px family rail, ~800px of key table,
 * ~730px once the sidebar takes its 190px). Keeping the container on the
 * pages as well would put the rail outside that 1152px and double the
 * padding, so the pages drop theirs.
 */
export function AdminShell({ route }: { route: AdminRoute }) {
  const { adminKey, unlock, lock } = useAdminKey();
  const [gateError, setGateError] = useState<string | null>(null);

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
      <div className="flex flex-col md:flex-row gap-6">
        <nav
          id="adminNav"
          aria-label="Administration"
          className="card p-2 flex flex-row flex-wrap md:flex-col gap-1 md:w-14 lg:w-[220px] flex-shrink-0 md:self-start"
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

          <a
            id="adminNavPlayground"
            href="#"
            className="flex items-center justify-center md:justify-start gap-2 p-2 rounded border border-transparent text-sm hover:bg-[rgba(var(--primary-rgb),.05)]"
            aria-label="Back to the playground"
          >
            <i className="fa-solid fa-arrow-left flex-shrink-0" />
            <span className="md:sr-only lg:not-sr-only">Playground</span>
          </a>

          <p className="hidden lg:block text-xs uppercase tracking-wide text-muted px-2 pt-2">
            Administration
          </p>

          {ADMIN_SPACES.map((space) => {
            const active = space.route === route;
            return (
              <a
                key={space.route}
                id={`adminNav-${space.route}`}
                href={space.hash}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-center md:justify-start gap-2 p-2 rounded border text-sm ${
                  active ? "font-medium" : ""
                }`}
                style={{
                  borderColor: active ? "var(--primary)" : "transparent",
                  backgroundColor: active ? "rgba(var(--primary-rgb),.08)" : "",
                }}
              >
                <i className={`fa-solid ${space.icon} flex-shrink-0`} />
                <span className="md:sr-only lg:not-sr-only">{space.label}</span>
              </a>
            );
          })}

          <div className="flex flex-row md:flex-col gap-1 md:mt-auto md:pt-2 md:border-t md:border-gray-700">
            <button
              id="adminLock"
              type="button"
              className={`btn btn-secondary p-2 h-12 w-12 flex items-center justify-center${
                unlocked ? "" : " hidden"
              }`}
              aria-label="Lock the administrative area"
              onClick={handleLock}
            >
              <i className="fa-solid fa-lock" />
            </button>
            <ThemeToggleButton id="themeToggleAdmin" />
            <LogoutButton id="logoutButtonAdmin" />
          </div>
        </nav>

        <div id="adminContent" className="flex-1 min-w-0" tabIndex={-1}>
          {route === "admin" ? (
            <AdminView onGateRefusal={reportGateRefusal} />
          ) : (
            <ApiKeysPage onGateRefusal={reportGateRefusal} />
          )}
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
    </div>
  );
}
