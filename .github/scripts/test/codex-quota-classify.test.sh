#!/usr/bin/env bash
# Tests for codex-quota-classify.sh — exit 0 = quota-blocked, exit 1 = not.
# Run: bash .github/scripts/test/codex-quota-classify.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLASSIFY="$HERE/../codex-quota-classify.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0 fail=0
# assert <expected-exit> <name> <log-content>
assert() {
  local want="$1" name="$2" content="$3" log="$TMP/log.txt" got
  printf '%s\n' "$content" > "$log"
  bash "$CLASSIFY" "$log" >/dev/null 2>&1; got=$?
  if [ "$got" -eq "$want" ]; then
    pass=$((pass+1)); echo "ok   - $name"
  else
    fail=$((fail+1)); echo "FAIL - $name (want exit $want, got $got)"
  fi
}

# --- quota-blocked logs (expect exit 0) ---
assert 0 "structured usage_limit_reached" \
  'stream error: unexpected status 429: {"error":{"type":"usage_limit_reached","message":"..."}}'
assert 0 "you've hit your usage limit" \
  "You've hit your usage limit. To get more access now, try again at 2026-06-20T18:00."
assert 0 "retry limit exhausted 429" \
  'codex: exceeded retry limit, last status: 429 Too Many Requests'
assert 0 "case-insensitive USAGE LIMIT" \
  'ERROR: USAGE LIMIT REACHED for this account'
assert 0 "model at capacity" \
  'ERROR: Selected model is at capacity. Please try a different model.'

# --- genuine failures (expect exit 1) ---
assert 1 "go build error" \
  'run-gates: go build failed.
./engine/world.go:12: undefined: Foo'
assert 1 "unrelated 'limiting' word" \
  'Implemented rate limiting middleware for the API; all tests passed.'
assert 1 "empty log" ""
assert 1 "generic codex crash" \
  'panic: runtime error: invalid memory address or nil pointer dereference'

echo "----"
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
