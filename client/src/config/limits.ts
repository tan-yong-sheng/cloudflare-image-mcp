/**
 * The scheduling weight ceiling, mirrored from the server's MAX_WEIGHT.
 *
 * The server rejects a weight above it, so the client must not offer
 * one. A test pins the two together, so a change on either side fails
 * a test on the other.
 */
export const MAX_WEIGHT = 1_000_000;
