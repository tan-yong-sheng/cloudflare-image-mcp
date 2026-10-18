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
#   VERIFY_PORT  port the instance listens on (default 8788)
set -uo pipefail

WORKTREE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
VERIFY_PORT="${VERIFY_PORT:-8788}"
INSTANCE_FILE="$WORKTREE_ROOT/.verify/instance.json"
BASE="http://127.0.0.1:$VERIFY_PORT"
API_KEY="local-dev-user-key"
ADMIN_KEY="local-dev-admin-key"
failures=0

ok()   { echo "ok    $1"; }
fail() { echo "fail  $1"; failures=$((failures + 1)); }
skip() { echo "skip  $1"; }

# 1. Ownership: the recorded pid is alive (ps, not kill — cross-session kill is
# EPERM in this sandbox), is a wrangler dev, and still carries the recorded
# port. The --port argument is what ties this pid to the instance this pidfile
# describes; a recycled pid now running another worktree's wrangler dev has a
# different one.
pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$INSTANCE_FILE" 2>/dev/null)"
recorded_port="$(sed -n 's/.*"port":\([0-9]*\).*/\1/p' "$INSTANCE_FILE" 2>/dev/null)"
args="$(ps -o args= -p "$pid" 2>/dev/null)"
owned=0
if [ -z "$pid" ]; then
  fail "no instance recorded in $INSTANCE_FILE (launch.sh not run)"
elif [ -z "$args" ]; then
  fail "recorded pid $pid is not running (stale pidfile — run cleanup.sh)"
elif [ -n "$recorded_port" ] && [ "$recorded_port" != "$VERIFY_PORT" ]; then
  fail "pidfile records port $recorded_port but VERIFY_PORT is $VERIFY_PORT"
else
  case " $args " in
    *wrangler*" dev "*)
      case " $args " in
        *" --port $VERIFY_PORT "*)
          owned=1
          ok "instance pid $pid is ours and alive" ;;
        *)
          fail "pid $pid is a wrangler dev on another port (no --port $VERIFY_PORT): ${args:0:80}" ;;
      esac ;;
    *)
      fail "pid $pid is not a wrangler dev (got: ${args:0:80})" ;;
  esac
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
# ran and no foreign credential source leaked in. Gated on the store's own
# readiness flag: with a servable credential present this POST would reach the
# provider and spend real usage, so it is reported as skipped instead. The same
# guard covers an unreadable admin endpoint (no proof of emptiness, no probe).
store="$(curl -s --max-time 5 -H "Authorization: Bearer $API_KEY" \
  -H "X-Admin-Key: $ADMIN_KEY" "$BASE/api/admin/health")"
if printf '%s' "$store" | tr -d '[:space:]' | grep -q '"hasServableCredential":false'; then
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
