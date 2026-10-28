// ============================================================================
// The API routes the client calls
// ============================================================================
// The React client and the Worker are separate packages that must agree
// on the paths they share. These constants are the agreement: both sides
// import them, so a rename on one side fails the other at build time
// rather than at runtime, on a request an operator made.
//
// The module holds nothing but the paths, so importing it from the
// client costs no runtime weight and pulls in no Worker code.

/** The credential pool's health payload. */
export const ADMIN_HEALTH_PATH = "/api/admin/health";

/** The collection the key mutations are written to. */
export const ADMIN_KEYS_PATH = "/api/admin/keys";

/** The public model registry the picker reads. */
export const INTERNAL_MODELS_PATH = "/api/internal/models";

/**
 * The directory the client's build output is served under.
 *
 * Vite writes the bundle, the stylesheet and the icon fonts into
 * `build.assetsDir` and references them from the document, so the name
 * is part of the contract between the client build and the Worker: the
 * Worker serves that directory under the prefix below, before the auth
 * gate, because the build output is public.
 *
 * The client's build config names the same directory as a literal, and
 * the contract tests on both sides pin the two together. A literal in
 * the client config is what the tests can check; an import would make
 * the check compare a value with itself.
 */
export const CLIENT_ASSET_DIR = "assets";

/** The URL prefix the client's build output is served under. */
export const CLIENT_ASSET_PREFIX = `/${CLIENT_ASSET_DIR}/`;
