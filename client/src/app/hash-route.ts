import { useEffect, useState } from "react";

export type Route = "generator" | "admin";

/**
 * The legacy shell's hash routing, kept.
 *
 * The legacy page switched views on `location.hash`, and `/admin` was a
 * path the Worker routed to the same shell. Hash routing needs no
 * server-side fallback: every route the client owns is the same
 * document, so a static asset can serve all of them. The `/admin` path
 * is still honoured, so an operator who bookmarked it lands in the
 * workbench.
 *
 * The path only decides the route on the way in. Once the shell has
 * adopted the fragment, the hash alone owns the route — otherwise the
 * path would keep pinning the workbench open and the Back button, which
 * clears the hash, could never leave it.
 */
export function parseRoute(hash: string, pathname = ""): Route {
  if (hash.replace(/^#/, "").startsWith("admin")) return "admin";
  if (pathname.replace(/\/+$/, "") === "/admin") return "admin";
  return "generator";
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.hash, window.location.pathname)
  );

  useEffect(() => {
    // The legacy shell adopted the fragment on the `/admin` path and
    // routed on the hash alone from then on. Keep that: the path stays
    // the workbench's addressable path, and the hash becomes the single
    // source of the route, so Back can leave the workbench.
    if (
      window.location.pathname.replace(/\/+$/, "") === "/admin" &&
      window.location.hash !== "#admin"
    ) {
      window.history.replaceState(null, "", "/admin#admin");
    }
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}
