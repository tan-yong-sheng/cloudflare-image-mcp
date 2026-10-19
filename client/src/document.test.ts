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

  it("references no file outside the served build output", () => {
    // The Worker serves the build output from /assets/ before the auth
    // gate. A root-absolute reference to anything else — an image in a
    // public directory, a stray stylesheet — is answered by the Worker
    // as an API path: with API keys configured it answers 401, which
    // reads as a credential problem. The only root-absolute reference
    // the source document may carry is the Vite entry, which the build
    // rewrites into a hashed file under /assets/.
    const references = [
      ...document.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g),
    ].map((match) => match[1]);

    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      if (!reference.startsWith("/")) continue;
      expect(reference, reference).toMatch(/^\/src\//);
    }
  });
});
