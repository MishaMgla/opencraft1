#!/usr/bin/env bash
# Auto-detecting verification gate for the Dev agent.
#
# If a package.json exists AND defines a given script (lint / typecheck / test),
# run it. Any defined script that fails fails this gate (exit 1). If package.json
# is absent or a script is undefined, that gate is skipped (the repo is a scaffold
# with no toolchain yet). With nothing to run, the gate passes (exit 0).
#
# No env required. Run from the repo root.
set -uo pipefail

if [ ! -f package.json ]; then
  echo "run-gates: no package.json — no toolchain yet, skipping all gates (pass)."
  exit 0
fi

# Detect the package manager.
if [ -f yarn.lock ]; then
  RUN="yarn"
elif [ -f pnpm-lock.yaml ]; then
  RUN="pnpm"
else
  RUN="npm run"
fi

has_script() {
  node -e "process.exit(((require('./package.json').scripts)||{})['$1'] ? 0 : 1)" 2>/dev/null
}

run_gate() {
  local name="$1"
  if has_script "$name"; then
    echo "run-gates: running '$name' via '$RUN'…"
    # shellcheck disable=SC2086
    $RUN "$name"
  else
    echo "run-gates: no '$name' script defined — skipping."
  fi
}

FAILED=0
for g in lint typecheck test; do
  if ! run_gate "$g"; then
    echo "run-gates: gate '$g' FAILED."
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "run-gates: one or more gates failed."
  exit 1
fi
echo "run-gates: all applicable gates passed."
exit 0
