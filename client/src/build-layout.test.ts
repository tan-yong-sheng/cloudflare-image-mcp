import { describe, expect, it } from "vitest";
import { CLIENT_ASSET_DIR } from "../../workers/src/routes";
import config from "../vite.config";

/**
 * The client's build layout.
 *
 * The Worker serves the build output from /assets/ before the auth
 * gate, so the directory the build writes into is a contract between
 * the two packages. This test reads the effective configuration rather
 * than the source text: a commented-out value cannot satisfy it, and
 * the value that is in effect is the one that is checked.
 *
 * The Worker's dev-config test pins the same contract from its side.
 * The two packages cannot import each other's build output — the
 * Worker's compiler is rooted in its own source tree — so the contract
 * is held by both sides checking the same shared constant.
 */

describe("the client's build layout", () => {
  it("writes the build output into the directory the Worker serves", () => {
    expect(config.build?.assetsDir).toBe(CLIENT_ASSET_DIR);
  });

  it("publishes no public directory", () => {
    // Vite copies a public directory to the root of the build output.
    // The Worker only serves /assets/ before the auth gate, so a file
    // there would be answered as an API path: with API keys configured
    // it answers 401, which reads as a credential problem.
    expect(config.publicDir).toBe(false);
  });
});
