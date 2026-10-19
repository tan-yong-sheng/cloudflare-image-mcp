#!/usr/bin/env bash
# Full HTTP battery against the local verification instance: health, model
# listing, auth matrix, generation error contract, MCP initialize + tools,
# admin two-gate matrix, frontend pages. Every probe's request line, status,
# and body is captured to evidence/verify/<run-id>/battery.txt. The generation
# probe asserts the ADR-001 empty-credential contract, so it only runs when the
# store is proven to have no servable credential — otherwise that POST would
# reach the provider and spend real usage; the skip is printed with its reason.
# The whole battery is refused until ownership of the target is established:
# the admin section writes (it creates, rotates and disables a throwaway key),
# so it must never run against a listener this worktree did not launch.
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
# documented in CONTRIB.md — not secrets. Overridable so a worktree with a
# customised .dev.vars does not fail every probe with an unexplained 401.
API_KEY="${VERIFY_API_KEY:-local-dev-user-key}"
ADMIN_KEY="${VERIFY_ADMIN_KEY:-local-dev-admin-key}"

problem="$(instance_problem "$INSTANCE_FILE" "$VERIFY_PORT")"
if [ -n "$problem" ]; then
  echo "refusing: $problem" >&2
  echo "drive.sh only drives the instance launch.sh started (its admin section" >&2
  echo "writes keys) — start one, or stop the foreign listener on $VERIFY_PORT" >&2
  exit 1
fi
RUN_ID="$(date -u +%Y-%m-%dT%H%M%SZ)"
EVIDENCE_DIR="$WORKTREE_ROOT/evidence/verify/$RUN_ID"
mkdir -p "$EVIDENCE_DIR"
OUT="$EVIDENCE_DIR/battery.txt"
# Bodies land in a private temp file: a fixed /tmp path is predictable, so a
# pre-created symlink there would make curl overwrite an arbitrary file.
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT
failures=0

probe() { # label method path [(-H "K: V")...] [--data JSON]
  local label="$1" method="$2" path="$3"; shift 3
  local -a args=(-s -o "$BODY_FILE" -w '%{http_code}' --max-time 30 -X "$method")
  while [ $# -gt 0 ]; do
    case "$1" in
      -H) args+=(-H "$2"); shift 2 ;;
      --data) args+=(--data "$2"); shift 2 ;;
      *) echo "probe: unknown arg $1" >&2; return 2 ;;
    esac
  done
  local code; code="$(curl "${args[@]}" "$BASE$path")"
  {
    echo "### $label"
    echo "req: $method $path -> $code"
    head -c 600 "$BODY_FILE"; echo; echo
  } >>"$OUT"
  echo "$code"
}

expect() { # label got want
  if [ "$2" = "$3" ]; then echo "ok    $1 ($2)"; else echo "fail  $1 (got $2, want $3)"; failures=$((failures + 1)); fi
}

expect_body() { # label pattern
  if grep -qF -- "$2" "$BODY_FILE"; then
    echo "ok    $1"
  else
    echo "fail  $1 (body lacks '$2')"; failures=$((failures + 1))
  fi
}

expect_no_body() { # label pattern
  if grep -qF -- "$2" "$BODY_FILE"; then
    echo "fail  $1 (body still carries '$2')"; failures=$((failures + 1))
  else
    echo "ok    $1"
  fi
}

echo "battery -> $OUT"

expect "health is public" \
  "$(probe 'GET /health (public)' GET /health)" 200
expect "frontend / is public" \
  "$(probe 'GET / (public)' GET /)" 200
# The frontend is the React client now. The served document mounts into an
# empty #root and the client renders the rest; the legacy template shipped
# the login modal's markup inline, so its absence is what proves the
# cutover rather than a page that merely answers 200.
expect_body "frontend / serves the React client shell" 'id="root"'
expect_no_body "frontend / no longer serves the legacy template" 'id="loginModal"'
# The built bundle must be public too: every browser downloads it, and
# the asset binding is what serves it. The name is hashed, so it is read
# out of the document the client just served.
BUNDLE="$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' "$BODY_FILE" | head -1)"
if [ -z "$BUNDLE" ]; then
  echo "fail  the client document names no bundle"; failures=$((failures + 1))
else
  expect "the client bundle is public" \
    "$(probe "GET $BUNDLE (public)" GET "$BUNDLE")" 200
fi
expect "/index.html serves the client" \
  "$(probe 'GET /index.html (public)' GET /index.html)" 200
expect "/admin page is public" \
  "$(probe 'GET /admin (public)' GET /admin)" 200
expect_body "/admin serves the React client shell" 'id="root"'
expect "models without key is 401" \
  "$(probe 'GET /v1/models (no key)' GET /v1/models)" 401
expect "models with key is 200" \
  "$(probe 'GET /v1/models (bearer)' GET /v1/models -H "Authorization: Bearer $API_KEY")" 200

# ADR-001 error contract: the generator runs and reports the empty store.
# Gated on store_proven_empty (lib.sh) — the readiness flag lags a write by up
# to its 5s TTL, so a credential seeded a moment earlier could still read as
# empty while its row is already enabled, and this POST would reach the provider
# and spend real usage. Unreadable health output is the same refusal.
if store_proven_empty "$BASE" "$API_KEY" "$ADMIN_KEY"; then
  gen_code="$(probe 'POST /v1/images/generations (bearer, empty store)' POST /v1/images/generations \
    -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
    --data '{"model":"@cf/black-forest-labs/flux-1-schnell","prompt":"battery probe","n":1}')"
  expect "generation reports empty credential store" "$gen_code" 500
  if grep -q 'No AI provider credentials configured for transport' "$OUT" &&
    grep -q 'cloudflare-rest' "$OUT"; then
    echo "ok    generation error names cloudflare-rest (ADR-001 message)"
  else
    echo "fail  generation error does not carry the ADR-001 message"; failures=$((failures + 1))
  fi
else
  echo "skip  generation probe: store is not proven empty (a servable credential"
  echo "      would make this POST a real provider call). Delete the key or drop"
  echo "      .verify/state to assert the empty-credential contract on a fresh store."
fi

# MCP: streamable HTTP transport answers initialize inside an SSE frame.
mcp="$(curl -s --max-time 30 -X POST -H "Authorization: Bearer $API_KEY" \
  -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"verify-skill","version":"0"}}}' \
  "$BASE/mcp/message")"
echo "### MCP initialize /mcp/message" >>"$OUT"; echo "$mcp" >>"$OUT"; echo >>"$OUT"
if echo "$mcp" | grep -q '^data: ' && echo "$mcp" | grep -q 'serverInfo'; then
  echo "ok    MCP initialize answers in an SSE frame with serverInfo"
else
  echo "fail  MCP initialize: ${mcp:0:160}"; failures=$((failures + 1))
fi

# Admin API: two gates (bearer, then X-Admin-Key) — matrix from the repo's
# own contract cross-check, including write paths with a throwaway key.
if BASE_URL="$BASE" API_KEY="$API_KEY" ADMIN_KEY="$ADMIN_KEY" WRITES=1 \
  "$WORKTREE_ROOT/scripts/verify-admin-api.sh" >>"$OUT" 2>&1; then
  echo "ok    admin API contract (verify-admin-api.sh, reads + writes)"
else
  echo "fail  admin API contract — see $OUT"; failures=$((failures + 1))
fi

echo
echo "battery done: $failures failure(s); evidence in $EVIDENCE_DIR"
exit "$((failures > 0 ? 1 : 0))"
