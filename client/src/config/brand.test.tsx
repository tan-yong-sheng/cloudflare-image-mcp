import { render } from "@testing-library/react";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FamilyMark } from "../components/Workbench/FamilyMark";
import { AGNES_LOGO_DATA_URI } from "./brand";

/**
 * The provider brand marks.
 *
 * A brand mark is a trademark artifact, so the test pins the exact
 * bytes: the asset must stay the vendor's own file (not a re-drawn
 * lookalike), it must stay inline (no third-party origin on the
 * credential surface), and it must be a real PNG the browser can decode.
 *
 * The rendering assertions run against a real DOM, so they check what
 * the operator actually gets rather than what the source says.
 */

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CLIENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Decode the data URI to raw PNG bytes; fails the test if the shape is wrong. */
function decodeDataUri(uri: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(uri);
  expect(match, "data URI must be a base64 PNG").not.toBeNull();
  const bytes = Buffer.from(match![1], "base64");
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_MAGIC);
  return bytes;
}

/** Every file under a directory, recursively. */
function filesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
    } else {
      found.push(path);
    }
  }
  return found;
}

describe("the brand assets", () => {
  it("is a decodable PNG of the right size", () => {
    const bytes = decodeDataUri(AGNES_LOGO_DATA_URI);

    // IHDR width/height, big-endian, at offset 16/20.
    expect(bytes.readUInt32BE(16)).toBe(120);
    expect(bytes.readUInt32BE(20)).toBe(120);
  });

  it("is the vendor's own file, byte-for-byte", () => {
    // The asset is the 120x120 app icon cropped from
    // https://agnes-ai.com/images/new-logo.png, unmodified. Pinning the
    // digest means a re-drawn lookalike, a re-encoded copy, or a silent
    // crop change fails here instead of shipping a wrong or off-brand
    // mark. The digest covers every pixel, so it also stands in for
    // asserting the vendor's brand blue and the white glyph.
    const digest = createHash("sha256")
      .update(decodeDataUri(AGNES_LOGO_DATA_URI))
      .digest("hex");

    expect(digest).toBe(
      "5170c248f3a9f42c15e08016417bca76b6fd476621c449060550fdd9c00b6110"
    );
  });

  it("is rendered as an image, not a text glyph", () => {
    const { container } = render(<FamilyMark providerId="agnes" />);

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe(AGNES_LOGO_DATA_URI);
    // The Agnes family used a neutral Font Awesome wand; it now gets the
    // vendor's own app icon.
    expect(container.querySelector("i")).toBeNull();
  });

  it("keeps Cloudflare's Font Awesome brand mark", () => {
    const { container } = render(<FamilyMark providerId="cloudflare" />);

    const glyph = container.querySelector("i");
    expect(glyph?.className).toContain("fa-brands fa-cloudflare");
    expect(container.querySelector("img")).toBeNull();
  });

  it("is decorative: it carries no accessible name", () => {
    // The family name is always rendered as text next to the mark, so
    // the mark is aria-hidden and its alt is empty. A screen reader must
    // not announce the logo twice.
    const { container } = render(<FamilyMark providerId="agnes" />);

    const image = container.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders nothing for a provider it has no mark for", () => {
    const { container } = render(<FamilyMark providerId="someone-else" />);

    expect(container.innerHTML).toBe("");
  });

  it("does not resolve a provider id through Object.prototype", () => {
    // A provider id such as "constructor" would otherwise resolve
    // through the prototype and take the logo branch with a function
    // value, which the browser would try to load as an image source.
    const { container } = render(<FamilyMark providerId="constructor" />);

    expect(container.innerHTML).toBe("");
  });
});

describe("the client's third-party origins", () => {
  it("loads no asset from a third-party origin", () => {
    // The workbench is where operators manage provider keys. A
    // vendor-hosted asset there would leak an operator visit to that
    // vendor and break the panel if the asset moved.
    //
    // The guard is on every origin, not on one hostname: a hotlink to any
    // other host would leak just as much. The client's only external
    // requests used to be the two stylesheet CDNs the legacy page
    // loaded; the React client bundles Font Awesome instead, so there is
    // nothing left to allow.
    const sources = [
      join(CLIENT_DIR, "index.html"),
      ...filesUnder(join(CLIENT_DIR, "src")).filter((path) =>
        /\.(ts|tsx|css|html)$/.test(path)
      ),
    ];

    const offOrigin: string[] = [];
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(
        /(?:src|href)\s*=\s*["'{]\s*(https?:\/\/[^"'}\s]+)|@import\s+(?:url\()?["']?(https?:\/\/[^"')\s]+)/g
      )) {
        const url = match[1] ?? match[2];
        if (url) offOrigin.push(path + " -> " + url);
      }
    }

    expect(offOrigin).toEqual([]);
  });

  it("bundles Font Awesome from the package, not from a CDN", () => {
    const css = readFileSync(join(CLIENT_DIR, "src", "index.css"), "utf8");

    expect(css).toContain(
      '@import "@fortawesome/fontawesome-free/css/all.min.css"'
    );
    expect(css).not.toMatch(/@import\s+["']?https?:/);
  });
});
