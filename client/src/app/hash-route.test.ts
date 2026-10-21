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

  it("keeps the generator everywhere else", () => {
    expect(parseRoute("")).toBe("generator");
    expect(parseRoute("", "/")).toBe("generator");
    expect(parseRoute("#generate", "/")).toBe("generator");
  });
});
