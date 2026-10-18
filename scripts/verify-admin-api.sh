#!/usr/bin/env bash
# Cross-check the provider admin API contract (/api/admin/*, issue #74) against
# a running Worker — local (`npx wrangler dev`) or deployed. See CONTRIB.md
# ("Develop and Test") for the local recipe and docs/CREDENTIALS_SETUP.md for the
# endpoints. Against a Worker that predates the admin routes, the checks fail by
# design: that is the answer, not a bug in the script.
#
# Usage:
#   BASE_URL=http://127.0.0.1:8787 \
#   API_KEY=local-dev-user-key ADMIN_KEY=local-dev-admin-key \
#   scripts/verify-admin-api.sh
#
# Env:
#   BASE_URL    required, no trailing slash (e.g. https://<worker>.workers.dev)
#   API_KEY     required, gate 1: the app-wide bearer key (API_KEYS)
#   ADMIN_KEY   required, gate 2: the management key (X-Admin-Key)
#   WRITES      1 (default) creates/rotates/disables a throwaway key; 0 = reads only
#   LABEL       label for that key       (default crosscheck-<epoch>)
#   TOKEN       provider token for it    (default synthetic, not a real credential)
#   ACCOUNT_ID  provider account id      (default synthetic; required by the
#                 POST /api/admin/keys contract for cloudflare keys, #98)
#   PROVIDER_ID provider id              (default cloudflare)
#
# Secrets come from the environment only and are never printed. Every response
# body is grepped for all three secrets; a hit is reported as a leak and the
# body is withheld. curl + grep/sed only; jq is used when present.

set -u

BASE_URL="${BASE_URL:?set BASE_URL (no trailing slash)}"
BASE_URL="${BASE_URL%/}"
API_KEY="${API_KEY:?set API_KEY (bearer key, gate 1)}"
ADMIN_KEY="${ADMIN_KEY:?set ADMIN_KEY (management key, gate 2)}"
WRITES="${WRITES:-1}"
PROVIDER_ID="${PROVIDER_ID:-cloudflare}"
LABEL="${LABEL:-crosscheck-$(date +%s)}"
TOKEN="${TOKEN:-synthetic-crosscheck-token-abcdefghijklmnop}"
ACCOUNT_ID="${ACCOUNT_ID:-synthetic-crosscheck-account-id}"
HAVE_JQ="$(command -v jq || true)"

pass=0; fail=0; leaked=""
BODY="$(mktemp)"; trap 'rm -f "$BODY"' EXIT

# raw METHOD PATH [--bearer V|--no-bearer] [--admin V|--no-admin] [--body JSON]
# Prints the HTTP status on stdout; the body lands in $BODY.
raw() {
  local method="$1" path="$2"; shift 2
  local bearer="$API_KEY" admin="$ADMIN_KEY" body=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --bearer)    bearer="$2"; shift 2 ;;
      --no-bearer) bearer="";   shift ;;
      --admin)     admin="$2";  shift 2 ;;
      --no-admin)  admin="";    shift ;;
      --body)      body="$2";   shift 2 ;;
      *) echo "raw: unknown argument $1" >&2; exit 2 ;;
    esac
  done
  local args=(-sS -o "$BODY" -w '%{http_code}' -X "$method" "$BASE_URL$path")
  [ -n "$body" ]   && args+=(-H 'Content-Type: application/json' --data-binary "$body")
  [ -n "$bearer" ] && args+=(-H "Authorization: Bearer $bearer")
  [ -n "$admin" ]  && args+=(-H "X-Admin-Key: $admin")
  curl "${args[@]}"
  # Tripwire on every response, whatever it was.
  local secret
  for secret in "$TOKEN" "$API_KEY" "$ADMIN_KEY"; do
    if [ -n "$secret" ] && grep -qF -- "$secret" "$BODY"; then
      leaked="$leaked $method $path"
    fi
  done
}

check() { # label expected actual
  if [ "$2" = "$3" ]; then
    printf 'PASS  %-56s %s\n' "$1" "$3"; pass=$((pass + 1))
  else
    printf 'FAIL  %-56s expected %s, got %s\n' "$1" "$2" "$3"; fail=$((fail + 1))
  fi
}

show() { # one-line, truncated view of $BODY (safe: no secrets reached here)
  printf '      %s\n' "$(tr -d '\n' < "$BODY" | cut -c1-220)"
}

compact() { tr -d '[:space:]' < "$BODY"; }

field() { # jq when available, else a narrow sed fallback
  if [ -n "$HAVE_JQ" ]; then jq -r "$1" < "$BODY" 2>/dev/null
  else sed -n "s/.*\"${2}\":[[:space:]]*\([^,}]*\).*/\1/p" "$BODY" | head -1; fi
}

echo "== gates (gate 1 bearer, gate 2 management key) =="
check "no bearer is a 401"                              401 "$(raw GET /api/admin/health --no-bearer)"
check "wrong bearer is a 401 with the right admin key"  401 "$(raw GET /api/admin/health --bearer not-the-key)"
check "right bearer + wrong admin key is a 403"          403 "$(raw GET /api/admin/health --admin not-the-key)"
check "right bearer + no admin key is a 403"             403 "$(raw GET /api/admin/health --no-admin)"

echo
echo "== health =="
check "health with both gates is a 200"                  200 "$(raw GET /api/admin/health)"
show
for f in providers keys exposure configVersion; do
  if grep -q "\"$f\"" "$BODY"; then
    printf 'PASS  %-56s present\n' "health exposes $f"; pass=$((pass + 1))
  else
    printf 'FAIL  %-56s missing\n' "health exposes $f"; fail=$((fail + 1))
  fi
done

NEWID=""
if [ "$WRITES" = "1" ]; then
  echo
  echo "== add a throwaway key (label $LABEL) =="
  check "add is a 201" 201 "$(raw POST /api/admin/keys --body \
    "{\"providerId\":\"$PROVIDER_ID\",\"label\":\"$LABEL\",\"apiToken\":\"$TOKEN\",\"accountId\":\"$ACCOUNT_ID\"}")"
  show
  if [ -n "$HAVE_JQ" ]; then
    NEWID="$(jq -r '.id // empty' < "$BODY" 2>/dev/null)"
  else
    NEWID="$(sed -n 's/.*"id":[[:space:]]*\([0-9]\+\).*/\1/p' "$BODY" | head -1)"
  fi
  case "$(compact)" in
    *"\"label\":\"$LABEL\""*)
      printf 'PASS  %-56s %s\n' "add echoes the label, not the token" "$LABEL"; pass=$((pass + 1)) ;;
    *) printf 'FAIL  %-56s body did not echo label %s\n' "add echoes the label" "$LABEL"; fail=$((fail + 1)) ;;
  esac

  echo
  echo "== validation =="
  check "duplicate label is a 409" 409 "$(raw POST /api/admin/keys --body \
    "{\"providerId\":\"$PROVIDER_ID\",\"label\":\"$LABEL\",\"apiToken\":\"$TOKEN\",\"accountId\":\"$ACCOUNT_ID\"}")"
  check "unknown provider is a 400" 400 "$(raw POST /api/admin/keys --body \
    "{\"providerId\":\"nope\",\"label\":\"$LABEL-x\",\"apiToken\":\"$TOKEN\"}")"
  check "missing apiToken is a 400" 400 "$(raw POST /api/admin/keys --body \
    "{\"providerId\":\"$PROVIDER_ID\",\"label\":\"$LABEL-y\"}")"
  LONG="$(printf 'x%.0s' $(seq 1 5000))"
  check "token over 4096 chars is a 400" 400 "$(raw POST /api/admin/keys --body \
    "{\"providerId\":\"$PROVIDER_ID\",\"label\":\"$LABEL-z\",\"apiToken\":\"$LONG\"}")"
  BIG="$(printf 'y%.0s' $(seq 1 20000))"
  check "body over 16 KiB is a 413" 413 "$(raw POST /api/admin/keys --body \
    "{\"providerId\":\"$PROVIDER_ID\",\"label\":\"$LABEL-big\",\"apiToken\":\"$BIG\"}")"

  if [ -n "$NEWID" ]; then
    echo
    echo "== rotate and disable key $NEWID =="
    check "rotate is a 200" 200 "$(raw POST "/api/admin/keys/$NEWID/rotate" --body \
      "{\"apiToken\":\"$TOKEN-rotated\"}")"
    show
    check "rotate reports the next version" 2 "$(field '.activeVersion' activeVersion)"
    check "rotate to an unknown id is a 404" 404 "$(raw POST /api/admin/keys/999999999/rotate --body \
      "{\"apiToken\":\"$TOKEN\"}")"
    HUGE_ID_STATUS="$(raw POST /api/admin/keys/99999999999999999999/rotate --body "{\"apiToken\":\"$TOKEN\"}")"
    printf 'NOTE  rotate with an id past a safe integer: HTTP %s\n' "$HUGE_ID_STATUS"
    check "disable is a 200" 200 "$(raw POST "/api/admin/keys/$NEWID/disable")"
    raw GET /api/admin/health >/dev/null
    if [ -n "$HAVE_JQ" ]; then
      parked="$(jq -r --argjson id "$NEWID" '.keys[] | select(.id == $id) | .enabled' < "$BODY" 2>/dev/null)"
      check "health shows the key parked" "false" "$parked"
    else
      case "$(compact)" in
        *"\"label\":\"$LABEL\",\"weight\""*"\"enabled\":false"*)
          printf 'PASS  %-56s false\n' "health shows a parked key"; pass=$((pass + 1)) ;;
        *) printf 'FAIL  %-56s no parked key visible (install jq for a precise check)\n' \
             "health shows the key parked"; fail=$((fail + 1)) ;;
      esac
    fi
    printf 'NOTE  the throwaway key %s is now disabled; delete the row if you want it gone.\n' "$NEWID"
  else
    printf 'FAIL  could not read the new key id from the add response (body format?)\n'; fail=$((fail + 1))
  fi
else
  echo
  echo "WRITES=0 — skipped add/rotate/disable (nothing was created)"
fi

echo
if [ -n "$leaked" ]; then
  printf 'FAIL  secrets appeared in a response body for:%s\n' "$leaked"
  fail=$((fail + 1))
else
  printf 'PASS  %-56s none of the three secrets appeared in any response\n' "secret tripwire"
  pass=$((pass + 1))
fi
printf '\nchecks: %s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
