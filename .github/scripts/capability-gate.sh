#!/usr/bin/env bash
# Capability diff-gate — the KEYSTONE (docs/security-architecture.md #3/#4).
#
# Classifies a PR by the CAPABILITIES its diff introduces, not by the issue text.
# The unit of trust is the merged diff: a schema-valid PRD or a "small feature"
# can still carry a payload that runs later where secrets/users live. So this
# gate reasons about what the diff can DO.
#
#   Tier A  -> within a low-capability envelope; auto-merge eligible. exit 0.
#   Tier B  -> needs a human; any capability signal or ambiguity. exit 1.
#
# Default-deny: any signal => Tier B. This v1 is heuristic and deliberately
# biased toward false-positives (a human looks); gitleaks/semgrep harden it later.
# Rules are the tunable block below.
#
# Input (one of):
#   GATE_DIFF_FILE      - path to a unified diff to analyze (tests/CI)
#   BASE_SHA, HEAD_SHA  - compute `git diff BASE HEAD`
# Output:
#   markdown report -> stdout (+ $GITHUB_STEP_SUMMARY if set)
#   tier=A|B -> $GITHUB_OUTPUT if set
#   exit 0 (Tier A) / 1 (Tier B) / 2 (bad invocation)
set -uo pipefail

MAX_ADDED_LINES="${MAX_ADDED_LINES:-600}"

# --- obtain the diff ---
if [ -n "${GATE_DIFF_FILE:-}" ]; then
  DIFF="$(cat "$GATE_DIFF_FILE")"
elif [ -n "${BASE_SHA:-}" ] && [ -n "${HEAD_SHA:-}" ]; then
  DIFF="$(git diff "$BASE_SHA" "$HEAD_SHA")"
else
  echo "::error::capability-gate needs GATE_DIFF_FILE or BASE_SHA+HEAD_SHA" >&2
  exit 2
fi

FILES="$(printf '%s\n' "$DIFF" | sed -nE 's;^\+\+\+ b/;;p')"
ADDED="$(printf '%s\n' "$DIFF" | grep -E '^\+' | grep -vE '^\+\+\+' || true)"
ADDED_COUNT="$(printf '%s\n' "$ADDED" | grep -c . || true)"
FILE_COUNT="$(printf '%s\n' "$FILES" | grep -c . || true)"

reasons=()
match_path() { printf '%s\n' "$FILES" | grep -qiE "$1"; }
match_add()  { printf '%s\n' "$ADDED" | grep -qiE "$1"; }

# --- path-based signals (strongest; least false-prone) ---
match_path '(^|/)\.github/' \
  && reasons+=("touches CI / automation / the agent cage (.github/**)")
match_path '(^|/)(go\.mod|go\.sum|package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.(toml|lock)|requirements\.txt|Gemfile(\.lock)?)$' \
  && reasons+=("changes a dependency manifest / lockfile (supply chain)")
match_path '(^|/)Dockerfile($|\.)|(^|/)docker-compose|\.dockerfile$' \
  && reasons+=("changes container / build (Dockerfile)")
match_path '(deploy|railway|(^|/)vercel\.(json|ts)|\.tf$|(^|/)\.env)' \
  && reasons+=("touches deploy / infra / env config")
match_path '(^|[/_.-])(auth|cors|secret|secrets|security)([/_.-]|$)' \
  && reasons+=("touches an auth / cors / security-named path")
match_path '(migration|\.sql$|(^|[/_.-])schema([/_.-]|$))' \
  && reasons+=("touches a DB migration / schema (RLS surface)")

# --- content-based signals on ADDED lines ---
match_add '\b(curl|wget)\b|fetch\(|http\.(Get|Post|NewRequest)|axios|requests\.(get|post)|urllib|XMLHttpRequest' \
  && reasons+=("adds an outbound network call")
match_add 'exec\.Command|child_process|subprocess|os\.system|\beval\(|new Function\(|vm\.runIn' \
  && reasons+=("adds dynamic exec / subprocess")
match_add 'SECRET|TOKEN|API[_-]?KEY|_KEY\b|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|CREDENTIAL' \
  && reasons+=("references a secret-like identifier")
if printf '%s\n' "$ADDED" | grep -oiE 'https?://[a-z0-9._-]+' \
     | grep -viE '(github\.com|githubusercontent|localhost|127\.0\.0\.1|example\.(com|org)|opencraft1\.(com|vercel\.app)|pixijs|jsdelivr|unpkg)' \
     | grep -q .; then
  reasons+=("adds an external URL literal")
fi

# --- size envelope ---
if [ "${ADDED_COUNT:-0}" -gt "$MAX_ADDED_LINES" ]; then
  reasons+=("large diff: $ADDED_COUNT added lines > $MAX_ADDED_LINES")
fi

# --- verdict ---
if [ "${#reasons[@]}" -eq 0 ]; then TIER=A; else TIER=B; fi

{
  echo "## Capability diff-gate — Tier $TIER"
  echo
  if [ "$TIER" = A ]; then
    echo "✅ **Tier A** — within the low-capability envelope. Auto-merge eligible."
  else
    echo "⛔ **Tier B** — human review required. Capability signals:"
    for r in "${reasons[@]}"; do echo "- $r"; done
  fi
  echo
  echo "_Heuristic gate v1 (docs/security-architecture.md #3/#4). ${ADDED_COUNT:-0} added lines across ${FILE_COUNT:-0} files._"
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"

[ -n "${GITHUB_OUTPUT:-}" ] && echo "tier=$TIER" >> "$GITHUB_OUTPUT"

[ "$TIER" = A ] && exit 0 || exit 1
