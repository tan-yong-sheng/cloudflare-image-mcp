#!/usr/bin/env bash
# Launch a zero-secret local instance of the Cloudflare Image MCP Worker for
# verification. Guarded start: refuses a busy port, never overwrites existing
# local config, applies the D1 schema to this instance's own persistence dir
# (.verify/state — never workers/.wrangler/state, so a manually seeded key in
# the shared dev store cannot turn a verification probe into a real provider
# call), records the instance, then execs wrangler in the foreground — run via
# a background-task facility or a terminal you keep open.
#
# Env:
#   VERIFY_PORT  port to bind (default 8788; 8787 is usually taken by
#                another worktree's instance in this repo)
set -euo pipefail

WORKTREE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
WORKERS_DIR="$WORKTREE_ROOT/workers"
VERIFY_PORT="${VERIFY_PORT:-8788}"
INSTANCE_FILE="$WORKTREE_ROOT/.verify/instance.json"
VERIFY_STATE="$WORKTREE_ROOT/.verify/state"

cd "$WORKERS_DIR"
mkdir -p "$WORKTREE_ROOT/.verify" "$VERIFY_STATE"

if [ -f "$INSTANCE_FILE" ]; then
  prev_pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$INSTANCE_FILE")"
  if [ -n "$(ps -o args= -p "$prev_pid" 2>/dev/null)" ]; then
    echo "refusing: an instance recorded in $INSTANCE_FILE (pid $prev_pid) is still running" >&2
    echo "run cleanup.sh first, or VERIFY_PORT=<free port> to run a second" >&2
    exit 1
  fi
fi

# Any local address counts: a listener on 0.0.0.0 or [::] owns the port too,
# and wrangler would then fail to bind after the pidfile was already written.
if ss -ltn 2>/dev/null | grep -q ":$VERIFY_PORT "; then
  echo "refusing: port $VERIFY_PORT is already listening" >&2
  echo "another worktree's instance may own it — pick VERIFY_PORT=<free port>" >&2
  exit 1
fi

[ -f wrangler.toml ] || cp wrangler.toml.example wrangler.toml
[ -f .dev.vars ] || cp .dev.vars.example .dev.vars

./node_modules/.bin/wrangler d1 migrations apply PROVIDER_DB --local \
  --persist-to "$VERIFY_STATE" >/dev/null

# $$ survives the exec below. bash's exec replaces this shell's image in place,
# and the .bin/wrangler shebang chain (env -> node) does not fork either, so the
# pid recorded here is the process cleanup.sh later finds — verified with
# `ps -o args= -p <pid>` after a launch: `node .../.bin/wrangler dev ...`.
printf '{"pid":%d,"port":%s,"startedAt":"%s"}\n' \
  "$$" "$VERIFY_PORT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$INSTANCE_FILE"

exec ./node_modules/.bin/wrangler dev --local --port "$VERIFY_PORT" \
  --persist-to "$VERIFY_STATE"
