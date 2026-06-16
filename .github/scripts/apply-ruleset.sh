#!/usr/bin/env bash
# Apply (create or update) the committed branch ruleset to the repo.
#
# Config-as-doc: .github/rulesets/main-protection.json is the source of truth;
# this script pushes it to GitHub. Idempotent — matches an existing ruleset by
# name and PUTs, otherwise POSTs.
#
# Requires a token with ADMIN on the repo (GITHUB_TOKEN's default repo scope is
# NOT enough for rulesets). Run locally as a maintainer:
#   gh auth login         # as a repo admin
#   .github/scripts/apply-ruleset.sh
#
# Env:
#   GITHUB_REPOSITORY  - owner/repo (default: MishaMgla/opencraft1)
#   RULESET_FILE       - path to ruleset JSON (default: the committed one)
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-MishaMgla/opencraft1}"
RULESET_FILE="${RULESET_FILE:-.github/rulesets/main-protection.json}"

[ -f "$RULESET_FILE" ] || { echo "::error::ruleset file not found: $RULESET_FILE"; exit 1; }
command -v gh >/dev/null || { echo "::error::gh CLI not found"; exit 1; }
command -v jq >/dev/null || { echo "::error::jq not found"; exit 1; }

NAME="$(jq -r '.name' "$RULESET_FILE")"
[ -n "$NAME" ] && [ "$NAME" != "null" ] || { echo "::error::ruleset .name missing in $RULESET_FILE"; exit 1; }

# List existing rulesets. This fails on a free PRIVATE repo (rulesets require a
# PUBLIC repo or GitHub Pro/Team), so surface that cause instead of pressing on.
ERR="$(mktemp)"
if ! RULESETS_JSON="$(gh api "repos/$REPO/rulesets" 2>"$ERR")"; then
  echo "::error::could not list rulesets on $REPO." >&2
  echo "Rulesets / branch protection need a PUBLIC repo or GitHub Pro/Team. GitHub said:" >&2
  sed 's/^/  /' "$ERR" >&2
  rm -f "$ERR"; exit 1
fi
rm -f "$ERR"

# Match by name; only accept a numeric id (guards against parsing an error body).
EXISTING_ID="$(printf '%s' "$RULESETS_JSON" | jq -r ".[] | select(.name==\"$NAME\") | .id" | head -1)"
[[ "$EXISTING_ID" =~ ^[0-9]+$ ]] || EXISTING_ID=""

if [ -n "$EXISTING_ID" ]; then
  echo "Updating ruleset '$NAME' (id $EXISTING_ID) on $REPO…"
  gh api --method PUT "repos/$REPO/rulesets/$EXISTING_ID" --input "$RULESET_FILE" >/dev/null
  echo "Updated."
else
  echo "Creating ruleset '$NAME' on $REPO…"
  gh api --method POST "repos/$REPO/rulesets" --input "$RULESET_FILE" >/dev/null
  echo "Created."
fi
