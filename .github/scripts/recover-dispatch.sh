#!/usr/bin/env bash
# recover-dispatch.sh — called by agents-recover.yml once a probe confirms Codex
# quota is back. It finds every item stranded by a quota block (label
# agents:quota-blocked), reads its resume marker, re-dispatches the right agent
# workflow with the recorded inputs, clears the label, and finally lifts the
# AGENTS_FREEZE pipeline freeze.
#
# Env:
#   REPO          owner/name   (defaults to GITHUB_REPOSITORY)
#   GH_TOKEN      token for search/dispatch/label (needs actions:write to dispatch)
#   FREEZE_TOKEN  PAT with variables:write to clear AGENTS_FREEZE
#
# See docs/superpowers/specs/2026-06-20-codex-quota-recovery-design.md.
set -uo pipefail

REPO="${REPO:-${GITHUB_REPOSITORY:?REPO or GITHUB_REPOSITORY required}}"
LABEL="agents:quota-blocked"

# Valid stage -> workflow file. Guards against a malformed/forged marker
# dispatching something unexpected.
stage_workflow() {
  case "$1" in
    pm-intake)     echo "pm-intake.yml" ;;
    pm-followup)   echo "pm-followup.yml" ;;
    dev-implement) echo "dev-implement.yml" ;;
    dev-revise)    echo "dev-revise.yml" ;;
    *)             echo "" ;;
  esac
}

# Open issues and PRs carrying the quota-blocked label.
mapfile -t NUMS < <(
  gh issue list --repo "$REPO" --label "$LABEL" --state open --json number --jq '.[].number' 2>/dev/null
  gh pr   list --repo "$REPO" --label "$LABEL" --state open --json number --jq '.[].number' 2>/dev/null
)

dispatched=0
for N in "${NUMS[@]}"; do
  [ -n "$N" ] || continue
  # Latest resume marker across the item's comments (issues API covers PRs too).
  MARKER=$(gh api "repos/$REPO/issues/$N/comments" --jq '.[].body' 2>/dev/null \
    | grep -oE 'agents:resume v1 \{.*\} -->' | tail -1 \
    | sed -E 's/^agents:resume v1 (\{.*\}) -->$/\1/')
  if [ -z "$MARKER" ]; then
    echo "recover: #$N labeled but no resume marker found — leaving labeled."
    continue
  fi
  STAGE=$(printf '%s' "$MARKER" | jq -r '.stage // ""')
  ISSUE=$(printf '%s' "$MARKER" | jq -r '.issue // ""')
  PR=$(printf '%s'    "$MARKER" | jq -r '.pr // ""')
  CB=$(printf '%s'    "$MARKER" | jq -r '.comment_body // ""')
  WF=$(stage_workflow "$STAGE")
  if [ -z "$WF" ]; then
    echo "recover: #$N has unknown stage '$STAGE' — skipping."
    continue
  fi

  if gh workflow run "$WF" --repo "$REPO" \
       -f issue="$ISSUE" -f pr="$PR" -f comment_body="$CB"; then
    gh api -X DELETE "repos/$REPO/issues/$N/labels/$LABEL" >/dev/null 2>&1 || true
    gh api "repos/$REPO/issues/$N/comments" \
      -f body="🤖 Quota restored — resuming **$STAGE**.
<sub>🤖 Agents · resume</sub><!-- agent-bot -->" >/dev/null 2>&1 || true
    dispatched=$((dispatched+1))
    echo "recover: dispatched $STAGE for #$N (issue=$ISSUE pr=$PR)."
  else
    echo "recover: failed to dispatch $WF for #$N — leaving labeled for next tick." >&2
  fi
done

echo "recover: dispatched=$dispatched"

# Lift the quota freeze LAST, so normal event triggers only resume after every
# stranded item has been re-dispatched. Only ever touches AGENTS_QUOTA_FREEZE —
# the operator's manual AGENTS_FREEZE kill switch is never altered here.
if [ -z "${FREEZE_TOKEN:-}" ]; then
  echo "::error::FREEZE_TOKEN (variables:write PAT) not set — cannot clear AGENTS_QUOTA_FREEZE." >&2
  exit 1
fi
GH_TOKEN="$FREEZE_TOKEN" gh variable set AGENTS_QUOTA_FREEZE --repo "$REPO" --body "false"
echo "recover: AGENTS_QUOTA_FREEZE cleared."
