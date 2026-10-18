#!/usr/bin/env bash
# Tear down the verification instance started by launch.sh. Kills only the
# pid recorded in .verify/instance.json, after re-checking it still is a
# wrangler dev — never kill by process name: other worktrees run their own
# instances. Liveness uses ps(1), not kill -0: this sandbox returns EPERM
# for signals to processes outside our descendants (e.g. a launch run
# through a background-task tracker), so kill is attempted once and an
# EPERM is reported as "stop it via the tracker that launched it", never
# silently ignored. Evidence under evidence/verify/ is never touched.
#
# Env: none
set -euo pipefail

WORKTREE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
INSTANCE_FILE="$WORKTREE_ROOT/.verify/instance.json"

if [ ! -f "$INSTANCE_FILE" ]; then
  echo "nothing to clean: no $INSTANCE_FILE"
  exit 0
fi

pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$INSTANCE_FILE")"
port="$(sed -n 's/.*"port":\([0-9]*\).*/\1/p' "$INSTANCE_FILE")"
args="$(ps -o args= -p "$pid" 2>/dev/null || true)"

if [ -n "$args" ]; then
  case "$args" in
    *"wrangler dev"*) ;;
    *)
      echo "pid $pid is not 'wrangler dev' anymore (got: ${args:0:80}); refusing to kill" >&2
      exit 1
      ;;
  esac
  if ! kill "$pid" 2>/dev/null; then
    echo "cannot signal pid $pid (EPERM): it belongs to another session —" >&2
    echo "stop it through the facility that launched it (background-task kill / pueue kill)," >&2
    echo "then re-run this script to verify the port is down and clear the pidfile." >&2
    exit 1
  fi
  for _ in $(seq 1 20); do
    [ -z "$(ps -o args= -p "$pid" 2>/dev/null)" ] && break
    sleep 0.5
  done
  if [ -n "$(ps -o args= -p "$pid" 2>/dev/null)" ]; then
    echo "pid $pid ignored SIGTERM; inspect manually before any escalation" >&2
    exit 1
  fi
  echo "stopped instance pid $pid"
else
  echo "recorded pid $pid already gone"
fi

if [ -n "$port" ] && ss -ltn 2>/dev/null | grep -q "127.0.0.1:$port "; then
  echo "WARNING: port $port still listens — something other than the recorded pid owns it" >&2
  exit 1
fi

rm -f "$INSTANCE_FILE"
echo "cleanup done (evidence/verify/ and workers/.wrangler/state/ preserved)"
