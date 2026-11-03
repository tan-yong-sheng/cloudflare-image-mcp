# ADR-004: A Model Is Required, and There Is No Implicit Vendor Default

## Status

Accepted

## Date

2026-11-03

## Context

The Worker began as a Cloudflare-only image generator, so "no model named"
had exactly one sensible answer: the Cloudflare model the code named. That
assumption is encoded three times over, once per route, with a different
model each time:

- `generations` → `@cf/black-forest-labs/flux-1-schnell` (`DEFAULT_MODEL`)
- `edits` → `@cf/stabilityai/stable-diffusion-xl-base-1.0`
- `variations` → `@cf/black-forest-labs/flux-2-klein-4b`

ADR-001 made credentials database-only and ADR-002 made the transport a
per-provider registry, so a second provider (Agnes, `openai-compat`) can now
serve a model. On such a deployment a model-less request still resolves to a
Cloudflare id, and when Cloudflare has no servable credential the request
fails with

```
No AI provider credentials configured for transport "cloudflare-rest"
```

which names a _transport_ for a request the caller never scoped to a
transport, and returns `500` with `code: null` — the same shape as an
upstream failure.

Three surfaces disagreed about what "the default" meant:

1. `DEFAULT_MODEL` — a code constant, affecting `generations` only.
2. `exposure_overrides.is_default` — read by `resolveDefaultModel`, affecting
   `generations` only, and **never written by any product code**: there is no
   admin route, no UI, and only tests insert into the table.
3. Registry order — the playground selects the first servable model in
   `models.json` order and never reads either of the above.

Each route also had its own literal, so "the default" was really three
independent decisions that could drift apart. And `/v1/models` advertised
every exposed model regardless of whether any credential could serve it, so
the documented happy path (list models, pick one) could reach the failure
above.

Nothing in the repo depends on the fallback: all 13 e2e image requests, the
React client, every documentation example and every script send `model`. Only
three unit-test assertions exercise the model-less path.

## Decision

A request names the model it wants. The server never chooses a vendor on the
caller's behalf.

1. **`model` is required** on `/v1/images/generations`, `/v1/images/edits`
   and `/v1/images/variations`. Omitting it is a caller error, not a prompt
   for the server to guess.
2. **Failure is typed per cause**, so a client can distinguish its own
   mistake from our configuration from the provider's:

   | Cause                                              | Status                      | `code`                 |
   | -------------------------------------------------- | --------------------------- | ---------------------- |
   | `model` missing                                    | 400 `invalid_request_error` | `model_required`       |
   | `model` not in the registry                        | 404                         | `model_not_found`      |
   | `model` known, provider has no servable credential | 503                         | `provider_unavailable` |
   | Upstream provider failure                          | 502                         | —                      |

   The 503 body names the requested model and the models that are servable, so
   the caller can correct without a second round trip.

3. **Discovery tells the truth.** `/v1/models` returns servable models only.
   The admin/internal model endpoint keeps returning the full registry with
   `available` on every entry (it already does), because an operator needs to
   see what enabling a credential would unlock.
4. **A zero-credential install is a setup state, not a fault.** The Worker
   boots — it must, in order to serve `/admin` so the first credential can be
   added. `/v1/models` is empty and inference returns 503
   `no_provider_configured`. It never returns 5xx-with-null-code for a state
   the operator can fix in the admin UI.
5. **The default survives in exactly one place: the playground.** A single
   explicit constant preselects the model in the web UI; it is renamed to say
   so and is never consulted by the HTTP API. The `is_default` read path is
   deleted. The `exposure_overrides.is_default` column stays in the schema
   until a later forward-only migration drops it.
6. **No cross-provider substitution.** A named model that cannot be served is
   an error, never a silent swap. Image models differ visibly in output, so
   substituting changes what the caller received, which is a correctness
   problem dressed as availability.
7. **No deprecation window.** The fallback is removed in the release that
   makes `model` required. Keeping it alive for a transition would ship the
   vendor-guess one more time while adding a second code path to test.
8. **Vocabulary.** _Servable_ (an open credential the pool can pick), _parked_
   (a row that exists but cannot be served), _provider credential_, and
   _default model_ are the terms; "configured" is retired because it conflated
   a provider row existing with a credential being servable. Recorded in
   `GLOSSARY.md`.

## Alternatives Considered

### Keep `model` optional and make the fallback availability-aware

**Approach:** on a model-less request, pick the first servable model — the
"0/1/N" cascade: none configured is an error, one configured is unambiguous,
several require an explicit default.

**Rejected:** for `≥2` providers it needs an explicit default, and the only
storage for one is `is_default`, which has no writer — so the cascade was not
buildable without also building an admin write path. It also makes the
response depend on database state rather than the request, so the same call
returns different models on different days.

### Keep `model` optional; let registry order govern

**Approach:** delete the constant and the column; the first servable model in
`models.json` becomes the default.

**Rejected:** reordering a config file would silently change API behaviour —
the same class of hidden coupling this ADR exists to remove.

### Build the `is_default` write path

**Approach:** add an admin route, UI, and audit trail so an operator pins a
preferred model.

**Rejected for now, not forever:** once `model` is required, the knob affects
only which model the playground preselects, and the operator can pick any
model in the dropdown anyway. If a "preferred model" later earns behaviour
beyond preselection, it should be designed then, with the write path.

### One release with `Deprecation` headers before enforcing

**Approach:** keep the fallback, warn, then remove.

**Rejected:** no in-repo caller uses the fallback, so the warning would only
serve a hypothetical external client while keeping the silent vendor-guess
alive for a release. At `0.2.0` a breaking change is legitimate.

### Keep `500` and only add a `code`

**Approach:** minimal churn — same status, informative `code`.

**Rejected:** `500` tells the client it is our fault and invites retries that
will never succeed for `model_required` or `model_not_found`.

## Consequences

### Positive

- The API contract no longer depends on which vendor happens to be configured,
  so the same request means the same model on every deployment.
- A deployment with credentials for one provider works for any caller that
  names a model on that provider, with no code edit to a default constant.
- The failure a caller sees is actionable on its own: it names the model, why
  it cannot be served, and what can.
- `/v1/models` can no longer hand a client a model that will fail, which
  removes the documented happy path's dead end.
- Three per-route literals and an unread column stop being maintained.

### Negative

- **Breaking** for any client that omitted `model` and relied on the
  Cloudflare default. Accepted at `0.2.0`; `docs/API.md` must flip `model` to
  Required in the same change.
- Four error branches replace one, each needing its own test.
- Two listing shapes (`/v1/models` servable-only, admin full) to keep honest;
  a test has to pin both or they will drift.
- `exposure_overrides.is_default` becomes dead weight until a later migration.
- `variations`' previous default pointed at a text-to-image model — a latent
  semantic bug this ADR retires rather than fixes. The endpoint's own
  semantics remain out of scope.

### Supersession

This ADR supersedes the defaulting behaviour introduced with `DEFAULT_MODEL`
and the `is_default` overlay; it does not supersede ADR-001 (credentials are
database-only) or ADR-002 (per-provider transport registry), both of which it
relies on. `docs/API.md`'s parameter table and the model-resolution section of
`docs/API.md` are corrected by the implementing change, not by this document.
