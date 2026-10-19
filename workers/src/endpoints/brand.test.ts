// ============================================================================
// Brand asset tests - the inlined provider marks
// ============================================================================
// Seam: the exported data URI and the HTML the Worker serves. A brand mark
// is a trademark artifact, so the test pins the exact bytes: the asset
// must stay the vendor's own file (not a re-drawn lookalike), it must stay
// inline (no new third-party origin on the credential surface), and it
// must be a real PNG the browser can decode.

import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { getFrontendHTML } from "./frontend.js";
import { AGNES_LOGO_DATA_URI } from "../config/brand.js";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Decode the data URI to raw PNG bytes; fails the test if the shape is wrong. */
function decodeDataUri(uri: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(uri);
  expect(match, "data URI must be a base64 PNG").not.toBeNull();
  const bytes = Buffer.from(match![1], "base64");
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_MAGIC);
  return bytes;
}

describe("brand assets", () => {
  test("the Agnes mark is a decodable PNG of the right size", () => {
    const bytes = decodeDataUri(AGNES_LOGO_DATA_URI);

    // IHDR width/height, big-endian, at offset 16/20.
    expect(bytes.readUInt32BE(16)).toBe(120);
    expect(bytes.readUInt32BE(20)).toBe(120);
  });

  test("the Agnes mark is the vendor's own file, byte-for-byte", () => {
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

  test("the mark is inlined, not fetched from a third-party origin", () => {
    const html = getFrontendHTML();

    // The workbench is where operators manage provider keys. A
    // vendor-hosted logo request there would leak an operator visit to
    // that vendor and break the panel if the asset moved, so the mark is
    // inlined as a data URI.
    //
    // The guard is on every origin, not on one hostname: a hotlink to any
    // other host would leak just as much. The page's only external
    // requests are the two stylesheet CDNs it has always loaded, so any
    // other absolute URL in the markup is a new origin and fails here.
    const offOrigin = [...html.matchAll(/https?:\/\/[^\s"'()<>]+/g)]
      .map((match) => match[0])
      .filter(
        (url) =>
          !url.startsWith("https://cdn.jsdelivr.net/") &&
          !url.startsWith("https://cdnjs.cloudflare.com/")
      );

    expect(offOrigin).toEqual([]);
    expect(html).toContain(AGNES_LOGO_DATA_URI);
  });

  test("the family rail renders the mark as an image, not a text glyph", () => {
    const html = getFrontendHTML();

    // The Agnes family used a neutral Font Awesome wand. It now gets the
    // vendor's own app icon, inlined as a data URI.
    expect(html).toMatch(/FAMILY_LOGOS = \{[^}]*agnes/);
    expect(html).toContain("img.className = 'family-mark mr-2';");
    // Agnes must not also sit in the glyph table, or the rail would keep
    // rendering a wand for it.
    const glyphs = /FAMILY_ICONS = \{([^}]*)\}/.exec(html);
    expect(glyphs).not.toBeNull();
    expect(glyphs![1]).not.toContain("agnes");
    // Cloudflare still uses the Font Awesome brand mark it ships in. The
    // class is asserted, not the whole table, so adding a third
    // Font Awesome family later does not break this.
    expect(glyphs![1]).toContain("fa-brands fa-cloudflare");
  });

  test("the mark is decorative: it carries no accessible name", () => {
    const html = getFrontendHTML();

    // The family name is always rendered as text next to the mark, so the
    // mark is aria-hidden and its alt is empty. A screen reader must not
    // announce the logo twice.
    expect(html).toContain("img.alt = '';");
    expect(html).toContain("img.setAttribute('aria-hidden', 'true');");
  });

  test("every mark is followed by the family name as text", () => {
    const html = getFrontendHTML();

    // The mark carries no accessible name, so the name beside it is the
    // only thing identifying the family. This suite has no DOM, so the
    // guarantee is pinned structurally: every call site of familyIcon()
    // appends the mark and then the name, and the number of such call
    // sites must equal the number of adjacency matches. A new call site
    // that forgot the name would make the two counts diverge.
    const callSites = (html.match(/familyIcon\(/g) ?? []).length - 1; // minus the definition
    const withName = (
      html.match(
        /const icon = familyIcon\([^)]*\);\s*if \(icon\) \w+\.appendChild\(icon\);\s*\w+\.appendChild\(document\.createTextNode\(/g
      ) ?? []
    ).length;

    expect(callSites).toBe(2);
    expect(withName).toBe(callSites);
  });
});
