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
