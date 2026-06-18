#!/usr/bin/env bash
# Verification gate for the Dev agent — run the project's real test suites and
# fail (exit 1) if anything is red, so the caller's auto-merge step is skipped
# and the PR is left open for a human.
#
# Fails CLOSED: if the repo declares a toolchain (go.mod, web/package.json, or a
# root package.json) but the tool is missing on the runner, that is a gate
# FAILURE, not a skip. Merging unverified code is exactly what this prevents —
# an earlier version only knew about a root package.json (absent here) and so
# silently passed every Go change, letting a red `go test` reach main.
#
# Run from the repo root. No env required.
set -uo pipefail

FAILED=0
RAN_ANYTHING=0
fail() { echo "run-gates: $1"; FAILED=1; }

# --- Go engine ---------------------------------------------------------------
if [ -f go.mod ]; then
  RAN_ANYTHING=1
  if ! command -v go >/dev/null 2>&1; then
    fail "go.mod present but 'go' is not installed on the runner — cannot verify (see docs/agents-setup.md)."
  else
    echo "run-gates: go build ./..." && { go build ./... || fail "go build failed."; }
    echo "run-gates: go vet ./..."   && { go vet ./...   || fail "go vet failed."; }
    echo "run-gates: go test ./..."  && { go test ./...  || fail "go test failed."; }
  fi
fi

# --- Web client (unit suite only; the heavy Playwright e2e runs in the
#     push-to-main `tests` workflow, not on every gate) ------------------------
if [ -f web/package.json ] && \
   node -e "process.exit(((require('./web/package.json').scripts)||{}).test?0:1)" 2>/dev/null; then
  RAN_ANYTHING=1
  if ! command -v npm >/dev/null 2>&1; then
    fail "web/package.json defines a test script but 'npm' is not installed on the runner."
  else
    echo "run-gates: (web) npm ci && npm test"
    ( cd web && npm ci && npm test ) || fail "web tests failed."
  fi
fi

# --- Root package.json (other repos / scaffolds whose toolchain lives at root)-
if [ -f package.json ]; then
  if [ -f yarn.lock ]; then RUN="yarn"; elif [ -f pnpm-lock.yaml ]; then RUN="pnpm"; else RUN="npm run"; fi
  for g in lint typecheck test; do
    if node -e "process.exit(((require('./package.json').scripts)||{})['$g']?0:1)" 2>/dev/null; then
      RAN_ANYTHING=1
      echo "run-gates: ($g) $RUN $g"
      # shellcheck disable=SC2086
      $RUN "$g" || fail "root '$g' gate failed."
    fi
  done
fi

if [ "$FAILED" -ne 0 ]; then
  echo "run-gates: verification FAILED — not merging."
  exit 1
fi
if [ "$RAN_ANYTHING" -eq 0 ]; then
  echo "run-gates: no recognized toolchain (no go.mod / web/package.json / package.json) — nothing to verify."
fi
echo "run-gates: all applicable gates passed."
exit 0
