import { describe, expect, it } from "vitest";
import { parseRoute } from "./hash-route";

/**
 * The route.
 *
 * The legacy shell compared the fragment exactly: `#admin` was the
 * workbench and nothing else. The `/admin` path was an entry alias that
 * the shell adopted the fragment for.
 */

describe("the route", () => {
  it("opens the workbench on the admin fragment", () => {
    expect(parseRoute("#admin")).toBe("admin");
  });

  it("keeps a fragment that merely starts with admin on the generator", () => {
    expect(parseRoute("#administrator")).toBe("generator");
    expect(parseRoute("#admin-panel")).toBe("generator");
  });

  it("opens the workbench on the admin path", () => {
    expect(parseRoute("", "/admin")).toBe("admin");
    expect(parseRoute("", "/admin/")).toBe("admin");
  });

  it("opens the API-keys page on its fragment", () => {
    expect(parseRoute("#admin/api-keys")).toBe("admin-api-keys");
  });

  it("opens the API-keys page on its path", () => {
    expect(parseRoute("", "/admin/api-keys")).toBe("admin-api-keys");
    expect(parseRoute("", "/admin/api-keys/")).toBe("admin-api-keys");
  });

  it("keeps a deeper admin fragment on the generator route", () => {
    // The path decides nothing once the fragment names a route: an
    // unknown admin fragment is not the workbench by another name.
    expect(parseRoute("#admin/keys")).toBe("generator");
  });

  it("does not let an unknown fragment reopen the path's admin screen", () => {
    // The fragment and the path are two claims about the route. When the
    // fragment makes one — even an unknown one — it is the one that wins,
    // so a stale or hand-edited hash cannot be rescued by the entry path
    // into a screen the fragment did not name.
    expect(parseRoute("#admin/keys", "/admin")).toBe("generator");
    expect(parseRoute("#admin/keys", "/admin/api-keys")).toBe("generator");
    expect(parseRoute("#generate", "/admin/api-keys")).toBe("generator");
  });

  it("lets the path decide only while the fragment is empty", () => {
    expect(parseRoute("", "/admin")).toBe("admin");
    expect(parseRoute("", "/admin/api-keys")).toBe("admin-api-keys");
  });

  it("keeps the generator everywhere else", () => {
    expect(parseRoute("")).toBe("generator");
    expect(parseRoute("", "/")).toBe("generator");
    expect(parseRoute("#generate", "/")).toBe("generator");
  });
});
