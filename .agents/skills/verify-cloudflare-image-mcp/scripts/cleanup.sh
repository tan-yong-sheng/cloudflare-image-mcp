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
#
# Refuses, without signalling anything, when the record cannot be verified: no
# usable port, a pid that is not a wrangler dev, a wrangler dev on another port,
# or a host where the listener check cannot run. launch.sh replaces such a
# record; this script never deletes one it cannot account for.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SKILL_DIR/lib.sh"
WORKTREE_ROOT="$(cd "$SKILL_DIR/../../../.." && pwd)"
INSTANCE_FILE="$WORKTREE_ROOT/.verify/instance.json"

if [ ! -f "$INSTANCE_FILE" ]; then
  echo "nothing to clean: no $INSTANCE_FILE"
  exit 0
fi

pid="$(pidfile_field "$INSTANCE_FILE" pid)"
port="$(pidfile_field "$INSTANCE_FILE" port)"
args="$(ps -o args= -p "$pid" 2>/dev/null || true)"

# The recorded port is the only handle on the listener, and confirming the port
# is down is the only proof this script can offer that an instance stopped. A
# record without one is therefore refused in both branches below: deleting it
# while an unknown port may still be serving would be the opposite of the
# fail-closed rule everywhere else. launch.sh replaces such a record.
if [ -z "$port" ]; then
  echo "refusing: $INSTANCE_FILE records no usable port, so no listener can be" >&2
  echo "confirmed down — re-run launch.sh (it replaces a record that describes" >&2
  echo "nothing of ours) or delete that file once you know the port is free" >&2
  exit 1
fi

if [ -n "$args" ]; then
  # Identity before signalling, through the shared check: it refuses a pid that
  # is not a wrangler dev and a wrangler dev on another port — the recycled-pid
  # case, where the recorded number now belongs to a different worktree's
  # instance. (The recorded port itself was required above.)
  problem="$(instance_problem "$INSTANCE_FILE" "$port")"
  if [ -n "$problem" ]; then
    echo "$problem; refusing to kill" >&2
    exit 1
  fi
  if ! kill "$pid" 2>/dev/null; then
    echo "cannot signal pid $pid (EPERM): it belongs to another session —" >&2
    echo "stop it through the facility that launched it (background-task kill / pueue kill)," >&2
    echo "then re-run this script to verify the port is down and clear the pidfile." >&2
    exit 1
  fi
  # 20 rounds of 0.5s, built with a counter rather than seq: seq is absent by
  # default on macOS/BSD.
  waited=0
  while [ "$waited" -lt 20 ]; do
    [ -z "$(ps -o args= -p "$pid" 2>/dev/null)" ] && break
    sleep 0.5
    waited=$((waited + 1))
  done
  if [ -n "$(ps -o args= -p "$pid" 2>/dev/null)" ]; then
    echo "pid $pid ignored SIGTERM; inspect manually before any escalation" >&2
    exit 1
  fi
  echo "stopped instance pid $pid"
else
  echo "recorded pid $pid already gone"
fi

# Fail closed when the listener check cannot run: a host with none of ss, lsof
# or netstat cannot prove the port came down, and treating that as "down" would
# delete the only record of an instance that may still be serving.
port_rc=0
port_in_use "$port" || port_rc=$?
case "$port_rc" in
  0)
    echo "WARNING: port $port still listens — something other than the recorded pid owns it" >&2
    exit 1
    ;;
  2)
    echo "WARNING: cannot check whether port $port is down (no ss, lsof, or netstat);" >&2
    echo "not claiming the instance is stopped — pidfile left in place" >&2
    exit 1
    ;;
esac

rm -f "$INSTANCE_FILE"
echo "cleanup done (evidence/verify/ and .verify/state/ preserved)"
