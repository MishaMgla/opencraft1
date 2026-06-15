#!/usr/bin/env bash
# Shared permission gate for opencraft1 agent workflows.
#
# Authorized IFF: ACTOR is on the allowlist, OR ACTOR == the GitHub login that
# opened issue OWNER_ISSUE. This replaces contentos's OWNER/COLLABORATOR/MEMBER
# association check with an author-rooted model.
#
# Required env:
#   ACTOR             - github login that triggered the event
#   OWNER_ISSUE       - issue number whose author is the "owner"
#   GH_TOKEN          - token for gh lookups
#   GITHUB_REPOSITORY - owner/repo
# Writes `authorized=true|false` to $GITHUB_OUTPUT and always exits 0 (callers
# branch on the output; this script never hard-fails a run).
set -uo pipefail

ALLOWLIST_FILE=".github/agents-allowlist.txt"

: "${ACTOR:?ACTOR not set}"
: "${OWNER_ISSUE:?OWNER_ISSUE not set}"
: "${GH_TOKEN:?GH_TOKEN not set}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY not set}"

emit() {
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "authorized=$1" >> "$GITHUB_OUTPUT"
  echo "authorized=$1"
}

# 1) Allowlist check (hardcoded admins). Matches before any network call.
if [ -f "$ALLOWLIST_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    name="${line%%#*}"                       # strip trailing comment
    name="$(printf '%s' "$name" | tr -d '[:space:]')"
    [ -z "$name" ] && continue
    if [ "$name" = "$ACTOR" ]; then
      echo "authorize: '$ACTOR' is on the allowlist."
      emit true; exit 0
    fi
  done < "$ALLOWLIST_FILE"
fi

# 2) Author-of-originating-issue check.
OWNER="$(gh issue view "$OWNER_ISSUE" --repo "$REPO" --json author --jq '.author.login' 2>/dev/null || echo "")"
if [ -n "$OWNER" ] && [ "$OWNER" = "$ACTOR" ]; then
  echo "authorize: '$ACTOR' is the author of issue #$OWNER_ISSUE."
  emit true; exit 0
fi

echo "authorize: '$ACTOR' is neither author of #$OWNER_ISSUE ('$OWNER') nor on the allowlist."
emit false; exit 0
