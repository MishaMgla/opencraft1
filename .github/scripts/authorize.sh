#!/usr/bin/env bash
# Shared permission gate for opencraft1 agent workflows.
#
# Authorized IFF: ACTOR is on the allowlist, OR ACTOR has push access to the
# repo (collaborator permission ∈ {admin, write}), checked live against the
# GitHub API at execution time.
#
# WHY NOT "author of the originating issue": on a PUBLIC repo anyone is the
# author of their own issue, so an author-rooted grant lets any anonymous user
# self-authorize (open issue → /approved → dev flow). Authorization must be a
# live permission check, never a property the actor controls. Labels/authorship
# are state, not proof of authority. See docs/security-architecture.md (T1, #1).
#
# Required env:
#   ACTOR             - github login that triggered the event
#   GH_TOKEN          - token for gh lookups
#   GITHUB_REPOSITORY - owner/repo
# Optional env:
#   OWNER_ISSUE       - originating issue number (informational only; no longer
#                       used for authorization — kept so callers need not change)
# Writes `authorized=true|false` to $GITHUB_OUTPUT and always exits 0 (callers
# branch on the output; this script never hard-fails a run).
set -uo pipefail

ALLOWLIST_FILE=".github/agents-allowlist.txt"

: "${ACTOR:?ACTOR not set}"
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

# 2) Live repo-permission check. The API returns one of admin|write|read|none
#    (maintain→write, triage→read). Only push-capable roles may steer agents.
#    A non-collaborator resolves to "none" (or the call 404s) → not authorized.
PERM="$(gh api "repos/$REPO/collaborators/$ACTOR/permission" --jq '.permission' 2>/dev/null || echo "")"
case "$PERM" in
  admin|write)
    echo "authorize: '$ACTOR' has '$PERM' permission on $REPO."
    emit true; exit 0
    ;;
esac

echo "authorize: '$ACTOR' is not on the allowlist and lacks push access (permission='${PERM:-unknown}')."
emit false; exit 0
