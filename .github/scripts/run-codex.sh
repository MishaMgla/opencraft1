#!/usr/bin/env bash
# run-codex.sh — quota-aware wrapper around `codex exec`. Every agent stage in
# the PM/Dev pipeline runs Codex through this instead of inlining `codex exec`,
# so a quota block (429 usage-limit) is detected and reported as a recoverable
# pause rather than an indistinguishable hard failure.
#
# Usage:   run-codex.sh <args…>      # args are passed verbatim to `codex exec`
# Outputs (to $GITHUB_OUTPUT, when set):
#   quota_blocked=true|false
# Exit:
#   0  — Codex succeeded, OR failed due to a quota block (caller marks & pauses).
#   N  — Codex failed for any other (genuine) reason; original exit code N.
#
# The caller branches on the quota_blocked output: on true it marks the issue and
# freezes the pipeline (see mark-quota-blocked.sh); on a non-zero exit it falls
# through to its existing failure path. See
# docs/superpowers/specs/2026-06-20-codex-quota-recovery-design.md.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLASSIFY="$HERE/codex-quota-classify.sh"

set_out() { [ -n "${GITHUB_OUTPUT:-}" ] && printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"; return 0; }

if ! command -v codex >/dev/null 2>&1; then
  echo "::error::codex CLI not installed/authenticated on the self-hosted runner — see docs/agents-setup.md" >&2
  set_out quota_blocked false
  exit 1
fi

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

# Stream Codex output to the job log while capturing a copy for classification.
# PIPESTATUS[0] is Codex's exit code (tee's would otherwise mask it).
codex exec "$@" 2>&1 | tee "$LOG"
code=${PIPESTATUS[0]}

if [ "$code" -eq 0 ]; then
  set_out quota_blocked false
  exit 0
fi

if bash "$CLASSIFY" "$LOG"; then
  echo "::warning::Codex run hit the subscription usage limit (quota block). Pipeline will pause and auto-resume when quota returns." >&2
  set_out quota_blocked true
  exit 0
fi

echo "::error::Codex run failed (exit $code) — not a quota block; see log above." >&2
set_out quota_blocked false
exit "$code"
