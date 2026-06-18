#!/usr/bin/env bash
# Auto-merge the spec PR for an issue so the merge cascades into dev-implement.
#
# Must run with GH_TOKEN = AUTO_PAT (a real-user PAT), NOT the default
# GITHUB_TOKEN: events caused by GITHUB_TOKEN do not start new workflow runs,
# so a token-merged spec PR would never trigger dev-implement.
#
# Required env: ISSUE (issue number), GH_TOKEN (AUTO_PAT), GITHUB_REPOSITORY.
# Honors `hold` / `needs-human` labels on the PR or issue (skips merge).
set -euo pipefail

: "${ISSUE:?ISSUE not set}"
: "${GH_TOKEN:?GH_TOKEN not set (expected AUTO_PAT)}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY not set}"

PR="$(gh pr list --repo "$REPO" \
  --search "head:pm/issue-$ISSUE-" --state open \
  --json number --jq '.[0].number // empty')"

if [ -z "$PR" ]; then
  echo "auto-merge-spec: no open spec PR for issue #$ISSUE — nothing to merge."
  exit 0
fi

PR_LABELS="$(gh pr view "$PR" --repo "$REPO" --json labels --jq '.labels[].name' 2>/dev/null || true)"
ISSUE_LABELS="$(gh issue view "$ISSUE" --repo "$REPO" --json labels --jq '.labels[].name' 2>/dev/null || true)"
if printf '%s\n%s\n' "$PR_LABELS" "$ISSUE_LABELS" | grep -qE '^(needs-human|hold)$'; then
  echo "auto-merge-spec: spec PR #$PR (issue #$ISSUE) is held — skipping merge."
  exit 0
fi

echo "auto-merge-spec: merging spec PR #$PR for issue #$ISSUE via AUTO_PAT…"
gh pr merge "$PR" --repo "$REPO" --squash --delete-branch
