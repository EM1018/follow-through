#!/usr/bin/env bash
set -euo pipefail

# Benchmarks hot endpoints with autocannon. GET endpoints are safe to hammer
# freely. Writes are opt-in and bounded by request *count* (-a), not duration
# (-d) - a duration-based run against a POST endpoint has no predictable cap
# on how many rows it creates.
#
# Usage:
#   TOKEN=<jwt> ./scripts/load_test.sh                    # reads only
#   TOKEN=<jwt> PLAN_ID=<uuid> ./scripts/load_test.sh      # + plan-nested reads
#   TOKEN=<jwt> ./scripts/load_test.sh --include-writes    # + POST /plans demo
#
# TOKEN   - Supabase access token, e.g. `uv run python scripts/get_token.py`
# PLAN_ID - an existing plan id (see GET /plans) to benchmark nested resources
#           (workouts / schedule / schedule-entries)

BASE_URL="${BASE_URL:-http://localhost:8000}"
CONNECTIONS="${CONNECTIONS:-10}"
DURATION="${DURATION:-10}"
WRITE_AMOUNT="${WRITE_AMOUNT:-20}"
WRITE_CONNECTIONS="${WRITE_CONNECTIONS:-5}"

INCLUDE_WRITES=false
for arg in "$@"; do
  [[ "$arg" == "--include-writes" ]] && INCLUDE_WRITES=true
done

if [[ -z "${TOKEN:-}" ]]; then
  echo "Set TOKEN to a Supabase access token (see scripts/get_token.py)" >&2
  exit 1
fi

AUTH_HEADER="Authorization: Bearer ${TOKEN}"

run() {
  local name="$1"; shift
  echo
  echo "== ${name} =="
  npx --yes autocannon "$@"
}

# --- reads: no side effects, safe to hammer ---
# from/to bound a date window - both /completions and .../schedule require
# them (no defaults), so a bare URL fails FastAPI's query validation with a
# 422 on every request. Window just needs to be valid (from <= to, <=92
# days) - dates outside a plan's actual window just resolve empty, no error.
FROM_DATE="$(date -u +%F)"
TO_DATE="$(date -u -v+7d +%F)"

run "GET /health"      -c "$CONNECTIONS" -d "$DURATION" "${BASE_URL}/health"
run "GET /me"          -c "$CONNECTIONS" -d "$DURATION" -H "$AUTH_HEADER" "${BASE_URL}/me"
run "GET /plans"       -c "$CONNECTIONS" -d "$DURATION" -H "$AUTH_HEADER" "${BASE_URL}/plans"
run "GET /commitments" -c "$CONNECTIONS" -d "$DURATION" -H "$AUTH_HEADER" "${BASE_URL}/commitments"
run "GET /activities"  -c "$CONNECTIONS" -d "$DURATION" -H "$AUTH_HEADER" "${BASE_URL}/activities"
run "GET /completions" -c "$CONNECTIONS" -d "$DURATION" -H "$AUTH_HEADER" "${BASE_URL}/completions?from=${FROM_DATE}&to=${TO_DATE}"

if [[ -n "${PLAN_ID:-}" ]]; then
  run "GET /plans/{id}"                  -c "$CONNECTIONS" -d "$DURATION" -H "$AUTH_HEADER" "${BASE_URL}/plans/${PLAN_ID}"
  run "GET /plans/{id}/workouts"         -c "$CONNECTIONS" -d "$DURATION" -H "$AUTH_HEADER" "${BASE_URL}/plans/${PLAN_ID}/workouts"
  run "GET /plans/{id}/schedule"         -c "$CONNECTIONS" -d "$DURATION" -H "$AUTH_HEADER" "${BASE_URL}/plans/${PLAN_ID}/schedule?from=${FROM_DATE}&to=${TO_DATE}"
  run "GET /plans/{id}/schedule-entries" -c "$CONNECTIONS" -d "$DURATION" -H "$AUTH_HEADER" "${BASE_URL}/plans/${PLAN_ID}/schedule-entries"
else
  echo
  echo "set PLAN_ID. skipping plan-nested reads (workouts/schedule/schedule-entries)."
fi

if [[ "$INCLUDE_WRITES" != true ]]; then
  echo
  echo "Skipping writes (pass --include-writes to also run POST /plans; each request creates a real row)."
  exit 0
fi

# --- writes: bounded by request count, not duration, so the number of rows
# created is predictable. Tagged with a marker prefix for easy cleanup. ---
STARTS_ON="$(date -u +%F)"
run "POST /plans (x${WRITE_AMOUNT})" -c "$WRITE_CONNECTIONS" -a "$WRITE_AMOUNT" \
  -m POST -H "$AUTH_HEADER" -H "content-type: application/json" \
  -b "{\"name\":\"[load-test] plan\",\"is_active\":false,\"starts_on\":\"${STARTS_ON}\"}" \
  "${BASE_URL}/plans"

echo
echo "Created up to ${WRITE_AMOUNT} plans named '[load-test] plan' - delete them from the DB when done."
