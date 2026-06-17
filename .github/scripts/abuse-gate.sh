#!/usr/bin/env bash
# Phase 3.1 abuse / sprawl controls for the OPEN PM intake (control #11).
#
# pm-intake runs the PM agent on every new issue from anyone, so it is the
# untrusted entry point. This gate decides whether the agent should run, and
# applies soft friction. It NEVER merges or changes code — worst case it skips an
# agent run. FAIL-OPEN: on a GitHub API error it allows (don't lock out legit
# users) but logs a warning.
#
# Env (required): ISSUE, ACTOR, GH_TOKEN, GITHUB_REPOSITORY
# Env (tunable):  NEW_ACCOUNT_DAYS=30  AUTHOR_ISSUES_24H=5  DAILY_INTAKE_CAP=50
# Output: proceed=true|false (+ reason) to $GITHUB_OUTPUT.
set -uo pipefail

: "${ISSUE:?ISSUE not set}"
: "${ACTOR:?ACTOR not set}"
: "${GH_TOKEN:?GH_TOKEN not set}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY not set}"
NEW_ACCOUNT_DAYS="${NEW_ACCOUNT_DAYS:-30}"
AUTHOR_ISSUES_24H="${AUTHOR_ISSUES_24H:-5}"
DAILY_INTAKE_CAP="${DAILY_INTAKE_CAP:-50}"

emit() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    { echo "proceed=$1"; echo "reason=$2"; } >> "$GITHUB_OUTPUT"
  fi
  echo "abuse-gate: proceed=$1 — $2"
}
say() {  # post a throwaway comment; never fail the gate on a comment error
  gh issue comment "$ISSUE" --repo "$REPO" --body "$1
<sub>🤖 PM · abuse-gate</sub><!-- agent-bot -->" 2>/dev/null || true
}
add_label() { gh issue edit "$ISSUE" --repo "$REPO" --add-label "$1" 2>/dev/null || true; }
is_int() { [[ "${1:-}" =~ ^[0-9]+$ ]]; }

# --- 1) per-author rate limit: issues opened in the last 24h ---
SINCE="$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo '')"
if [ -n "$SINCE" ]; then
  N_AUTHOR="$(gh api -X GET search/issues \
    --raw-field q="repo:$REPO type:issue author:$ACTOR created:>=$SINCE" \
    --jq '.total_count' 2>/dev/null || echo '')"
  if is_int "$N_AUTHOR" && [ "$N_AUTHOR" -gt "$AUTHOR_ISSUES_24H" ]; then
    say "⏳ Rate limit: you've opened $N_AUTHOR issues in 24h (max $AUTHOR_ISSUES_24H). This one is paused — a maintainer can pick it up. Please consolidate requests."
    add_label "rate-limited"
    emit false "author-rate-limit ($N_AUTHOR/$AUTHOR_ISSUES_24H in 24h)"
    exit 0
  fi
fi

# --- 2) daily intake cap (cost/abuse circuit-breaker; subscription has no $ meter) ---
TODAY="$(date -u +%Y-%m-%d)"
N_RUNS="$(gh api -X GET "repos/$REPO/actions/workflows/pm-intake.yml/runs" \
  --raw-field created=">=$TODAY" --jq '.total_count' 2>/dev/null || echo '')"
if is_int "$N_RUNS" && [ "$N_RUNS" -gt "$DAILY_INTAKE_CAP" ]; then
  say "🛑 Daily intake cap reached ($N_RUNS runs today, cap $DAILY_INTAKE_CAP). Agent intake is paused for today — a maintainer can review. (Set \`AGENTS_FREEZE\` to halt entirely.)"
  add_label "needs-human"
  emit false "daily-intake-cap ($N_RUNS/$DAILY_INTAKE_CAP today)"
  exit 0
fi

# --- 3) new-account friction (label only; PM still responds = discussion) ---
CREATED="$(gh api "users/$ACTOR" --jq '.created_at' 2>/dev/null || echo '')"
if [ -n "$CREATED" ]; then
  C_S="$(date -u -d "$CREATED" +%s 2>/dev/null || echo '')"
  NOW_S="$(date -u +%s)"
  if is_int "$C_S"; then
    AGE_DAYS=$(( (NOW_S - C_S) / 86400 ))
    if [ "$AGE_DAYS" -lt "$NEW_ACCOUNT_DAYS" ]; then
      add_label "discussion-only"
      echo "abuse-gate: '$ACTOR' account is $AGE_DAYS days old (< $NEW_ACCOUNT_DAYS) — labelled discussion-only."
    fi
  fi
fi

# --- 4) dedupe (non-blocking): flag a likely-duplicate open issue by title overlap ---
TITLE="$(gh issue view "$ISSUE" --repo "$REPO" --json title --jq '.title' 2>/dev/null || echo '')"
if [ -n "$TITLE" ]; then
  # significant words (len>=4), search other OPEN issues' titles for any of them
  WORDS="$(printf '%s' "$TITLE" | tr 'A-Z' 'a-z' | tr -cs 'a-z0-9' '\n' | awk 'length>=4' | head -6 | paste -sd' ' -)"
  if [ -n "$WORDS" ]; then
    DUP="$(gh issue list --repo "$REPO" --state open --search "in:title $WORDS" \
      --json number --jq "[.[] | select(.number != $ISSUE)] | .[0].number // empty" 2>/dev/null || echo '')"
    if is_int "$DUP"; then
      say "🔎 This looks similar to #$DUP — if it's the same request, consider continuing there."
      add_label "possible-duplicate"
    fi
  fi
fi

emit true "ok"
exit 0
