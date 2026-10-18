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

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"
# shellcheck source=lib.sh
. "$SKILL_DIR/lib.sh"
WORKERS_DIR="$WORKTREE_ROOT/workers"
VERIFY_PORT="${VERIFY_PORT:-8788}"
# Validate before anything has side effects: a non-numeric port would write
# invalid JSON into the pidfile and then fail to bind, leaving a record no
# later run can use.
case "$VERIFY_PORT" in
  '' | *[!0-9]*)
    echo "refusing: VERIFY_PORT must be a numeric TCP port (got: $VERIFY_PORT)" >&2
    exit 1
    ;;
  0*)
    # Numeric, but not canonical: 08795 would be written as `"port":08795`,
    # which is not valid JSON, and it never string-matches the port wrangler
    # binds — so a live record would look stale and be replaced, stranding the
    # instance it describes.
    echo "refusing: VERIFY_PORT must not have leading zeros (got: $VERIFY_PORT)" >&2
    exit 1
    ;;
esac
if [ "$VERIFY_PORT" -lt 1 ] || [ "$VERIFY_PORT" -gt 65535 ]; then
  echo "refusing: VERIFY_PORT must be between 1 and 65535 (got: $VERIFY_PORT)" >&2
  exit 1
fi
INSTANCE_FILE="$WORKTREE_ROOT/.verify/instance.json"
VERIFY_STATE="$WORKTREE_ROOT/.verify/state"

cd "$WORKERS_DIR"
mkdir -p "$WORKTREE_ROOT/.verify" "$VERIFY_STATE"

stale_record=""
if [ -f "$INSTANCE_FILE" ]; then
  recorded_pid="$(pidfile_field "$INSTANCE_FILE" pid)"
  recorded_port="$(pidfile_field "$INSTANCE_FILE" port)"
  # Same predicate cleanup.sh uses, evaluated against the *recorded* port: an
  # empty result means the record still describes a live wrangler dev of this
  # worktree, so starting another would strand it and cleanup.sh is the way out.
  # Anything else describes nothing of ours — a dead pid, a recycled one, a
  # port this run is not using, an unusable record — and is replaced below with
  # a note. Refusing there would leave a stale pidfile with no way forward,
  # since cleanup.sh also refuses to act on a record it cannot verify.
  if [ -n "$recorded_pid" ] &&
    [ -z "$(instance_problem "$INSTANCE_FILE" "$recorded_port")" ]; then
    echo "refusing: an instance recorded in $INSTANCE_FILE is still running" >&2
    echo "(pid $recorded_pid, port $recorded_port) — run cleanup.sh first (it reads" >&2
    echo "that port), or launch on a port no recorded instance owns" >&2
    exit 1
  fi
  stale_record="pid ${recorded_pid:-<none>}, port ${recorded_port:-<none>}"
fi

# Any local address counts: a listener on 0.0.0.0 or [::] owns the port too,
# and wrangler would then fail to bind after the pidfile was already written.
# A host where the check cannot be run refuses the same way: binding anyway
# would leave a pidfile pointing at a process that never served anything.
port_rc=0
port_in_use "$VERIFY_PORT" || port_rc=$?
case "$port_rc" in
  0)
    echo "refusing: port $VERIFY_PORT is already listening" >&2
    echo "another worktree's instance may own it — pick VERIFY_PORT=<free port>" >&2
    exit 1
    ;;
  2)
    echo "refusing: cannot check whether port $VERIFY_PORT is free" >&2
    echo "no ss, lsof, or netstat on PATH — install one, or pick a port you know is free" >&2
    exit 1
    ;;
esac

[ -f wrangler.toml ] || cp wrangler.toml.example wrangler.toml
[ -f .dev.vars ] || cp .dev.vars.example .dev.vars

./node_modules/.bin/wrangler d1 migrations apply PROVIDER_DB --local \
  --persist-to "$VERIFY_STATE" >/dev/null

# $$ survives the exec below. bash's exec replaces this shell's image in place,
# and the .bin/wrangler shebang chain (env -> node) does not fork either, so the
# pid recorded here is the process cleanup.sh later finds — verified with
# `ps -o args= -p <pid>` after a launch: `node .../.bin/wrangler dev ...`.
if [ -n "$stale_record" ]; then
  echo "note: replacing $INSTANCE_FILE, which records $stale_record — not a live"
  echo "      wrangler dev of this worktree on its recorded port"
fi
printf '{"pid":%d,"port":%s,"startedAt":"%s"}\n' \
  "$$" "$VERIFY_PORT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$INSTANCE_FILE"

exec ./node_modules/.bin/wrangler dev --local --port "$VERIFY_PORT" \
  --persist-to "$VERIFY_STATE"
