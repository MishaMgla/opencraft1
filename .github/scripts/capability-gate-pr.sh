#!/usr/bin/env bash
# Run the capability gate (.github/scripts/capability-gate.sh) on a PR's diff,
# INLINE inside dev-implement / dev-revise — because agent-opened PRs are created
# with GITHUB_TOKEN, which does NOT trigger the pull_request policy-gate workflow.
# So the gate that protects auto-merge has to run in the same job, like run-gates.sh.
#
# Usage:   capability-gate-pr.sh <pr-number>
# Env:     GH_TOKEN (for gh), GITHUB_REPOSITORY
# Output:  tier=A|B -> $GITHUB_OUTPUT (via capability-gate.sh); exit 0 (A) / 1 (B).
set -uo pipefail

PR="${1:?usage: capability-gate-pr.sh <pr-number>}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY not set}"

HEAD_REF="$(gh pr view "$PR" --repo "$REPO" --json headRefName --jq '.headRefName')"
[ -n "$HEAD_REF" ] || { echo "::error::could not resolve head branch for PR #$PR"; exit 2; }

git fetch --no-tags --quiet origin main "$HEAD_REF" 2>/dev/null || true

BASE_SHA="$(git merge-base origin/main "origin/$HEAD_REF" 2>/dev/null || git rev-parse origin/main)"
HEAD_SHA="$(git rev-parse "origin/$HEAD_REF")"

echo "capability-gate-pr: PR #$PR ($HEAD_REF) diff ${BASE_SHA:0:8}..${HEAD_SHA:0:8}"
export BASE_SHA HEAD_SHA
exec .github/scripts/capability-gate.sh
