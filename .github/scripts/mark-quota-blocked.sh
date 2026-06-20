#!/usr/bin/env bash
# mark-quota-blocked.sh — called by an agent stage when run-codex.sh reports a
# quota block. It (1) records a machine-readable resume marker on the issue/PR,
# (2) labels it agents:quota-blocked for visibility, and (3) freezes the whole
# pipeline so no further trigger burns into the exhausted quota. The recovery
# cron (agents-recover.yml) later reads the markers, re-dispatches each stage,
# and lifts the freeze.
#
# Env:
#   STAGE         pm-intake | pm-followup | dev-implement | dev-revise   (required)
#   ISSUE         issue number  (required unless PR-only stage)
#   PR            PR number      (dev-revise; also the comment/label target)
#   COMMENT_BODY  triggering comment text (comment-driven stages only)
#   REPO          owner/name     (defaults to GITHUB_REPOSITORY)
#   GH_TOKEN      token for issue comment/label (GITHUB_TOKEN is fine)
#   FREEZE_TOKEN  token with variables:write to set AGENTS_FREEZE (PAT required)
#
# See docs/superpowers/specs/2026-06-20-codex-quota-recovery-design.md.
set -euo pipefail

STAGE="${STAGE:?STAGE required}"
ISSUE="${ISSUE:-}"
PR="${PR:-}"
COMMENT_BODY="${COMMENT_BODY:-}"
REPO="${REPO:-${GITHUB_REPOSITORY:?REPO or GITHUB_REPOSITORY required}}"

# Comment/label target: the PR if this stage works on one, else the issue.
TARGET="${PR:-$ISSUE}"
[ -n "$TARGET" ] || { echo "mark-quota-blocked: no ISSUE or PR to mark" >&2; exit 1; }

# Strip any '-->' so a comment body can't break out of the HTML marker comment.
SAFE_CB="${COMMENT_BODY//-->/--}"

JSON="$(jq -nc \
  --arg stage "$STAGE" \
  --arg issue "$ISSUE" \
  --arg pr "$PR" \
  --arg cb "$SAFE_CB" \
  '{stage:$stage}
   + (if $issue != "" then {issue:($issue|tonumber)} else {} end)
   + (if $pr    != "" then {pr:($pr|tonumber)} else {} end)
   + (if $cb    != "" then {comment_body:$cb} else {} end)')"

BODY="$(cat <<EOF
🤖 Codex usage limit reached — pausing the agent pipeline. This item is queued and will **auto-resume** once quota returns (recovery checks every ~30 min).
<sub>🤖 Agents · quota-blocked</sub><!-- agent-bot -->
<!-- agents:resume v1 $JSON -->
EOF
)"

# Idempotent label, then comment + label the target via the REST API. We use the
# issues API (not `gh issue comment/edit`) because TARGET may be a PR number, and
# those gh subcommands reject PRs — whereas /issues/{n} treats a PR as an issue.
gh label create "agents:quota-blocked" --repo "$REPO" \
  --color FBCA04 --description "Stranded by Codex quota; auto-resumes when quota returns" 2>/dev/null || true
gh api "repos/$REPO/issues/$TARGET/comments" -f body="$BODY" >/dev/null
gh api "repos/$REPO/issues/$TARGET/labels" -X POST -f "labels[]=agents:quota-blocked" >/dev/null || true

# Freeze the pipeline via the DEDICATED quota variable — never AGENTS_FREEZE,
# which is the operator's manual kill switch (recovery must not be able to clear
# that). Workflows gate on both. Needs a PAT with variables:write — GITHUB_TOKEN
# cannot manage Actions variables. Fail loudly if the token is missing, since a
# silent no-freeze would let other triggers keep piling up blocked items.
if [ -z "${FREEZE_TOKEN:-}" ]; then
  echo "::error::FREEZE_TOKEN (variables:write PAT) not set — cannot set AGENTS_QUOTA_FREEZE." >&2
  exit 1
fi
GH_TOKEN="$FREEZE_TOKEN" gh variable set AGENTS_QUOTA_FREEZE --repo "$REPO" --body "true"
echo "mark-quota-blocked: marked $TARGET (stage=$STAGE) and set AGENTS_QUOTA_FREEZE=true"
