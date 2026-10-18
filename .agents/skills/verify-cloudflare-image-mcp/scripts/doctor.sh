#!/usr/bin/env bash
# Read-only doctor: is the local instance worth driving? Checks ownership of
# the instance, readiness, version, auth gating, and the ADR-001
# empty-credential path. Prints one ok/fail line per check; exits non-zero if
# any check fails. Never mutates anything — the generation probe is a call
# that is expected to fail with the empty-credential error.
#
# Env:
#   VERIFY_PORT  port the instance listens on (default 8788)
set -uo pipefail

WORKTREE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
VERIFY_PORT="${VERIFY_PORT:-8788}"
INSTANCE_FILE="$WORKTREE_ROOT/.verify/instance.json"
BASE="http://127.0.0.1:$VERIFY_PORT"
API_KEY="local-dev-user-key"
failures=0

ok()   { echo "ok    $1"; }
fail() { echo "fail  $1"; failures=$((failures + 1)); }

# 1. Ownership: the recorded pid is alive (ps, not kill — cross-session
# kill is EPERM in this sandbox) and still a wrangler dev.
pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$INSTANCE_FILE" 2>/dev/null)"
args="$(ps -o args= -p "$pid" 2>/dev/null)"
if [ -n "$pid" ] && [ -n "$args" ] && echo "$args" | grep -q "wrangler dev"; then
  ok "instance pid $pid is ours and alive"
else
  fail "no live instance recorded in $INSTANCE_FILE (launch.sh not run, or port owned by another worktree's server)"
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
# expected state of a fresh local store, proving the generator ran and no
# foreign credential source leaked in.
gen="$(curl -s --max-time 30 -X POST -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"@cf/black-forest-labs/flux-1-schnell","prompt":"doctor probe","n":1}' \
  "$BASE/v1/images/generations")"
if echo "$gen" | grep -q 'No AI provider credentials configured for transport' &&
  echo "$gen" | grep -q 'cloudflare-rest'; then
  ok "ADR-001 empty-credential error as designed"
else
  fail "unexpected generation result (seeded credentials? foreign instance?): ${gen:0:160}"
fi

exit "$((failures > 0 ? 1 : 0))"
