#!/usr/bin/env bash
# Shared helpers for the verify-cloudflare-image-mcp scripts. Sourced, never
# executed directly.
#
# Two questions stand between a script and an instance it should not touch:
# "is this port free?" and "is the process in this pidfile really ours?". Both
# are answered here, once, and both fail closed — when the answer cannot be
# determined, callers refuse rather than proceed.

# pidfile_field FILE KEY -> the value of "KEY":N in FILE, or nothing. Always
# returns 0: callers under `set -e` must not die because the file vanished.
pidfile_field() {
  sed -n "s/.*\"$2\":\([0-9]*\).*/\1/p" "$1" 2>/dev/null || true
}

# _in_listing LISTING PORT -> 0 when LISTING has a listener on PORT, 1 when it
# has none, 2 when the listing could not be searched (a grep failure is not an
# absent listener).
_in_listing() {
  local rc=0
  printf '%s\n' "$1" | grep -q ":$2 " || rc=$?
  case "$rc" in
    0) return 0 ;;
    1) return 1 ;;
    *) return 2 ;;
  esac
}

# port_in_use PORT -> 0 listening, 1 free, 2 cannot tell.
# Any local address counts: 0.0.0.0 and [::] own the port as much as loopback
# does. ss is Linux-only, so lsof and netstat are tried before giving up, and a
# query that fails is "cannot tell" rather than "free" — callers treat 1 as
# proof, so a tool that could not look must not produce it.
port_in_use() {
  local port="$1" listing rc=0
  if command -v ss >/dev/null 2>&1; then
    listing="$(ss -ltn 2>/dev/null)" || return 2
    rc=0
    _in_listing "$listing" "$port" || rc=$?
    return "$rc"
  fi
  if command -v lsof >/dev/null 2>&1; then
    listing="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null)" || rc=$?
    [ "$rc" -ge 2 ] && return 2
    [ -n "$listing" ] && return 0
    # lsof exits 1 both for "no match" and for a query it could not complete;
    # the two are indistinguishable, and on a host where it is the only tool
    # the alternative is refusing every launch. An lsof row always carries the
    # port, so an empty listing is taken as "nothing listening".
    return 1
  fi
  if command -v netstat >/dev/null 2>&1; then
    listing="$(netstat -ltn 2>/dev/null)" || return 2
    rc=0
    _in_listing "$listing" "$port" || rc=$?
    return "$rc"
  fi
  return 2
}

# instance_problem PIDFILE PORT -> why PIDFILE does not describe a live
# `wrangler dev` on PORT, or nothing when it does. Always returns 0; the caller
# treats non-empty output as the refusal.
#
# The port is what makes this an identity check rather than a liveness check: a
# recycled pid can belong to another worktree's wrangler dev, and probing or
# signalling that one is exactly the mistake this prevents. A pidfile that
# records no usable port therefore fails closed instead of skipping the check.
#
# The state dir is what ties the process to *this* worktree. launch.sh always
# starts its server with `--persist-to <worktree>/.verify/state`, so requiring
# that path (derived from the pidfile's own directory, no extra argument)
# rejects another worktree's wrangler dev even when a recycled pid happens to
# land on the port this record names.
instance_problem() {
  local file="$1" want_port="$2" pid port args state_dir
  pid="$(pidfile_field "$file" pid)"
  port="$(pidfile_field "$file" port)"
  if [ -z "$pid" ]; then
    echo "no instance recorded in $file (launch.sh not run)"
    return 0
  fi
  case "$port" in
    '' | *[!0-9]*)
      echo "pidfile $file records no usable port; refusing to trust pid $pid"
      return 0
      ;;
  esac
  if [ "$port" != "$want_port" ]; then
    echo "pidfile records port $port but this run is using $want_port"
    return 0
  fi
  # Liveness via ps(1), not kill -0: this sandbox returns EPERM for signals to
  # processes outside our descendants (a launch run through a background-task
  # tracker, say), which would make a live instance look dead.
  args="$(ps -o args= -p "$pid" 2>/dev/null)"
  if [ -z "$args" ]; then
    echo "recorded pid $pid is not running (stale pidfile — run cleanup.sh)"
    return 0
  fi
  case " $args " in
    *wrangler*" dev "*) ;;
    *)
      echo "pid $pid is not a wrangler dev (got: ${args:0:80})"
      return 0
      ;;
  esac
  case " $args " in
    *" --port $want_port "*) ;;
    *)
      echo "pid $pid is a wrangler dev on another port (no --port $want_port in: ${args:0:80})"
      return 0
      ;;
  esac
  state_dir="$(dirname "$file")/state"
  case " $args " in
    *" --persist-to $state_dir "*) ;;
    *)
      echo "pid $pid is not the instance launch.sh started here (no --persist-to $state_dir in: ${args:0:80})"
      return 0
      ;;
  esac
  return 0
}

# store_proven_empty BASE API_KEY ADMIN_KEY -> 0 when the admin health response
# proves the store holds no servable credential, 1 otherwise (including when the
# response cannot be read at all).
#
# The live key rows decide this, not just hasServableCredential: that flag is
# reported from the provider-pool snapshot, which is version-polled behind a 5s
# TTL, so a credential enabled a moment ago can still read false while its row
# is already in D1. Gating a paid generation probe on the flag alone therefore
# left a window in which a real, freshly seeded token would be spent.
store_proven_empty() {
  local base="$1" api="$2" admin="$3" store verdict
  store="$(curl -s --max-time 5 -H "Authorization: Bearer $api" \
    -H "X-Admin-Key: $admin" "$base/api/admin/health")" || return 1
  verdict="$(printf '%s' "$store" | node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      try {
        const h = JSON.parse(raw);
        const live = (h.keys ?? []).some(
          (k) => k.enabled === true && Number(k.weight) > 0
        );
        process.stdout.write(
          h.hasServableCredential === false && !live ? "empty" : "servable"
        );
      } catch {
        process.stdout.write("unreadable");
      }
    });
  ' 2>/dev/null)" || return 1
  [ "$verdict" = "empty" ]
}
