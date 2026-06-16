#!/usr/bin/env bash
# Secret-segmentation guard (docs/security-architecture.md #2, T3).
#
# Workflows that run an agent (codex) over attacker-controlled issue text must
# never reference a production secret — otherwise one prompt injection exfiltrates
# it. This is a deterministic regression guard: it FAILS CI if an agent workflow
# gains a prod secret. It does not touch the live flow; it only reads YAML.
#
# Finding it encodes: today prod secrets (VERCEL_*) live only in deploy-client.yml;
# the agent workflows carry GITHUB_TOKEN (required, per-job scoped) + AUTO_PAT
# (a real-user PAT for the merge cascade). AUTO_PAT is a tracked exception pending
# the Phase 1.2 auto-merge-isolation refactor — warned, not failed.
set -uo pipefail

# Workflows that execute an agent over untrusted issue text.
AGENT_WORKFLOWS=(pm-intake pm-followup dev-implement dev-revise)

# Production / high-value secrets that must never appear in an agent job.
PROD_SECRET_RE='secrets\.(VERCEL_[A-Z_]+|SUPABASE_[A-Z_]+|RAILWAY_[A-Z_]+|DATABASE_[A-Z_]+|[A-Z_]*_API_KEY|[A-Z_]*_SECRET|[A-Z_]*_PRIVATE_KEY|OPENAI_[A-Z_]+|ANTHROPIC_[A-Z_]+)'

fail=0
for w in "${AGENT_WORKFLOWS[@]}"; do
  f=".github/workflows/$w.yml"
  [ -f "$f" ] || { echo "warn: $f not found (skipping)"; continue; }

  hits="$(grep -noE "$PROD_SECRET_RE" "$f" || true)"
  if [ -n "$hits" ]; then
    echo "::error file=$f::agent workflow references a production secret (violates secret segmentation):"
    printf '%s\n' "$hits" | sed 's/^/    /'
    fail=1
  fi

  if grep -qE 'secrets\.AUTO_PAT' "$f"; then
    echo "::warning file=$f::$w co-locates AUTO_PAT (privileged PAT) with agent execution — isolate via the Phase 1.2 auto-merge refactor."
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "Secret segmentation: FAILED."
  exit 1
fi
echo "Secret segmentation: OK — no production secrets in agent workflows."
