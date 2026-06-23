#!/usr/bin/env bash
# codex-quota-classify.sh — decide whether a captured `codex exec` log indicates
# a transient, recoverable backend condition (the Codex subscription's usage
# quota was exhausted, OR the selected model was temporarily at capacity), as
# opposed to a genuine agent/build failure.
#
# Usage:  codex-quota-classify.sh [LOGFILE]      # reads stdin if LOGFILE omitted
# Exit:   0 = recoverable backend block   1 = not (genuine failure / clean)
#
# Only meaningful to call on a non-zero `codex exec`. Two recoverable shapes:
#   - quota block: a 429 with a `usage_limit_reached` error, rendered as "You've
#     hit your usage limit…", and after Codex's internal retries as "exceeded
#     retry limit, last status: 429".
#   - capacity block: "Selected model is at capacity. Please try a different
#     model." — a transient availability error that, like a quota block, clears
#     on its own and should pause-and-retry rather than hard-fail the pipeline.
# Both route through the same pause/auto-resume recovery path.
# See docs/superpowers/specs/2026-06-20-codex-quota-recovery-design.md.
set -uo pipefail

# Canonical recoverable-block signatures (case-insensitive). Kept specific enough
# that an unrelated "rate limiting" in agent output does not false-positive.
QUOTA_RE='usage_limit_reached|usage limit|exceeded retry limit, last status: 429|429 too many requests|model is at capacity'

read_log() {
  if [ "$#" -ge 1 ] && [ -n "${1:-}" ]; then cat -- "$1"; else cat; fi
}

match="$(read_log "$@" | grep -ioE "$QUOTA_RE" | head -1 || true)"
if [ -n "$match" ]; then
  echo "codex-quota-classify: recoverable backend block detected (matched: $match)" >&2
  exit 0
fi
exit 1
