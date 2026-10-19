import { useEffect, useState } from "react";

export type Route = "generator" | "admin";

/**
 * The legacy page switched views on `location.hash`. Hash routing keeps
 * that contract and needs no server-side fallback: every route the client
 * owns is the same document, so a static asset can serve all of them.
 */
export function parseRoute(hash: string): Route {
  return hash.replace(/^#/, "").startsWith("admin") ? "admin" : "generator";
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.hash)
  );

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}
