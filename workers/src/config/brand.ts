// ============================================================================
// Provider brand marks
// ============================================================================
// Marks shown next to a provider family name in the credentials workbench.
//
// Cloudflare ships a brand mark in Font Awesome, so it needs no asset. Agnes
// ships an app icon (a blue rounded square) as the leading mark of its
// wordmark image; the raster is inlined as a data URI so the mark adds no
// new third-party origin. The workbench is the credential surface, and a
// vendor-hosted request there would both leak an operator visit to that
// vendor and break the panel if the asset moved.
//
// Source: https://agnes-ai.com/images/new-logo.png — the 120x120 app icon at
// the left of the wordmark, unmodified. It identifies the provider.

/** The Agnes app icon as an inline `data:` URI, ready for an `<img src>`. */
export const AGNES_LOGO_DATA_URI =
  "data:image/png;base64," +
  "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" +
  "SUVORK5CYII=";
