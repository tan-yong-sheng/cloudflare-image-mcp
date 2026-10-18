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

# port_in_use PORT -> 0 listening, 1 free, 2 cannot tell.
# Any local address counts: 0.0.0.0 and [::] own the port as much as loopback
# does. ss is Linux-only, so lsof and netstat are tried before giving up.
port_in_use() {
  local port="$1" listing
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ":$port " && return 0
    return 1
  fi
  if command -v lsof >/dev/null 2>&1; then
    listing="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null)" || true
    [ -n "$listing" ] && return 0
    return 1
  fi
  if command -v netstat >/dev/null 2>&1; then
    listing="$(netstat -ltn 2>/dev/null)" || true
    printf '%s\n' "$listing" | grep -q ":$port " && return 0
    return 1
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
instance_problem() {
  local file="$1" want_port="$2" pid port args
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
