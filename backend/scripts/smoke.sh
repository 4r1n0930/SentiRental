#!/usr/bin/env bash
#
# End-to-end smoke test for a running SentiRental API.
#
#   ./scripts/smoke.sh              # against http://localhost:3000
#   API=http://localhost:3005 ./scripts/smoke.sh
#
# Exercises the flows the mobile app depends on: register (as OWNER and as
# TENANT), verify, login, owner-only reads/writes, refresh rotation, and the
# role gate. Exits non-zero on the first failure.
#
# Verification needs the raw token, which the API only returns when
# DEV_EXPOSE_TOKENS=true. This script flips that flag in .env, restarts the
# server, runs the checks, then restores the original value — so it is safe to
# run repeatedly but you must NOT run it against a production deployment.

set -euo pipefail

API="${API:-http://localhost:3000}"
ENV_FILE="${ENV_FILE:-.env}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/$ENV_FILE"

# The port the API actually binds, derived from the URL we were asked to probe,
# so a restart does not silently fall back to the .env default.
SERVER_PORT="${API##*:}"
SERVER_PORT="${SERVER_PORT%%/*}"
export SERVER_PORT

pass=0
fail=0

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
head1() { printf '\n\033[1m%s\033[0m\n' "$1"; }

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    green "  PASS  $label"
    pass=$((pass + 1))
  else
    red   "  FAIL  $label (expected $expected, got $actual)"
    fail=$((fail + 1))
  fi
}

status_of() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
json_of()   { curl -s "$@"; }

STASH="$(mktemp)"
cp "$ENV_FILE" "$STASH"
restore_env() { cp "$STASH" "$ENV_FILE"; rm -f "$STASH"; }
trap restore_env EXIT

ORIGINAL_EXPOSE="$(grep -E '^DEV_EXPOSE_TOKENS=' "$ENV_FILE" || echo 'DEV_EXPOSE_TOKENS=false')"

restart_server() {
  # Match only this project's API process. `pgrep -f` alone also matches the
  # grep itself, so exclude our own pid.
  pkill -f 'node dist/src/main.js' 2>/dev/null || true
  sleep 2
  # PORT is exported so the restarted server keeps listening where we probed it;
  # .env alone would send it back to its own PORT (3000).
  ( cd "$ROOT_DIR" && PORT="$SERVER_PORT" setsid nohup node dist/src/main.js >/tmp/senti-api.log 2>&1 & )
  for _ in $(seq 1 30); do
    if curl -sf "$API/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "Server did not come up. See /tmp/senti-api.log" >&2
  exit 1
}

head1 "SentiRental API smoke test against $API"

# Start the API if it is not already up, so the script works from a cold start.
if ! curl -sf "$API/health" >/dev/null 2>&1; then
  echo "  no server on $API — starting one"
  restart_server
fi

head1 "1. Health"
check "GET /health is 200" "$(status_of "$API/health")" 200
check "GET /health/ready is 200" "$(status_of "$API/health/ready")" 200
DB_STATUS="$(json_of "$API/health/ready" | sed -n 's/.*"status":"\([a-z]*\)".*/\1/p' | head -1)"
check "database reports up" "$DB_STATUS" "up"

head1 "2. Enabling DEV_EXPOSE_TOKENS (development only)"
sed -i "s/^DEV_EXPOSE_TOKENS=.*/DEV_EXPOSE_TOKENS=true/" "$ENV_FILE"
restart_server
echo "  flag set to true; it will be restored to '$ORIGINAL_EXPOSE' on exit"

stamp="$(date +%s)"
OWNER_EMAIL="owner+$stamp@example.com"
TENANT_EMAIL="tenant+$stamp@example.com"
PASSWORD='Str0ng!Passw0rd'
BASE="$API/api/v1"

head1 "3. Register an OWNER"
REG="$(json_of -X POST "$BASE/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\",\"firstName\":\"Smoke\",\"lastName\":\"Owner\",\"role\":\"OWNER\"}")"
echo "$REG" | grep -q '"role":"OWNER"' \
  && { green "  PASS  role=OWNER accepted"; pass=$((pass+1)); } \
  || { red "  FAIL  role not OWNER: $REG"; fail=$((fail+1)); }
VT="$(echo "$REG" | sed -n 's/.*"devVerificationToken":"\([^"]*\)".*/\1/p')"
[ -n "$VT" ] && { green "  PASS  dev verification token issued"; pass=$((pass+1)); } \
             || { red "  FAIL  no dev token — is DEV_EXPOSE_TOKENS working?"; fail=$((fail+1)); }

head1 "4. Verify email"
check "POST /auth/verify-email is 200" \
  "$(status_of -X POST "$BASE/auth/verify-email" -H 'content-type: application/json' -d "{\"token\":\"$VT\"}")" 200

head1 "5. Login"
LOGIN="$(json_of -X POST "$BASE/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\"}")"
AT="$(echo "$LOGIN" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')"
RT="$(echo "$LOGIN" | sed -n 's/.*"refreshToken":"\([^"]*\)".*/\1/p')"
[ -n "$AT" ] && [ -n "$RT" ] && { green "  PASS  access + refresh tokens issued"; pass=$((pass+1)); } \
                                || { red "  FAIL  login did not return tokens"; fail=$((fail+1)); }
echo "$LOGIN" | grep -q '"status":"ACTIVE"' \
  && { green "  PASS  account is ACTIVE"; pass=$((pass+1)); } \
  || { red "  FAIL  account not ACTIVE"; fail=$((fail+1)); }
AUTH=(-H "authorization: Bearer $AT")

head1 "6. Authenticated owner access"
check "GET /users/me is 200" "$(status_of "$BASE/users/me" "${AUTH[@]}")" 200
check "GET /users (OWNER only) is 200" "$(status_of "$BASE/users" "${AUTH[@]}")" 200
PROP_CODE="SMOKE-$stamp"
check "POST /properties is 201" \
  "$(status_of -X POST "$BASE/properties" "${AUTH[@]}" -H 'content-type: application/json' \
     -d "{\"name\":\"Smoke Tower\",\"code\":\"$PROP_CODE\",\"type\":\"APARTMENT\",\"addressLine1\":\"1 Test St\",\"city\":\"Delhi\",\"state\":\"DL\",\"postalCode\":\"110001\"}")" 201

head1 "7. Refresh rotation"
check "POST /auth/refresh is 200" \
  "$(status_of -X POST "$BASE/auth/refresh" -H 'content-type: application/json' -d "{\"refreshToken\":\"$RT\"}")" 200
REUSE="$(status_of -X POST "$BASE/auth/refresh" -H 'content-type: application/json' -d "{\"refreshToken\":\"$RT\"}")"
if [ "$REUSE" = "401" ]; then
  green "  PASS  reusing a rotated refresh token is rejected"
  pass=$((pass + 1))
else
  red "  FAIL  old refresh token was accepted (expected 401, got $REUSE)"
  fail=$((fail + 1))
fi

head1 "8. Unauthenticated access is refused"
check "GET /users/me without token is 401" "$(status_of "$BASE/users/me")" 401

head1 "9. Role gate: TENANT cannot reach owner routes"
TVT="$(json_of -X POST "$BASE/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$TENANT_EMAIL\",\"password\":\"$PASSWORD\",\"firstName\":\"Smoke\",\"lastName\":\"Tenant\"}" \
  | sed -n 's/.*"devVerificationToken":"\([^"]*\)".*/\1/p')"
curl -s -o /dev/null -X POST "$BASE/auth/verify-email" -H 'content-type: application/json' -d "{\"token\":\"$TVT\"}"
TAT="$(json_of -X POST "$BASE/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$TENANT_EMAIL\",\"password\":\"$PASSWORD\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')"
check "TENANT GET /users is 403" "$(status_of "$BASE/users" -H "authorization: Bearer $TAT")" 403
check "TENANT POST /properties is 403" \
  "$(status_of -X POST "$BASE/properties" -H "authorization: Bearer $TAT" -H 'content-type: application/json' \
     -d '{"name":"X","code":"XX1","type":"HOUSE","addressLine1":"a","city":"c","state":"s","postalCode":"1"}')" 403
check "TENANT GET /tenants/me is 200" "$(status_of "$BASE/tenants/me" -H "authorization: Bearer $TAT")" 200

head1 "10. Swagger"
check "GET /api/v1/docs is 200" "$(status_of "$BASE/docs")" 200
check "GET /api/v1/docs-json is 200" "$(status_of "$BASE/docs-json")" 200

restore_env
trap - EXIT

head1 "Result"
echo "  passed: $pass"
echo "  failed: $fail"
[ "$fail" -eq 0 ] || exit 1
green "All checks passed."