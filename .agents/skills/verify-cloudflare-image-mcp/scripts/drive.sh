#!/usr/bin/env bash
# Full HTTP battery against the local verification instance: health, model
# listing, auth matrix, generation error contract, MCP initialize + tools,
# admin two-gate matrix, frontend pages. Every probe's request line, status,
# and body is captured to evidence/verify/<run-id>/battery.txt. The generation
# probe asserts the ADR-001 empty-credential contract, so it only runs when the
# store is proven to have no servable credential — otherwise that POST would
# reach the provider and spend real usage; the skip is printed with its reason.
#
# Env:
#   VERIFY_PORT  port the instance listens on (default 8788)
set -uo pipefail

WORKTREE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
VERIFY_PORT="${VERIFY_PORT:-8788}"
BASE="http://127.0.0.1:$VERIFY_PORT"
API_KEY="local-dev-user-key"
ADMIN_KEY="local-dev-admin-key"
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

echo "battery -> $OUT"

expect "health is public" \
  "$(probe 'GET /health (public)' GET /health)" 200
expect "frontend / is public" \
  "$(probe 'GET / (public)' GET /)" 200
expect "/admin page is public" \
  "$(probe 'GET /admin (public)' GET /admin)" 200
expect "models without key is 401" \
  "$(probe 'GET /v1/models (no key)' GET /v1/models)" 401
expect "models with key is 200" \
  "$(probe 'GET /v1/models (bearer)' GET /v1/models -H "Authorization: Bearer $API_KEY")" 200

# ADR-001 error contract: the generator runs and reports the empty store.
# Gated on the store's own readiness flag — with a servable credential present
# this POST would reach the provider and spend real usage. An unreadable admin
# endpoint means no proof of emptiness, so the probe is skipped there too.
store="$(curl -s --max-time 5 -H "Authorization: Bearer $API_KEY" \
  -H "X-Admin-Key: $ADMIN_KEY" "$BASE/api/admin/health")"
if printf '%s' "$store" | tr -d '[:space:]' | grep -q '"hasServableCredential":false'; then
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
