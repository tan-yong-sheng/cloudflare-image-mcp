import { describe, expect, it } from "vitest";
import { MAX_WEIGHT as SERVER_MAX_WEIGHT } from "../../../workers/src/services/admin-store";
import { MAX_WEIGHT } from "./limits";

/**
 * The scheduling weight ceiling.
 *
 * The server rejects a weight above its ceiling, so the client must not
 * offer one. The two are separate constants in separate packages, and a
 * silent drift would let the operator type a weight the server refuses.
 */
describe("the weight ceiling", () => {
  it("matches the server's ceiling", () => {
    expect(MAX_WEIGHT).toBe(SERVER_MAX_WEIGHT);
  });
});
