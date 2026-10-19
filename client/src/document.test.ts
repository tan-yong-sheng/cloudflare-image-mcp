import { describe, expect, it } from "vitest";
import document from "../index.html?raw";

describe("the client's document", () => {
  it("declares an icon so the browser never asks the Worker for one", () => {
    // Without a declared icon the browser requests /favicon.ico, and the
    // Worker's auth gate answers that with a 401 on every page load.
    expect(document).toMatch(/<link[^>]+rel="icon"/);
  });

  it("keeps the icon inline", () => {
    // An external icon would add a third-party origin to a page that
    // otherwise loads nothing but its own bundle. The href has to be a
    // data URI; the SVG namespace inside it is an identifier, never a
    // request.
    const href =
      /<link[^>]+rel="icon"[^>]*href="([^"]*)"/.exec(document)?.[1] ?? "";
    expect(href.startsWith("data:")).toBe(true);
  });
});
