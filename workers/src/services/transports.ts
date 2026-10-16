// ============================================================================
// Transport registry + dispatching transport (C4, #75/#68)
// ============================================================================
// One place that answers "which client code talks to this provider". A model
// names its transport in models.json (`inferenceProvider`); the key is the
// same string as the owning provider row's `transport` column, so config and
// database cannot drift into two vocabularies. Adding a provider is a
// registry entry plus a row, never an if-branch inside the generator.
//
// Failure policy (R2-Q4b): an unknown key is rejected twice — at load, so a
// typo cannot reach production one model at a time, and at request time, so
// an injected registry that is missing a key fails loudly instead of
// resolving to undefined. A known key with no credentials behind it is not a
// config error: it is the ADR-001 empty-credential path and reports the
// operator-facing message the generator's warning already uses.

import type { ModelConfig } from "../types.js";
import type { ProviderPool } from "./provider-pool.js";
import { MODEL_CONFIGS } from "../config/models.js";
import { RestAITransport, type AITransport } from "./generation-adapters.js";

/** Builds the transport for one registry key from that provider's pool. */
export type TransportFactory = (pool: ProviderPool) => AITransport;

/**
 * The transport registry. Keys are `providers.transport` values; a model's
 * `inferenceProvider` must be one of them. Injected (not imported) wherever
 * a dispatcher is built so tests can supply a fake second transport without
 * touching this map (R2-Q3a).
 */
export const TRANSPORT_FACTORIES: Readonly<Record<string, TransportFactory>> = {
  "cloudflare-rest": (pool) =>
    new RestAITransport(
      pool
        .entries()
        .map((e) => ({ account_id: e.accountId, api_token: e.apiToken })),
      pool.source,
      pool
    ),
};

/** A model asked for a transport the registry does not know. Config bug. */
export class UnknownTransportError extends Error {
  constructor(readonly transport: string) {
    super(`Unknown AI transport "${transport}"`);
    this.name = "UnknownTransportError";
  }
}

/** The error for "transport known, but nothing can serve it" (ADR-001). */
export function noCredentialsError(transport: string): Error {
  return new Error(
    `No AI provider credentials configured for transport "${transport}". ` +
      `Add credentials via admin UI at /#admin`
  );
}

/** Throw UnknownTransportError for the first key absent from the registry. */
export function assertKnownTransports(
  transports: Iterable<string>,
  registry: Readonly<Record<string, TransportFactory>> = TRANSPORT_FACTORIES
): void {
  for (const key of new Set(transports)) {
    if (!(key in registry)) throw new UnknownTransportError(key);
  }
}

/**
 * One AITransport in front of the registry: `run` reads the model's
 * `inferenceProvider` and delegates. The interface already receives the
 * model (generation-adapters.ts:20-30), so no caller changes and no
 * transport needs to know which model it is serving.
 */
export class DispatchingAITransport implements AITransport {
  private readonly resolved = new Map<string, AITransport>();

  constructor(
    private readonly deps: {
      factories: Readonly<Record<string, TransportFactory>>;
      /** Credentials for a transport key; undefined = provider has none. */
      poolFor: (transport: string) => ProviderPool | undefined;
    }
  ) {}

  async run(
    modelId: string,
    payload: Record<string, any>,
    model: ModelConfig,
    images?: string[]
  ): Promise<unknown> {
    return await this.transportFor(model).run(modelId, payload, model, images);
  }

  private transportFor(model: ModelConfig): AITransport {
    const key = model.inferenceProvider;
    const cached = this.resolved.get(key);
    if (cached) return cached;

    const factory = this.deps.factories[key];
    if (!factory) throw new UnknownTransportError(key);

    const pool = this.deps.poolFor(key);
    if (!pool) throw noCredentialsError(key);

    const transport = factory(pool);
    this.resolved.set(key, transport);
    return transport;
  }
}

// Load-time validation (R2-Q2/R2-Q4b "fail fast at load"): every configured
// model must name a registered transport. models.json has no runtime loader,
// so the registry it mirrors is the only thing that can be checked at boot —
// and a bad key is a deploy-time bug that credentials cannot fix, which is
// why it stops the isolate instead of degrading one request at a time.
assertKnownTransports(
  Object.values(MODEL_CONFIGS).map((m) => m.inferenceProvider)
);
