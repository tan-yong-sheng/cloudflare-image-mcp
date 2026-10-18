// ============================================================================
// Transport registry + dispatcher tests (C4)
// ============================================================================
// Seam: DispatchingAITransport / TRANSPORT_FACTORIES / assertKnownTransports.
// The fake second transport below is the whole point of the scope decision:
// the seam is proven without shipping a second real provider, so a registry
// entry is the only thing a new provider needs.

import { describe, expect, test, vi } from "vitest";
import {
  assertKnownTransports,
  DispatchingAITransport,
  TRANSPORT_FACTORIES,
  UnknownTransportError,
  type TransportFactory,
} from "./transports.js";
import { ProviderPool } from "./provider-pool.js";
import { ProviderPools } from "./provider-pools.js";
import { OpenAITransport } from "./openai-transport.js";
import type { AITransport } from "./generation-adapters.js";
import { MODEL_CONFIGS } from "../config/models.js";
import type { ModelConfig } from "../types.js";

const TEXT_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const CF = "cloudflare-rest";
const FAKE = "fake-openai";

function pool(apiToken: string): ProviderPool {
  return new ProviderPool(
    [
      {
        label: `k-${apiToken}`,
        accountId: `a-${apiToken}`,
        apiToken,
        weight: 1,
        enabled: true,
      },
    ],
    { source: "d1" }
  );
}

/** Records the token it was built with, so routing is observable. */
function recordingTransport(token: string, calls: string[]): AITransport {
  return {
    async run(modelId) {
      calls.push(`${token}:${modelId}`);
      return { result: { image: "b64" } };
    },
  };
}

function modelWith(inferenceProvider: string): ModelConfig {
  return { ...MODEL_CONFIGS[TEXT_MODEL], inferenceProvider };
}

describe("transport registry", () => {
  test("every configured model names a registered transport", () => {
    // This is the module-init check, asserted as a test so a bad registry
    // edit fails a named case instead of an import-time crash.
    expect(() =>
      assertKnownTransports(
        Object.values(MODEL_CONFIGS).map((m) => m.inferenceProvider)
      )
    ).not.toThrow();
  });

  test("an unregistered key is rejected at load (R2-Q4b)", () => {
    expect(() => assertKnownTransports([CF, "nope"])).toThrow(
      UnknownTransportError
    );
    try {
      assertKnownTransports(["nope"]);
    } catch (error) {
      // The message must name the offending key: it is the only clue in a
      // cold-start failure where no request context exists.
      expect((error as Error).message).toContain("nope");
      expect((error as UnknownTransportError).transport).toBe("nope");
    }
  });

  test("an inherited object property name is not a transport (C4 review)", () => {
    // `"toString" in registry` is true for any object literal, and
    // `registry.toString` is a function, so an `in` check would let a
    // config typo reach dispatch and fail as a TypeError instead.
    expect("toString" in TRANSPORT_FACTORIES).toBe(true);
    for (const inherited of ["toString", "constructor", "valueOf"]) {
      expect(() => assertKnownTransports([inherited])).toThrow(
        UnknownTransportError
      );
    }
  });

  test("the cloudflare entry builds a REST transport from the pool", () => {
    const transport = TRANSPORT_FACTORIES[CF](pool("cf-token"));
    expect(typeof transport.run).toBe("function");
  });

  test("the openai-compat entry builds an OpenAI transport from the pool", () => {
    // The Agnes provider row (migration 0005) is what puts credentials
    // behind this key; the entry itself only binds class and endpoint.
    const transport = TRANSPORT_FACTORIES["openai-compat"](pool("agnes-token"));
    expect(transport).toBeInstanceOf(OpenAITransport);
  });
});

describe("dispatching transport", () => {
  test("routes by the model's inferenceProvider", async () => {
    const calls: string[] = [];
    const factories: Record<string, TransportFactory> = {
      [CF]: (p) => recordingTransport(p.entries()[0].apiToken, calls),
      [FAKE]: (p) => recordingTransport(p.entries()[0].apiToken, calls),
    };
    const pools = new ProviderPools([
      { providerId: "cloudflare", transport: CF, pool: pool("cf-token") },
      { providerId: "fake", transport: FAKE, pool: pool("fake-token") },
    ]);
    const dispatcher = new DispatchingAITransport({
      factories,
      poolFor: (t) => pools.forTransport(t),
    });

    await dispatcher.run(TEXT_MODEL, {}, modelWith(FAKE));
    await dispatcher.run(TEXT_MODEL, {}, modelWith(CF));

    // Each transport got its own provider's credentials, not a shared bag.
    expect(calls).toEqual([
      `fake-token:${TEXT_MODEL}`,
      `cf-token:${TEXT_MODEL}`,
    ]);
  });

  test("an unknown key is a typed error at request time", async () => {
    const dispatcher = new DispatchingAITransport({
      factories: { [CF]: () => recordingTransport("x", []) },
      poolFor: () => pool("cf-token"),
    });
    await expect(
      dispatcher.run(TEXT_MODEL, {}, modelWith("typo-rest"))
    ).rejects.toThrow(UnknownTransportError);
    // An inherited name is not a factory either, even though the pool
    // resolves: dispatch must refuse it the same way.
    await expect(
      dispatcher.run(TEXT_MODEL, {}, modelWith("toString"))
    ).rejects.toThrow(UnknownTransportError);
  });

  test("a known key with no credentials reports the ADR-001 message", async () => {
    // Production shape: the registry knows the transport, the snapshot has
    // no pool for it. This is the empty-credential path, not a config bug,
    // so it must read like the operator warning and never like "null".
    const dispatcher = new DispatchingAITransport({
      factories: { [CF]: () => recordingTransport("never", []) },
      poolFor: () => undefined,
    });
    await expect(dispatcher.run(TEXT_MODEL, {}, modelWith(CF))).rejects.toThrow(
      /No AI provider credentials configured for transport/
    );
  });

  test("the factory is called once per key", async () => {
    const factory = vi.fn<TransportFactory>(() => recordingTransport("x", []));
    const dispatcher = new DispatchingAITransport({
      factories: { [CF]: factory },
      poolFor: () => pool("cf-token"),
    });
    await dispatcher.run(TEXT_MODEL, {}, modelWith(CF));
    await dispatcher.run(TEXT_MODEL, {}, modelWith(CF));
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
