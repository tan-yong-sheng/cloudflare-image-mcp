// ============================================================================
// Provider credential view - one pool per provider, transport-tagged (C4)
// ============================================================================
// Routing needs two facts that live in different places: which transport a
// model asks for (models.json inferenceProvider) and which credentials serve
// that transport (provider_keys rows, grouped by the transport their
// provider row declares). This holds the second: the isolate-cached pools
// keyed by providerId, each tagged with its provider's transport so the
// dispatcher can map a transport key back to credentials. A provider with
// no provider_keys rows is absent — readiness and routing read the same
// absence, so they cannot disagree.

import { ProviderPool } from "./provider-pool.js";

/** One provider's credentials plus the transport that serves them. */
export interface ProviderPoolEntry {
  providerId: string;
  /** providers.transport — the registry key (services/transports.ts). */
  transport: string;
  pool: ProviderPool;
}

export class ProviderPools {
  private readonly entries: ProviderPoolEntry[];
  private readonly byProvider: Map<string, ProviderPoolEntry>;
  /** Memo for a transport served by more than one provider (see forTransport). */
  private readonly mergedByTransport = new Map<string, ProviderPool>();

  constructor(entries: ProviderPoolEntry[]) {
    this.entries = [...entries];
    this.byProvider = new Map(entries.map((e) => [e.providerId, e]));
  }

  /** Every provider's entry, in load order. */
  all(): ProviderPoolEntry[] {
    return [...this.entries];
  }

  /** The pool for one provider, or undefined when it has no loaded rows. */
  forProvider(providerId: string): ProviderPool | undefined {
    return this.byProvider.get(providerId)?.pool;
  }

  /**
   * The pool that serves a transport key, or undefined when nothing can
   * serve it — either no provider declares the transport, or every provider
   * that does has only parked keys. Routing and readiness therefore read the
   * same predicate, so a request can never be dispatched to a pool the
   * health surface reports as unservable. Normally exactly one provider
   * declares a transport, and its cached pool is returned by identity —
   * cooldowns are isolate state held on that instance, so returning a copy
   * would silently stop parking failed keys. When several providers declare
   * the same transport their servable keys are merged once and memoized,
   * which keeps the same cooldown guarantee for the merged instance.
   */
  forTransport(transport: string): ProviderPool | undefined {
    const matches = this.entries.filter(
      (e) => e.transport === transport && e.pool.entries().length > 0
    );
    if (matches.length === 0) return undefined;
    if (matches.length === 1) return matches[0].pool;

    let merged = this.mergedByTransport.get(transport);
    if (!merged) {
      merged = new ProviderPool(
        matches.flatMap((e) => e.pool.entries()),
        { source: matches[0].pool.source }
      );
      this.mergedByTransport.set(transport, merged);
    }
    return merged;
  }

  /** providerId -> has at least one servable key (the routing predicate). */
  readiness(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const e of this.entries) {
      out[e.providerId] = e.pool.entries().length > 0;
    }
    return out;
  }

  /**
   * Any provider servable at all — the frontend's single global warning
   * reads this until the UI goes per-provider (ADR-001).
   */
  hasAnyServable(): boolean {
    return this.entries.some((e) => e.pool.entries().length > 0);
  }
}
