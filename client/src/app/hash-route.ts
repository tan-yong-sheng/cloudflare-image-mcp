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
    const onHashChange = () =>
      setRoute(parseRoute(window.location.hash, window.location.pathname));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}
