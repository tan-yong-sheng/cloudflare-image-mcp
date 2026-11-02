import { useEffect, useState } from "react";

export type Route = "generator" | "admin" | "admin-api-keys";

/**
 * The fragments an entry path adopts.
 *
 * Each admin screen has one addressable path so an operator can bookmark
 * it; the path only decides the route on the way in, and the fragment
 * owns it from then on.
 */
const ENTRY_FRAGMENTS: Record<string, string> = {
  "/admin": "#admin",
  "/admin/api-keys": "#admin/api-keys",
};

/** The fragment an entry path adopts, or null when the path owns no route. */
function entryFragment(pathname: string): string | null {
  return ENTRY_FRAGMENTS[pathname.replace(/\/+$/, "")] ?? null;
}

/** The route a path names on entry. */
function routeForPath(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/admin") return "admin";
  if (path === "/admin/api-keys") return "admin-api-keys";
  return "generator";
}

/**
 * The legacy shell's hash routing, kept.
 *
 * The legacy page switched views on `location.hash`, and `/admin` was a
 * path the Worker routed to the same shell. Hash routing needs no
 * server-side fallback: every route the client owns is the same
 * document, so a static asset can serve all of them. The `/admin` and
 * `/admin/api-keys` paths are still honoured, so an operator who
 * bookmarked either one lands where they expect.
 *
 * The path only decides the route on the way in. Once the shell has
 * adopted the fragment, the hash alone owns the route — otherwise the
 * path would keep pinning the workbench open and the Back button, which
 * clears the hash, could never leave it.
 */
export function parseRoute(hash: string, pathname = ""): Route {
  // The legacy shell matched the fragment exactly: `#admin` was the
  // workbench and nothing else. A longer fragment that merely starts
  // with "admin" is a different route and stays on the generator.
  const fragment = hash.replace(/^#/, "");
  if (fragment === "admin") return "admin";
  if (fragment === "admin/api-keys") return "admin-api-keys";
  // A named fragment the router does not know is the hash's answer, not an
  // invitation to fall back to the path: the path decides the route only on
  // the way in, and a hash that carries a route has already been adopted. So
  // only an empty fragment lets the path speak, and `#admin/keys` on
  // `/admin/api-keys` lands on the generator rather than reopening an admin
  // screen the fragment did not name.
  return fragment === "" ? routeForPath(pathname) : "generator";
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.hash, window.location.pathname)
  );

  useEffect(() => {
    // The legacy shell adopted the fragment on the `/admin` path and
    // routed on the hash alone from then on. Keep that: the path stays
    // the screen's addressable path, and the hash becomes the single
    // source of the route, so Back can leave the workbench.
    //
    // Adoption only happens on an empty fragment: a reload of a page
    // opened by hash (`/admin#admin/api-keys`) already names its route,
    // and rewriting it from the path would drop the operator on whichever
    // screen the path pointed at, not the one they were on.
    const fragment = entryFragment(window.location.pathname);
    if (fragment && window.location.hash === "") {
      window.history.replaceState(
        null,
        "",
        window.location.pathname.replace(/\/+$/, "") + fragment
      );
    }
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    // The legacy shell listened to both. A history navigation that
    // changes only the path fires no hash change, and the route would
    // otherwise stay where it was.
    window.addEventListener("popstate", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, []);

  return route;
}
