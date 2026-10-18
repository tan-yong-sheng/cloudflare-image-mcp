# ADR-002: Provider Transport Registry Behind `AITransport`

## Status

Accepted

## Date

2026-10-17

## Context

Every inference request reaches Workers AI through `AITransport`
(`src/services/generation-adapters.ts`). Today only one implementation exists,
`RestAITransport`, and `ImageGeneratorService` constructs it directly:

```ts
this.transport = new RestAITransport(poolAccounts, pool.source, pool);
```

The provider store (migration `0001_provider_schema.sql`) already carries a
`transport TEXT NOT NULL` column, seeded `('cloudflare', 'Cloudflare Workers
AI', 'cloudflare-rest')`, and documents it as "the seam the provider speaks".
Nothing read that column: the column was a promise, not a mechanism.

An OpenAI-compatible second provider (Agnes AI, R3-Agnes) is in flight, and
its proposal (`feat/r3-agnes-openai-transport`, #75) had to smuggle the
decision into the generator with a local `transportFor(model)` branch plus
`AGNES_API_KEY` / `AGNES_BASE_URL` environment fallbacks — the fallback
ADR-001 removed. Without a standing seam, the second provider would have been
followed by a third edit to the same constructor, and credentials would have
flowed through two different policies.

## Decision

A model declares which transport serves it, and one registry turns that key
into client code.

1. **Model config names its transport.** `ModelConfig.inferenceProvider`
   (required, present on every entry in `models.json`, which is projected into
   `models.generated.ts` per ADR-003) holds the transport key. It is distinct
   from `provider`, which stays the model author (`black-forest-labs`, `meta`).
2. **The key is the database's key.** `inferenceProvider` values are
   `providers.transport` values — one vocabulary across config and database,
   so neither can invent a name the other does not know.
3. **One registry, injected.** `TRANSPORT_FACTORIES`
   (`src/services/transports.ts`) maps transport key → `(pool) => AITransport`.
   It is passed into the dispatcher rather than registered globally, so tests
   supply a fake second transport without a global reset.
4. **One dispatching transport.** `DispatchingAITransport` implements
   `AITransport`; `run` reads `model.inferenceProvider`, resolves the factory
   and that transport's pool, and delegates. `AITransport.run` already
   receives the model, so no call site changed and no transport needs to know
   which model it serves.
5. **Credentials are per provider.** `ProviderPools`
   (`src/services/provider-pools.ts`) holds one `ProviderPool` per
   `provider_id`, so each provider keeps its own rotation and cooldown state.
   The cached snapshot carries the map; readiness and routing read the same
   view.
6. **Unknown key fails twice, on purpose.** Every configured model is checked
   at module init (`assertKnownTransports`), so a typo cannot ship and then
   fail one model at a time; the dispatcher also throws
   `UnknownTransportError` at request time, so an injected registry that
   lacks a key fails loudly instead of resolving to `undefined`. A known key
   with no credentials is a different outcome: the ADR-001
   "no credentials configured" message, naming the transport.

## Alternatives Considered

### `if`-branch inside `ImageGeneratorService`

**Approach:** `transportFor(model)` returns `RestAITransport` or
`OpenAITransport` based on `model.provider`.

**Rejected:** It is #75's shape. Every new provider is another edit to the
generator, the decision is not testable without constructing the service, and
it invites keying on the vendor (product name) rather than the protocol.

### Global mutable registry with `register()`

**Approach:** modules self-register into a module-level map at import time.

**Rejected:** import-order-dependent behavior and no seam for tests to add a
second transport; the injected plain object is the same map without the
hidden state.

### Name the transport after the product

**Approach:** `cloudflare-workers-ai-rest` instead of `cloudflare-rest`.

**Rejected:** the key names the protocol/seam, not the vendor. The database
seed and #75's migration `0002` both already use protocol-shaped keys
(`cloudflare-rest`, `openai-compat`), and the product name is already carried
by the provider id and display name.

### Per-model factory functions

**Approach:** each model entry points at a factory directly.

**Rejected:** transports are a property of the provider's protocol, not of
each model; three models on one provider would repeat the same binding and
could drift from one another.

## Consequences

### Positive

- Adding a provider is a registry entry plus a D1 `providers` row plus a
  `models.json` entry (regenerated into `models.generated.ts`) — no change to
  `ImageGeneratorService`.
- Config and database share one transport vocabulary; since ADR-003 the
  transport field is part of the generated projection, so a model declared
  with one transport and executed with another fails `npm run check`.
- Readiness is per provider, so a provider with only parked keys is not
  routable and is not reported as servable.

### Negative

- A bad `inferenceProvider` fails at module init. In a Worker that is a
  cold-start throw: the isolate refuses all traffic, admin surface included,
  until the config is fixed. Chosen deliberately — a config error that
  credentials cannot repair should not degrade silently per request.
- `pool-cache`'s production query now joins `providers` to obtain
  `transport`, widening the hot-path read shape (still one query, still
  isolate-cached).
- `providers.transport` joins `providers.display_name` as a value the
  database must keep in sync with application code. A registry key with no
  provider row is silent until a credential is published.

### Supersession

`feat/r3-agnes-openai-transport` (#75) is superseded in its transport
selection only. What #75 keeps: `OpenAITransport`, migration `0002`
(seed row `('agnes', 'Agnes AI', 'openai-compat')`, already in this
vocabulary), and the Agnes model entry. What #75 drops: the
`ModelConfig.transport` field with its `transportFor()` branch in the
generator, and the `AGNES_API_KEY` / `AGNES_BASE_URL` fallbacks, which
ADR-001 forbids. Rebasing #75 onto this decision means adding one
`TRANSPORT_FACTORIES` entry for `openai-compat` and setting
`inferenceProvider: "openai-compat"` on the Agnes model.

## Verification

After implementation:

- [x] Every entry in `models.json` declares
      `inferenceProvider`, the projection is typechecked against `ModelConfig`
      (ADR-003), and the parity test pins it
- [x] A fake second transport, injected under a test key, is selected by
      `inferenceProvider` alone
- [x] An unknown key throws at module init and `UnknownTransportError` at
      request time; the init check runs in the suite that imports the module
- [x] A provider with only parked (unopenable/disabled) keys is neither
      routable nor reported servable
- [x] `pool-cache-d1.test.ts` reads `transport` through the real migrated
      schema via the widened join

## References

- ADR-001: database-only credential management (the fallback this decision
  keeps out of transport selection)
- ADR-003: model config codegen (the projection that carries
  `inferenceProvider` into the executed registry)
- `src/services/transports.ts`, `src/services/provider-pools.ts`,
  `src/services/pool-loader.ts`, `src/services/pool-cache.ts`
- `.agents/skills/add-cf-models/SKILL.md` — adding a model, now with a
  required `inferenceProvider`
