#!/usr/bin/env bash
# codex-quota-classify.sh — decide whether a captured `codex exec` log indicates
# the Codex subscription's usage quota was exhausted (a 429 usage-limit block),
# as opposed to a genuine agent/build failure.
#
# Usage:  codex-quota-classify.sh [LOGFILE]      # reads stdin if LOGFILE omitted
# Exit:   0 = quota-blocked   1 = not quota-blocked (genuine failure / clean)
#
# Only meaningful to call on a non-zero `codex exec`; a quota block is a 429 with
# a `usage_limit_reached` error, rendered as "You've hit your usage limit…", and
# after Codex's internal retries as "exceeded retry limit, last status: 429".
# See docs/superpowers/specs/2026-06-20-codex-quota-recovery-design.md.
set -uo pipefail

# Canonical quota signatures (case-insensitive). Kept specific enough that an
# unrelated "rate limiting" in agent output does not false-positive.
QUOTA_RE='usage_limit_reached|usage limit|exceeded retry limit, last status: 429|429 too many requests'

read_log() {
  if [ "$#" -ge 1 ] && [ -n "${1:-}" ]; then cat -- "$1"; else cat; fi
}

match="$(read_log "$@" | grep -ioE "$QUOTA_RE" | head -1 || true)"
if [ -n "$match" ]; then
  echo "codex-quota-classify: quota block detected (matched: $match)" >&2
  exit 0
fi
exit 1
