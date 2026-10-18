#!/usr/bin/env bash
# Launch a zero-secret local instance of the Cloudflare Image MCP Worker for
# verification. Guarded start: refuses a busy port, never overwrites existing
# local config, applies the D1 schema from an empty data dir, records the
# instance, then execs wrangler in the foreground — run via a background-task
# facility or a terminal you keep open.
#
# Env:
#   VERIFY_PORT  port to bind (default 8788; 8787 is usually taken by
#                another worktree's instance in this repo)
set -euo pipefail

WORKTREE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
WORKERS_DIR="$WORKTREE_ROOT/workers"
VERIFY_PORT="${VERIFY_PORT:-8788}"
INSTANCE_FILE="$WORKTREE_ROOT/.verify/instance.json"

cd "$WORKERS_DIR"
mkdir -p "$WORKTREE_ROOT/.verify"

if [ -f "$INSTANCE_FILE" ]; then
  prev_pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$INSTANCE_FILE")"
  if [ -n "$(ps -o args= -p "$prev_pid" 2>/dev/null)" ]; then
    echo "refusing: an instance recorded in $INSTANCE_FILE (pid $prev_pid) is still running" >&2
    echo "run cleanup.sh first, or VERIFY_PORT=<free port> to run a second" >&2
    exit 1
  fi
fi

if ss -ltn 2>/dev/null | grep -q "127.0.0.1:$VERIFY_PORT "; then
  echo "refusing: port $VERIFY_PORT is already listening" >&2
  echo "another worktree's instance may own it — pick VERIFY_PORT=<free port>" >&2
  exit 1
fi

[ -f wrangler.toml ] || cp wrangler.toml.example wrangler.toml
[ -f .dev.vars ] || cp .dev.vars.example .dev.vars

./node_modules/.bin/wrangler d1 migrations apply PROVIDER_DB --local >/dev/null

printf '{"pid":%d,"port":%s,"startedAt":"%s"}\n' \
  "$$" "$VERIFY_PORT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$INSTANCE_FILE"

exec ./node_modules/.bin/wrangler dev --local --port "$VERIFY_PORT"
