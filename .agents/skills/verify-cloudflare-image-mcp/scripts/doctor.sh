#!/usr/bin/env bash
# Read-only doctor: is the local instance worth driving? Checks ownership of
# the instance, readiness, version, auth gating, and the ADR-001
# empty-credential path. Prints one ok/fail line per check; exits non-zero if
# any check fails. Never mutates anything — the generation probe is a call
# that is expected to fail with the empty-credential error.
#
# Nothing is probed until ownership is established: a listener on this port
# that this run did not launch may be another worktree's server holding real
# credentials, and the generation POST below would then spend real provider
# usage. The ADR-001 probe additionally runs only when the store is proven to
# have no servable credential, for the same reason. A check that cannot run
# prints `skip` and is not counted as a failure.
#
# Env:
#   VERIFY_PORT       port the instance listens on (default 8788)
#   VERIFY_API_KEY    bearer key for local requests (default: the placeholder
#                     published in workers/.dev.vars.example)
#   VERIFY_ADMIN_KEY  admin key, same default source
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"
# shellcheck source=lib.sh
. "$SKILL_DIR/lib.sh"
VERIFY_PORT="${VERIFY_PORT:-8788}"
INSTANCE_FILE="$WORKTREE_ROOT/.verify/instance.json"
BASE="http://127.0.0.1:$VERIFY_PORT"
# Placeholder keys from workers/.dev.vars.example, published in the repo and
# documented in CONTRIB.md — not secrets. They are overridable because a
# worktree whose .dev.vars was customised would otherwise fail every check with
# a 401 that says nothing about the cause.
API_KEY="${VERIFY_API_KEY:-local-dev-user-key}"
ADMIN_KEY="${VERIFY_ADMIN_KEY:-local-dev-admin-key}"
failures=0

ok()   { echo "ok    $1"; }
fail() { echo "fail  $1"; failures=$((failures + 1)); }
skip() { echo "skip  $1"; }

# 1. Ownership: the pidfile describes a live wrangler dev on this port. This
# shares instance_problem with launch/cleanup/drive, so a pidfile with no
# recorded port, a recycled pid, and another worktree's instance all fail
# closed here rather than skipping the check.
owned=0
problem="$(instance_problem "$INSTANCE_FILE" "$VERIFY_PORT")"
if [ -z "$problem" ]; then
  owned=1
  ok "instance pid $(pidfile_field "$INSTANCE_FILE" pid) is ours and alive"
else
  fail "$problem"
fi

if [ "$owned" != 1 ]; then
  skip "HTTP probes: ownership of 127.0.0.1:$VERIFY_PORT is not established"
  skip "start your own instance with launch.sh, then re-run this doctor"
  exit 1
fi

# 2. Ready + version matches the checkout.
health="$(curl -s --max-time 5 "$BASE/health")"
want_version="$(node -p "require('$WORKTREE_ROOT/workers/package.json').version")"
if echo "$health" | grep -q '"status":"healthy"'; then
  ok "/health healthy"
else
  fail "/health not healthy: ${health:-<no response>}"
fi
got_version="$(echo "$health" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
if [ "$got_version" = "$want_version" ]; then
  ok "version $got_version matches workers/package.json"
else
  fail "version mismatch: serving $got_version, checkout has $want_version (driving the wrong instance?)"
fi

# 3. Auth gate armed: 401 without key, 200 with it.
no_key="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/v1/models")"
with_key="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H "Authorization: Bearer $API_KEY" "$BASE/v1/models")"
if [ "$no_key" = "401" ] && [ "$with_key" = "200" ]; then
  ok "auth gate: 401 without key, 200 with key"
else
  fail "auth gate: got $no_key without key / $with_key with key (want 401/200)"
fi

# 4. Empty-credential path: generation fails with the ADR-001 message — the
# expected state of a store with no servable credential, proving the generator
# ran and no foreign credential source leaked in. Gated on store_proven_empty
# (lib.sh): the readiness flag lags a write by up to its 5s TTL, so a
# credential seeded a moment earlier still reads false while its row is already
# enabled, and this POST would then reach the provider and spend real usage.
# An unreadable admin endpoint is the same refusal — no proof of emptiness, no
# probe.
if store_proven_empty "$BASE" "$API_KEY" "$ADMIN_KEY"; then
  gen="$(curl -s --max-time 30 -X POST -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"@cf/black-forest-labs/flux-1-schnell","prompt":"doctor probe","n":1}' \
    "$BASE/v1/images/generations")"
  if echo "$gen" | grep -q 'No AI provider credentials configured for transport' &&
    echo "$gen" | grep -q 'cloudflare-rest'; then
    ok "ADR-001 empty-credential error as designed"
  else
    fail "unexpected generation result (foreign instance?): ${gen:0:160}"
  fi
else
  skip "ADR-001 probe: the store is not proven empty, so the POST would reach"
  skip "  the provider (real usage). Delete the key, or drop .verify/state, to"
  skip "  assert the empty-credential path on a fresh store."
fi

exit "$((failures > 0 ? 1 : 0))"
