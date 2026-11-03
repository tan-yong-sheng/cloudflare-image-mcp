# ADR-005: A Configured Caller Key Is the Gate, So Retiring `API_KEYS` Must Not Open the API

## Status

Accepted

## Date

2026-11-03

## Context

Caller authentication (`/v1/*`, `/mcp*`) reads credentials from two places:

1. **`API_KEYS`** — a Worker secret, comma-separated, the original and only
   source.
2. **`caller_keys`** — D1 rows created in the admin UI (#126–#129), each
   stored as a verifier, never the secret.

Before D1 keys existed, the middleware opened with:

```ts
if (!env.API_KEYS) return { authenticated: true };
```

That was correct while `API_KEYS` was the only source: a deployment that did
not set it had no credentials to check, so requiring one would have locked
everyone out of an unprotected Worker.

Adding the D1 source made that early return a trap. The lookup only asked
whether `API_KEYS` was set, so a deployment that had moved its credentials into
D1 and then retired the env var — the natural last step of the migration —
served `/v1` and `/mcp` to **anyone**, while the admin page continued to list
its keys as enabled. The failure is silent in the worst way: the operator sees
keys, believes the API is gated, and it is not. Review flagged it as the
highest-severity finding in the series (H1); the fix landed in #164.

Two constraints had to hold at once, and they pull in opposite directions:

- **Retiring `API_KEYS` must not open the API** once D1 keys exist. Otherwise
  the documented migration path is the one that removes protection.
- **Binding a database must not close the API** by itself. Every deployment
  binds `PROVIDER_DB`; a fresh install has no keys yet, and it must still serve
  `/admin` so the first key can be created.

## Decision

**Authentication is required whenever any credential source has an entry.**

1. **The gate activates on the first usable credential, wherever it lives.**
   With `API_KEYS` unset but at least one _enabled_ row in `caller_keys`, a
   request must present a valid key. `API_KEYS` is no longer the signal that
   authentication exists — it is one of two sources.
2. **No credential anywhere keeps the open posture.** With no env keys _and_ no
   enabled D1 row, the Worker still answers `authenticated: true`. This is what
   keeps a keys-less install reachable so the first key can be created. It is
   the deliberate residue of the old behavior, not an oversight.
3. **A disabled key does not activate the gate.** Only `enabled = 1` counts:
   parking a key must not silently start rejecting traffic nobody configured.
4. **A D1 read failure fails closed** when no env keys are configured. With no
   other source, "the database is down" must not mean "everyone is authorized."
   When env keys exist, env authentication still succeeds (the D1 path was
   already an additional source, and degrading to it is the pre-existing
   behavior).
5. **`API_KEYS` is parsed identically everywhere** — split on commas, trim,
   drop empties — so `API_KEYS=","` counts as _not configured_ both for the
   gate and for the operator-facing warning that says env callers still work.

### Operational consequence: order matters

The migration is **create first, then remove**:

1. Set `API_KEYS` (required for the admin API anyway).
2. Create at least one D1 caller key.
3. Only then retire `API_KEYS`.

Reversing steps 2 and 3 opens the API. Nothing in the code can detect that
mistake after the fact; this ordering is the only safeguard.

## Alternatives Considered

### Keep the escape hatch: unset `API_KEYS` always means open

**Approach:** leave the early return alone; treat "no env var" as an explicit
opt-out of authentication.

**Rejected:** it makes the documented migration step destructive, and the
opt-out is indistinguishable from the common mistake of deleting a secret. The
decision above covers the only use case the escape hatch served (a keys-less
install) without requiring the operator to remember a rule that silently
removes protection. Chosen against by the operator on 2026-11-03 after the
trade-off was presented.

### Require authentication whenever `PROVIDER_DB` is bound

**Approach:** treat the presence of the database binding as the signal.

**Rejected:** every deployment binds `PROVIDER_DB`, including fresh installs
with no keys, so this locks the operator out of their own `/admin` before they
can create the first key. It trades a silent-open failure for a silent-lockout
failure.

### Require an explicit `CALLER_KEYS_REQUIRED` flag

**Approach:** an env var that turns the gate on, defaulting to off.

**Rejected:** a flag defaults wrong for everyone who does not read the release
notes, and it makes correctness depend on configuration rather than on the
credentials that already exist. The data is the signal; a second flag that can
disagree with it is another state to get wrong.

## Consequences

- **One indexed extra query** (`SELECT 1 ... WHERE enabled = 1 LIMIT 1`) per
  request, only on deployments with no `API_KEYS`. Deployments with env keys
  pay nothing, which is the common case.
- **A keys-less install stays open**, by design, and is documented as such.
  Protecting it means creating a key, not setting a flag.
- **`API_KEYS` can no longer be removed "just to test something"** without
  first confirming a D1 key exists.
- The admin API still refuses to operate without `API_KEYS` (its own gate), so
  a deployment can never reach the state "D1 keys exist but nobody can manage
  them" through the UI alone.

## References

- `workers/src/middleware/auth.ts` — the gate and the empty-source check.
- `workers/src/endpoints/admin.ts` — `hasConfiguredEnvKeys`, shared parsing.
- PR #144 (the D1 auth path), PR #164 (this decision's implementation and tests).
- ADR-001 — database-only **provider** credential management. Unrelated to
  caller authentication; both are "database-only" for different credentials.
