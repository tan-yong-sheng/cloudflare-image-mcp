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
# body is grepped for the three secrets; a hit is reported as a leak and that
# body is withheld from the transcript instead of printed. ACCOUNT_ID is not
# scanned: GET /api/admin/health lists it per key as identity metadata, so a
# response carrying it is the contract working, not a leak. curl + grep/sed
# only; jq is used when present.

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

json_escape() { # value -> the body of a JSON string (backslash and quote escaped)
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# The line-based escape above cannot represent a newline, and a malformed body
# would make these checks test something other than the values supplied:
# refuse the value instead of sending it.
for var in PROVIDER_ID LABEL TOKEN ACCOUNT_ID; do
  case "${!var}" in
    *$'\n'*) echo "refusing: $var must not contain a newline" >&2; exit 2 ;;
  esac
done

# Escaped once for the request bodies; the leak tripwire below keeps using the
# raw values, because those are what a response would echo.
ESC_PROVIDER_ID="$(json_escape "$PROVIDER_ID")"
ESC_LABEL="$(json_escape "$LABEL")"
ESC_TOKEN="$(json_escape "$TOKEN")"
ESC_ACCOUNT_ID="$(json_escape "$ACCOUNT_ID")"

pass=0; fail=0
BODY="$(mktemp)"; LEAKS="$(mktemp)"
trap 'rm -f "$BODY" "$LEAKS"' EXIT

# Prints the first configured secret present in $BODY, else nothing.
leaked_secret() {
  local secret
  for secret in "$TOKEN" "$API_KEY" "$ADMIN_KEY"; do
    if [ -n "$secret" ] && grep -qF -- "$secret" "$BODY"; then
      printf '%s' "$secret"; return 0
    fi
  done
  return 1
}

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
  # Tripwire on every response, whatever it was. The hit is appended to $LEAKS
  # (a file, not a variable): most callers run raw inside $(...), so a variable
  # written here would die with the subshell and the report would come back
  # empty no matter what leaked.
  if leaked_secret >/dev/null; then
    printf '%s %s\n' "$method" "$path" >>"$LEAKS"
  fi
}

check() { # label expected actual
  if [ "$2" = "$3" ]; then
    printf 'PASS  %-56s %s\n' "$1" "$3"; pass=$((pass + 1))
  else
    printf 'FAIL  %-56s expected %s, got %s\n' "$1" "$2" "$3"; fail=$((fail + 1))
  fi
}

show() { # one-line, truncated view of $BODY; withheld when it carries a secret
  if leaked_secret >/dev/null; then
    printf '      %s\n' "<withheld: this body contained a configured secret>"
  else
    printf '      %s\n' "$(tr -d '\n' < "$BODY" | cut -c1-220)"
  fi
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
    "{\"providerId\":\"$ESC_PROVIDER_ID\",\"label\":\"$ESC_LABEL\",\"apiToken\":\"$ESC_TOKEN\",\"accountId\":\"$ESC_ACCOUNT_ID\"}")"
  show
  if [ -n "$HAVE_JQ" ]; then
    NEWID="$(jq -r '.id // empty' < "$BODY" 2>/dev/null)"
  else
    NEWID="$(sed -n 's/.*"id":[[:space:]]*\([0-9]\+\).*/\1/p' "$BODY" | head -1)"
  fi
  case "$(compact)" in
    *"\"label\":\"$ESC_LABEL\""*)
      printf 'PASS  %-56s %s\n' "add echoes the label, not the token" "$LABEL"; pass=$((pass + 1)) ;;
    *) printf 'FAIL  %-56s body did not echo label %s\n' "add echoes the label" "$LABEL"; fail=$((fail + 1)) ;;
  esac

  echo
  echo "== validation =="
  check "duplicate label is a 409" 409 "$(raw POST /api/admin/keys --body \
    "{\"providerId\":\"$ESC_PROVIDER_ID\",\"label\":\"$ESC_LABEL\",\"apiToken\":\"$ESC_TOKEN\",\"accountId\":\"$ESC_ACCOUNT_ID\"}")"
  check "unknown provider is a 400" 400 "$(raw POST /api/admin/keys --body \
    "{\"providerId\":\"nope\",\"label\":\"$ESC_LABEL-x\",\"apiToken\":\"$ESC_TOKEN\"}")"
  check "missing apiToken is a 400" 400 "$(raw POST /api/admin/keys --body \
    "{\"providerId\":\"$ESC_PROVIDER_ID\",\"label\":\"$ESC_LABEL-y\"}")"
  # Built with printf, not seq: seq is absent by default on macOS/BSD, where an
  # empty LONG would make the length check pass for the wrong reason.
  LONG="$(printf '%*s' 5000 '' | tr ' ' x)"
  check "token over 4096 chars is a 400" 400 "$(raw POST /api/admin/keys --body \
    "{\"providerId\":\"$ESC_PROVIDER_ID\",\"label\":\"$ESC_LABEL-z\",\"apiToken\":\"$LONG\"}")"
  BIG="$(printf '%*s' 20000 '' | tr ' ' y)"
  check "body over 16 KiB is a 413" 413 "$(raw POST /api/admin/keys --body \
    "{\"providerId\":\"$ESC_PROVIDER_ID\",\"label\":\"$ESC_LABEL-big\",\"apiToken\":\"$BIG\"}")"

  if [ -n "$NEWID" ]; then
    echo
    echo "== rotate and disable key $NEWID =="
    check "rotate is a 200" 200 "$(raw POST "/api/admin/keys/$NEWID/rotate" --body \
      "{\"apiToken\":\"$ESC_TOKEN-rotated\"}")"
    show
    check "rotate reports the next version" 2 "$(field '.activeVersion' activeVersion)"
    check "rotate to an unknown id is a 404" 404 "$(raw POST /api/admin/keys/999999999/rotate --body \
      "{\"apiToken\":\"$ESC_TOKEN\"}")"
    HUGE_ID_STATUS="$(raw POST /api/admin/keys/99999999999999999999/rotate --body "{\"apiToken\":\"$ESC_TOKEN\"}")"
    printf 'NOTE  rotate with an id past a safe integer: HTTP %s\n' "$HUGE_ID_STATUS"
    check "disable is a 200" 200 "$(raw POST "/api/admin/keys/$NEWID/disable")"
    raw GET /api/admin/health >/dev/null
    if [ -n "$HAVE_JQ" ]; then
      parked="$(jq -r --argjson id "$NEWID" '.keys[] | select(.id == $id) | .enabled' < "$BODY" 2>/dev/null)"
      check "health shows the key parked" "false" "$parked"
    else
      case "$(compact)" in
        *"\"label\":\"$ESC_LABEL\",\"weight\""*"\"enabled\":false"*)
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
if [ -s "$LEAKS" ]; then
  printf 'FAIL  secrets appeared in a response body for:\n'
  sed 's/^/        /' "$LEAKS"
  printf '      (a body carrying one of them is printed as <withheld> above)\n'
  fail=$((fail + 1))
else
  printf 'PASS  %-56s none of the three secrets appeared in any response\n' "secret tripwire"
  pass=$((pass + 1))
fi
printf '\nchecks: %s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
