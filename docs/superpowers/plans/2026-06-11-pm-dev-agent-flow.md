# PM + Dev Agent Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a GitHub-Actions PM+Dev agent pipeline on `MishaMgla/opencraft1` where issues/PRs are steered only by the originating issue's author or a hardcoded allowlist.

**Architecture:** Five workflows under `.github/workflows/` invoke `anthropics/claude-code-action@v1` with prompt files. A shared `authorize.sh` resolves the originating issue's author and checks it (plus `.github/agents-allowlist.txt`) before any comment-driven agent runs. `AUTO_PAT` merges spec/impl PRs so each merge cascades to the next workflow. Verification gates auto-detect a toolchain and no-op while the repo is a scaffold.

**Tech Stack:** GitHub Actions, bash, `gh` CLI, `jq`, `anthropics/claude-code-action@v1`, Claude Code CLI (OAuth), self-hosted runner.

---

## Conventions used throughout

- **Repo guard:** every workflow's first `if:` clause is `github.repository == 'MishaMgla/opencraft1'`.
- **Bot marker:** agent comments end with `<!-- agent-bot -->`. Workflows ignore comments containing it (loop prevention).
- **Branches:** spec = `pm/issue-<N>-<slug>`, impl = `claude/issue-<N>-<slug>`.
- **Runner:** `runs-on: [self-hosted]`.
- **Agent specs land in:** `docs/specs/<YYYY-MM-DD>-issue-<N>-<slug>.md`.
- **Validation:** shell → `bash -n` (+ `shellcheck` if you choose to install it); workflows → `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" <file>` for well-formedness, then the live smoke test (Task 12).
- **Commit style:** concise imperative (per `AGENT_RULES.md`). One commit per task unless noted.

## File structure (what each file owns)

| File | Responsibility |
|---|---|
| `.github/agents-allowlist.txt` | Hardcoded admin usernames (one per line). Single source of truth for the allowlist. |
| `.github/scripts/authorize.sh` | Decide `authorized=true/false` from actor vs. originating-issue author + allowlist. |
| `.github/scripts/run-gates.sh` | Auto-detect `package.json` lint/typecheck/test scripts; run them or skip cleanly. |
| `.github/scripts/auto-merge-spec.sh` | Merge the spec PR via `AUTO_PAT` so the merge cascades to dev-implement. |
| `.github/prompts/pm-system.md` | PM agent: clarifying-question behaviour. |
| `.github/prompts/self-audit.md` | PM decision logic: ask vs. draft. |
| `.github/prompts/pm-draft-spec.md` | PM agent: write spec file + open spec PR. |
| `.github/prompts/pm-revise-spec.md` | PM agent: revise an open spec PR from thread feedback. |
| `.github/prompts/dev-system.md` | Dev agent: implement merged spec → open impl PR. |
| `.github/prompts/dev-revise.md` | Dev agent: apply PR-comment revisions. |
| `.github/workflows/pm-intake.yml` | Issue opened → PM agent → auto-merge spec PR. |
| `.github/workflows/pm-followup.yml` | Issue comment → PM revise/answer (gated). |
| `.github/workflows/dev-implement.yml` | Spec PR merged OR `/approved` → Dev agent → impl PR → auto-merge on green. |
| `.github/workflows/dev-revise.yml` | PR comment → Dev revise, or `/merge`·`/approved` → merge (gated). |
| `.github/workflows/close-issue-on-impl-merge.yml` | Impl PR merged → close originating issue. |
| `.claude/settings.json` | Allow-list of shell commands the agents may run. |
| `docs/project-map/agents.md` | Doc for the agent system (per documentation-maintenance protocol). |
| `docs/agents-setup.md` | Operator setup: secrets + runner registration. |

---

## Task 1: Scaffold dirs, allowlist, and Claude settings

**Files:**
- Create: `.github/agents-allowlist.txt`
- Create: `.claude/settings.json`

- [ ] **Step 1: Create the allowlist file**

`.github/agents-allowlist.txt`:

```text
# Hardcoded admins who may steer ANY issue/PR agent flow, regardless of who
# opened the issue. One GitHub username per line. Lines starting with # and
# blank lines are ignored. Read by .github/scripts/authorize.sh.
MishaMgla
```

- [ ] **Step 2: Create `.claude/settings.json`**

```json
{
  "permissions": {
    "allow": [
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(git show*)",
      "Bash(git add*)",
      "Bash(git commit*)",
      "Bash(git checkout*)",
      "Bash(git switch*)",
      "Bash(git push*)",
      "Bash(git pull*)",
      "Bash(git branch*)",
      "Bash(git fetch*)",
      "Bash(git ls-files*)",
      "Bash(gh issue*)",
      "Bash(gh pr*)",
      "Bash(gh label*)",
      "Bash(gh api*)",
      "Bash(find *)",
      "Bash(grep *)",
      "Bash(rg *)",
      "Bash(ls *)",
      "Bash(cat *)",
      "Bash(wc *)",
      "Bash(date*)",
      "Bash(mkdir *)",
      "Bash(node *)",
      "Bash(npm *)",
      "Bash(npx *)",
      "Bash(yarn *)",
      "Bash(.github/scripts/run-gates.sh*)"
    ]
  }
}
```

- [ ] **Step 3: Verify JSON is valid**

Run: `python3 -c "import json; json.load(open('.claude/settings.json')); print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add .github/agents-allowlist.txt .claude/settings.json
git commit -m "feat: add agent allowlist and Claude settings"
```

---

## Task 2: `run-gates.sh` (auto-detect verification)

This is fully testable offline — do it test-first.

**Files:**
- Create: `.github/scripts/run-gates.sh`

- [ ] **Step 1: Write the script**

`.github/scripts/run-gates.sh`:

```bash
#!/usr/bin/env bash
# Auto-detecting verification gate for the Dev agent.
#
# If a package.json exists AND defines a given script (lint / typecheck / test),
# run it. Any defined script that fails fails this gate (exit 1). If package.json
# is absent or a script is undefined, that gate is skipped (the repo is a scaffold
# with no toolchain yet). With nothing to run, the gate passes (exit 0).
#
# No env required. Run from the repo root.
set -uo pipefail

if [ ! -f package.json ]; then
  echo "run-gates: no package.json — no toolchain yet, skipping all gates (pass)."
  exit 0
fi

# Detect the package manager.
if [ -f yarn.lock ]; then
  RUN="yarn"
elif [ -f pnpm-lock.yaml ]; then
  RUN="pnpm"
else
  RUN="npm run"
fi

has_script() {
  node -e "process.exit(((require('./package.json').scripts)||{})['$1'] ? 0 : 1)" 2>/dev/null
}

run_gate() {
  local name="$1"
  if has_script "$name"; then
    echo "run-gates: running '$name' via '$RUN'…"
    # shellcheck disable=SC2086
    $RUN "$name"
  else
    echo "run-gates: no '$name' script defined — skipping."
  fi
}

FAILED=0
for g in lint typecheck test; do
  if ! run_gate "$g"; then
    echo "run-gates: gate '$g' FAILED."
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "run-gates: one or more gates failed."
  exit 1
fi
echo "run-gates: all applicable gates passed."
exit 0
```

- [ ] **Step 2: Make executable + syntax-check**

Run: `chmod +x .github/scripts/run-gates.sh && bash -n .github/scripts/run-gates.sh && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 3: Functional test — no package.json passes**

Run:
```bash
( tmp=$(mktemp -d); cp .github/scripts/run-gates.sh "$tmp/"; cd "$tmp"; bash run-gates.sh; echo "exit=$?" )
```
Expected: prints `no package.json … skipping all gates (pass)` and `exit=0`.

- [ ] **Step 4: Functional test — defined failing script fails the gate**

Run:
```bash
( tmp=$(mktemp -d); cp .github/scripts/run-gates.sh "$tmp/"; cd "$tmp"
  printf '{"scripts":{"lint":"node -e \\"process.exit(1)\\""}}' > package.json
  bash run-gates.sh; echo "exit=$?" )
```
Expected: prints `running 'lint'`, then `gate 'lint' FAILED`, and `exit=1`.

- [ ] **Step 5: Functional test — defined passing script passes; undefined skipped**

Run:
```bash
( tmp=$(mktemp -d); cp .github/scripts/run-gates.sh "$tmp/"; cd "$tmp"
  printf '{"scripts":{"lint":"node -e \\"process.exit(0)\\""}}' > package.json
  bash run-gates.sh; echo "exit=$?" )
```
Expected: `running 'lint'`, `no 'typecheck' script … skipping`, `no 'test' script … skipping`, `all applicable gates passed`, `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/run-gates.sh
git commit -m "feat: add auto-detecting run-gates verification script"
```

---

## Task 3: `authorize.sh` (the permission gate)

**Files:**
- Create: `.github/scripts/authorize.sh`

- [ ] **Step 1: Write the script**

`.github/scripts/authorize.sh`:

```bash
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
```

- [ ] **Step 2: Make executable + syntax-check**

Run: `chmod +x .github/scripts/authorize.sh && bash -n .github/scripts/authorize.sh && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 3: Functional test — allowlist match short-circuits (no gh needed)**

Run:
```bash
( export GITHUB_OUTPUT=/dev/null GH_TOKEN=x GITHUB_REPOSITORY=MishaMgla/opencraft1 ACTOR=MishaMgla OWNER_ISSUE=1
  bash .github/scripts/authorize.sh; echo "exit=$?" )
```
Expected: `authorize: 'MishaMgla' is on the allowlist.`, `authorized=true`, `exit=0`.

- [ ] **Step 4: Functional test — missing required env fails loudly**

Run:
```bash
( unset ACTOR; export GITHUB_OUTPUT=/dev/null GH_TOKEN=x GITHUB_REPOSITORY=MishaMgla/opencraft1 OWNER_ISSUE=1
  bash .github/scripts/authorize.sh; echo "exit=$?" )
```
Expected: errors with `ACTOR not set` and a non-zero `exit=`. (The author/allowlist branches are exercised live in Task 12.)

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/authorize.sh
git commit -m "feat: add author-rooted authorize.sh permission gate"
```

---

## Task 4: `auto-merge-spec.sh` (PAT cascade)

**Files:**
- Create: `.github/scripts/auto-merge-spec.sh`

- [ ] **Step 1: Write the script**

`.github/scripts/auto-merge-spec.sh`:

```bash
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
```

- [ ] **Step 2: Make executable + syntax-check**

Run: `chmod +x .github/scripts/auto-merge-spec.sh && bash -n .github/scripts/auto-merge-spec.sh && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 3: Functional test — missing env fails loudly**

Run: `( unset ISSUE; bash .github/scripts/auto-merge-spec.sh; echo "exit=$?" )`
Expected: `ISSUE not set` and non-zero exit. (Merge path is smoke-tested in Task 12.)

- [ ] **Step 4: Commit**

```bash
git add .github/scripts/auto-merge-spec.sh
git commit -m "feat: add auto-merge-spec PAT cascade script"
```

---

## Task 5: PM prompts

**Files:**
- Create: `.github/prompts/self-audit.md`
- Create: `.github/prompts/pm-system.md`
- Create: `.github/prompts/pm-draft-spec.md`
- Create: `.github/prompts/pm-revise-spec.md`

- [ ] **Step 1: `self-audit.md`**

```markdown
# PM self-audit

You are the opencraft1 PM agent. Before doing anything else, decide whether the
issue is clear enough to spec, or needs one clarifying question.

Read the issue title, body, and all comments. Then judge a single criterion:

**AMBIGUOUS INTENT** — fires if ANY of these are true:
- The desired outcome could be read two materially different ways.
- A decision that changes the shape of the work is unstated (scope, surface,
  data model, user-facing behaviour).
- The issue asks for something whose feasibility you cannot assess without one
  more fact from the author.

Decision:
- If AMBIGUOUS INTENT fires → you are in **question mode**: post exactly ONE
  focused clarifying question and stop. Do not draft a spec.
- Otherwise → you are in **draft mode**: follow `pm-draft-spec.md` to write the
  spec and open the spec PR directly.

Bias to drafting. Ask only when a wrong guess would waste the Dev agent's work.
End every comment you post with `<!-- agent-bot -->`.
```

- [ ] **Step 2: `pm-system.md`**

```markdown
# PM agent — clarifying question mode

You are the opencraft1 PM agent. Read `AGENT_RULES.md` and the relevant
`docs/project-map/*` docs before reasoning about scope.

Your job in this mode: move the issue toward a clear, buildable spec by asking
the author ONE question at a time.

Rules:
- Post a single, specific question — multiple-choice when you can, so it is easy
  to answer. No walls of text.
- If the issue is actually clear enough, do not ask — say
  "Looks clear — I'll draft the spec now." and proceed per `pm-draft-spec.md`.
- Never write code. Never open an implementation PR. You only produce specs.
- Stay within the issue's scope; do not invent adjacent features.
- Post your comment on the issue with:
  `gh issue comment <N> --body '<your message>'`
- End every comment with `<!-- agent-bot -->`.
```

- [ ] **Step 3: `pm-draft-spec.md`**

```markdown
# PM agent — draft spec mode

You are the opencraft1 PM agent. Read `AGENT_RULES.md` and the relevant
`docs/project-map/*` docs first.

Produce a spec and open a PR:

1. Pick a short kebab-case `<slug>` from the issue title.
2. Create a branch from `main`: `pm/issue-<N>-<slug>`.
3. Write the spec to `docs/specs/<YYYY-MM-DD>-issue-<N>-<slug>.md` (use
   `date +%Y-%m-%d` for the date). The spec MUST contain:
   - **Goal** — one sentence.
   - **Context** — why, and the relevant existing surface (cite project-map docs).
   - **Requirements** — numbered, testable, unambiguous. No "etc.".
   - **Out of scope** — what this explicitly does not do.
   - **Acceptance** — how a reviewer confirms it is done.
   Keep it tight. No placeholders, no "TBD".
4. Commit, push the branch, and open a PR with `gh pr create --base main`
   titled `spec: <issue title> (#<N>)` whose body links the issue
   (`Spec for #<N>`) and ends with `<!-- agent-bot -->`.
5. Comment the spec PR link on issue #<N>, ending with `<!-- agent-bot -->`.

Do not write implementation code. The Dev agent implements after the spec PR
merges. Use `git` + `gh` for all actions.
```

- [ ] **Step 4: `pm-revise-spec.md`**

```markdown
# PM agent — revise spec mode

You are the opencraft1 PM agent. An open spec PR exists for this issue and the
author has commented with feedback.

1. Find the open spec PR: `gh pr list --search "head:pm/issue-<N>-" --state open`.
2. Check out its head branch.
3. Edit the spec file under `docs/specs/` to incorporate the latest comment.
   Keep the same section structure (Goal / Context / Requirements / Out of scope
   / Acceptance). No placeholders.
4. Commit and push to the same branch.
5. Post a short summary of what changed as a comment on issue #<N>, ending with
   `<!-- agent-bot -->`.

Do not write implementation code. Use `git` + `gh`.
```

- [ ] **Step 5: Verify all four files exist and are non-empty**

Run: `wc -l .github/prompts/self-audit.md .github/prompts/pm-system.md .github/prompts/pm-draft-spec.md .github/prompts/pm-revise-spec.md`
Expected: four files, each > 5 lines.

- [ ] **Step 6: Commit**

```bash
git add .github/prompts/self-audit.md .github/prompts/pm-system.md .github/prompts/pm-draft-spec.md .github/prompts/pm-revise-spec.md
git commit -m "feat: add PM agent prompts"
```

---

## Task 6: Dev prompts

**Files:**
- Create: `.github/prompts/dev-system.md`
- Create: `.github/prompts/dev-revise.md`

- [ ] **Step 1: `dev-system.md`**

```markdown
# Dev agent — implement mode

You are the opencraft1 Dev agent. Read `AGENT_RULES.md` and the relevant
`docs/project-map/*` docs first, and follow the repo's coding style and
documentation-maintenance protocol.

A spec PR for issue #<N> has merged to `main`. Implement it:

1. Check out `main` and pull. Create a branch `claude/issue-<N>-<slug>` (reuse
   the spec's slug).
2. Read the merged spec at `docs/specs/<...>-issue-<N>-<slug>.md`. Implement
   exactly what it requires — no unsolicited features beyond the spec.
3. Do NOT add or modify automated tests unless the spec explicitly asks for test
   work (`AGENT_RULES.md` rule).
4. If your change alters routes/APIs/shared UI/tooling, update the matching
   `docs/project-map/*` doc in the same change.
5. Run the verification gate: `.github/scripts/run-gates.sh`. Fix anything it
   reports. (On the current scaffold it will skip — that is expected.)
6. Commit, push the branch, and open a PR with `gh pr create --base main`
   titled `feat: <issue title> (#<N>)`. The body summarizes the change, links
   the issue, and ends with `<!-- agent-bot -->`.
7. If you cannot complete the spec safely, do NOT open a green PR: open the PR,
   add the `needs-human` label, and explain why in a comment ending with
   `<!-- agent-bot -->`.

Use `git` + `gh` for all actions.
```

- [ ] **Step 2: `dev-revise.md`**

```markdown
# Dev agent — revise mode

You are the opencraft1 Dev agent. You are on the head branch of an open
implementation PR (`claude/issue-<N>-<slug>`) and the author has requested
changes in a PR comment.

1. Apply the requested revisions to this branch. Stay within the spec's scope
   plus what the comment asks for.
2. Do NOT add or modify automated tests unless explicitly asked.
3. If you touch routes/APIs/shared UI/tooling, update the matching
   `docs/project-map/*` doc in the same change.
4. Run `.github/scripts/run-gates.sh` and fix anything it reports.
5. Commit and push to the same branch.
6. Post a short summary of what changed as a comment on the PR, ending with
   `<!-- agent-bot -->`.

Do not merge the PR yourself — merging happens via `/merge` or `/approved`.
Use `git` + `gh`.
```

- [ ] **Step 3: Verify**

Run: `wc -l .github/prompts/dev-system.md .github/prompts/dev-revise.md`
Expected: two files, each > 5 lines.

- [ ] **Step 4: Commit**

```bash
git add .github/prompts/dev-system.md .github/prompts/dev-revise.md
git commit -m "feat: add Dev agent prompts"
```

---

## Task 7: `pm-intake.yml`

**Files:**
- Create: `.github/workflows/pm-intake.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/pm-intake.yml`:

```yaml
name: PM Intake

on:
  issues:
    types: [opened]

jobs:
  pm-intake:
    # Open intake: any issue opener triggers the PM agent (bounded to
    # collaborators by the private repo). `pm:skip` opts an issue out.
    if: |
      github.repository == 'MishaMgla/opencraft1' &&
      !contains(github.event.issue.labels.*.name, 'pm:skip')
    runs-on: [self-hosted]
    permissions:
      contents: write
      issues: write
      pull-requests: write
      id-token: write

    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

      - name: Build prompt
        id: load
        env:
          ISSUE_BODY: ${{ github.event.issue.body }}
          ISSUE_TITLE: ${{ github.event.issue.title }}
        run: |
          {
            echo 'prompt<<PROMPT_EOF'
            cat .github/prompts/pm-system.md
            echo ''
            echo '---'
            echo ''
            echo "RUN_LINK: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            echo "ISSUE NUMBER: ${{ github.event.issue.number }}"
            echo "ISSUE TITLE: $ISSUE_TITLE"
            echo ''
            echo "ISSUE BODY:"
            echo "$ISSUE_BODY"
            echo ''
            echo "ACTION: run the self-audit at .github/prompts/self-audit.md. If AMBIGUOUS INTENT fires, post ONE clarifying question on issue #${{ github.event.issue.number }}. Otherwise follow .github/prompts/pm-draft-spec.md to draft and open the spec PR directly. Use gh + git."
            echo 'PROMPT_EOF'
          } >> "$GITHUB_OUTPUT"

      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          prompt: ${{ steps.load.outputs.prompt }}
          claude_args: |
            --max-turns 60
            --setting-sources user,project,local
            --dangerously-skip-permissions

      - name: Auto-merge spec PR (PAT cascade to dev-implement)
        if: success()
        env:
          GH_TOKEN: ${{ secrets.AUTO_PAT }}
          ISSUE: ${{ github.event.issue.number }}
        run: .github/scripts/auto-merge-spec.sh

      - name: Post failure comment on error
        if: failure()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh issue comment ${{ github.event.issue.number }} \
            --repo ${{ github.repository }} \
            --body "🤖 PM intake failed. See run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
          <sub>🤖 PM · auto-error</sub><!-- agent-bot -->"
```

- [ ] **Step 2: Validate YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/pm-intake.yml')); print('YAML_OK')"`
Expected: `YAML_OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pm-intake.yml
git commit -m "feat: add pm-intake workflow"
```

---

## Task 8: `pm-followup.yml`

**Files:**
- Create: `.github/workflows/pm-followup.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/pm-followup.yml`:

```yaml
name: PM Followup

on:
  issue_comment:
    types: [created]

jobs:
  pm-followup:
    # Cheap inline pre-filter; authoritative author/allowlist check is the
    # Authorize step below. Only comments on issues (not PRs), not from the bot,
    # not /approved (that is dev-implement), not the // discuss escape hatch.
    if: |
      github.repository == 'MishaMgla/opencraft1' &&
      github.event.issue.pull_request == null &&
      github.event.comment.user.login != 'github-actions[bot]' &&
      !contains(github.event.comment.body, '<!-- agent-bot -->') &&
      !startsWith(github.event.comment.body, '/approved') &&
      !startsWith(github.event.comment.body, '//') &&
      !contains(github.event.issue.labels.*.name, 'pm:skip')
    runs-on: [self-hosted]
    permissions:
      contents: write
      issues: write
      pull-requests: write
      id-token: write

    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Authorize
        id: auth
        env:
          ACTOR: ${{ github.event.comment.user.login }}
          OWNER_ISSUE: ${{ github.event.issue.number }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: .github/scripts/authorize.sh

      - name: Reject unauthorized commenter
        if: steps.auth.outputs.authorized != 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh issue comment ${{ github.event.issue.number }} \
            --repo ${{ github.repository }} \
            --body "🤖 Only the issue author or an allowlisted maintainer can steer this issue's agent. Ignoring this comment.
          <sub>🤖 PM · auth</sub><!-- agent-bot -->"

      - name: Configure git
        if: steps.auth.outputs.authorized == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

      - name: Decide mode (draft / revise / question)
        id: mode
        if: steps.auth.outputs.authorized == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          COMMENT_BODY: ${{ github.event.comment.body }}
        run: |
          ISSUE=${{ github.event.issue.number }}
          OPEN_SPEC=$(gh pr list --repo ${{ github.repository }} \
            --search "head:pm/issue-$ISSUE-" --state open --json number --jq '.[0].number // ""')
          if [[ "$COMMENT_BODY" == /ready* ]]; then
            echo "mode=draft" >> "$GITHUB_OUTPUT"
          elif [ -n "$OPEN_SPEC" ]; then
            echo "mode=revise" >> "$GITHUB_OUTPUT"
          else
            echo "mode=question" >> "$GITHUB_OUTPUT"
          fi

      - name: Skip /ready if spec PR already exists
        id: spec_check
        if: steps.auth.outputs.authorized == 'true' && steps.mode.outputs.mode == 'draft'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          ISSUE=${{ github.event.issue.number }}
          EXISTING=$(gh pr list --repo ${{ github.repository }} \
            --search "head:pm/issue-$ISSUE-" --state all --json number --jq '.[0].number // ""')
          if [ -n "$EXISTING" ]; then
            echo "skip=true" >> "$GITHUB_OUTPUT"
            gh issue comment "$ISSUE" --repo ${{ github.repository }} \
              --body "🤖 Ignored \`/ready\` — spec PR #$EXISTING already exists.
          <sub>🤖 PM · auto</sub><!-- agent-bot -->"
          else
            echo "skip=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Build prompt
        id: load
        if: steps.auth.outputs.authorized == 'true' && steps.spec_check.outputs.skip != 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          COMMENT_BODY: ${{ github.event.comment.body }}
        run: |
          MODE="${{ steps.mode.outputs.mode }}"
          case "$MODE" in
            draft)    PROMPT_FILE=.github/prompts/pm-draft-spec.md ;;
            revise)   PROMPT_FILE=.github/prompts/pm-revise-spec.md ;;
            question) PROMPT_FILE=.github/prompts/pm-system.md ;;
          esac
          ISSUE=${{ github.event.issue.number }}
          COMMENTS=$(gh issue view "$ISSUE" --comments --json title,body,comments)
          {
            echo 'prompt<<PROMPT_EOF'
            cat "$PROMPT_FILE"
            echo ''
            echo '---'
            echo ''
            echo "RUN_LINK: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            echo "ISSUE NUMBER: $ISSUE"
            echo ''
            echo 'ISSUE + COMMENTS (JSON):'
            echo "$COMMENTS"
            echo ''
            echo "LATEST COMMENT BODY:"
            echo "$COMMENT_BODY"
            echo 'PROMPT_EOF'
          } >> "$GITHUB_OUTPUT"

      - name: Turn budget per mode
        id: tools
        if: steps.auth.outputs.authorized == 'true' && steps.spec_check.outputs.skip != 'true'
        run: |
          case "${{ steps.mode.outputs.mode }}" in
            draft)    echo 'turns=60' >> "$GITHUB_OUTPUT" ;;
            revise)   echo 'turns=45' >> "$GITHUB_OUTPUT" ;;
            question) echo 'turns=30' >> "$GITHUB_OUTPUT" ;;
          esac

      - uses: anthropics/claude-code-action@v1
        if: steps.auth.outputs.authorized == 'true' && steps.spec_check.outputs.skip != 'true'
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          prompt: ${{ steps.load.outputs.prompt }}
          claude_args: |
            --max-turns ${{ steps.tools.outputs.turns }}
            --setting-sources user,project,local
            --dangerously-skip-permissions

      - name: Auto-merge spec PR (PAT cascade)
        if: success() && steps.auth.outputs.authorized == 'true' && steps.mode.outputs.mode == 'draft' && steps.spec_check.outputs.skip != 'true'
        env:
          GH_TOKEN: ${{ secrets.AUTO_PAT }}
          ISSUE: ${{ github.event.issue.number }}
        run: .github/scripts/auto-merge-spec.sh

      - name: Post failure comment on error
        if: failure()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh issue comment ${{ github.event.issue.number }} \
            --repo ${{ github.repository }} \
            --body "🤖 PM followup failed (mode=${{ steps.mode.outputs.mode }}). See: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
          <sub>🤖 PM · auto-error</sub><!-- agent-bot -->"
```

- [ ] **Step 2: Validate YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/pm-followup.yml')); print('YAML_OK')"`
Expected: `YAML_OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pm-followup.yml
git commit -m "feat: add pm-followup workflow with author-rooted authorization"
```

---

## Task 9: `dev-implement.yml`

**Files:**
- Create: `.github/workflows/dev-implement.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/dev-implement.yml`:

```yaml
name: Dev Implement

on:
  issue_comment:
    types: [created]
  pull_request:
    types: [closed]

jobs:
  dev-implement:
    # Two entry points:
    #  (a) a spec PR (head pm/issue-*) merged → implement (write-access gate).
    #  (b) /approved on the issue → implement (author/allowlist gate, applied in
    #      the Authorize step below).
    if: |
      github.repository == 'MishaMgla/opencraft1' &&
      (
        (
          github.event_name == 'pull_request' &&
          github.event.pull_request.merged == true &&
          github.event.pull_request.head.repo.full_name == github.repository &&
          startsWith(github.event.pull_request.head.ref, 'pm/issue-') &&
          !contains(github.event.pull_request.labels.*.name, 'hold') &&
          !contains(github.event.pull_request.labels.*.name, 'needs-human')
        ) ||
        (
          github.event_name == 'issue_comment' &&
          github.event.issue.pull_request == null &&
          startsWith(github.event.comment.body, '/approved') &&
          github.event.comment.user.login != 'github-actions[bot]' &&
          !contains(github.event.comment.body, '<!-- agent-bot -->')
        )
      )
    runs-on: [self-hosted]
    concurrency:
      group: dev-issue-${{ github.event.issue.number || github.event.pull_request.head.ref }}
      cancel-in-progress: false
    permissions:
      contents: write
      issues: write
      pull-requests: write
      actions: read
      id-token: write

    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

      - name: Resolve issue number
        id: resolve
        run: |
          if [ "${{ github.event_name }}" = "pull_request" ]; then
            BRANCH="${{ github.event.pull_request.head.ref }}"
            ISSUE=$(echo "$BRANCH" | sed -E 's|^pm/issue-([0-9]+)-.*|\1|')
          else
            ISSUE="${{ github.event.issue.number }}"
          fi
          echo "issue=$ISSUE" >> "$GITHUB_OUTPUT"

      # Comment-path only: author/allowlist gate. The pull_request (spec-merge)
      # path is already gated by write-access-to-merge, so it skips this.
      - name: Authorize (comment path)
        id: auth
        if: github.event_name == 'issue_comment'
        env:
          ACTOR: ${{ github.event.comment.user.login }}
          OWNER_ISSUE: ${{ steps.resolve.outputs.issue }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: .github/scripts/authorize.sh

      - name: Compute proceed + guard duplicates
        id: guard
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Authorization: pull_request path always ok; comment path needs auth=true.
          if [ "${{ github.event_name }}" = "issue_comment" ] && [ "${{ steps.auth.outputs.authorized }}" != "true" ]; then
            gh issue comment "${{ steps.resolve.outputs.issue }}" --repo ${{ github.repository }} \
              --body "🤖 Only the issue author or an allowlisted maintainer can /approved this issue. Ignoring.
          <sub>🤖 Dev · auth</sub><!-- agent-bot -->"
            echo "proceed=false" >> "$GITHUB_OUTPUT"; exit 0
          fi
          # Duplicate guard: if an impl PR is already open for this issue, an
          # issue-level /approved must NOT spin up a fresh implementation.
          if [ "${{ github.event_name }}" = "issue_comment" ]; then
            ISSUE=${{ steps.resolve.outputs.issue }}
            EXISTING=$(gh pr list --repo ${{ github.repository }} --state open \
              --json number,headRefName \
              --jq "[.[] | select(.headRefName | startswith(\"claude/issue-${ISSUE}-\"))] | .[0].number // \"\"")
            if [ -n "$EXISTING" ]; then
              gh issue comment "$ISSUE" --repo ${{ github.repository }} \
                --body "🤖 Impl PR #$EXISTING is already open for this issue. To merge it, comment \`/approved\` on the PR.
          <sub>🤖 Dev · auto</sub><!-- agent-bot -->"
              echo "proceed=false" >> "$GITHUB_OUTPUT"; exit 0
            fi
          fi
          echo "proceed=true" >> "$GITHUB_OUTPUT"

      - uses: actions/setup-node@v4
        if: steps.guard.outputs.proceed == 'true'
        with:
          node-version: '20'

      - name: Install deps if present
        if: steps.guard.outputs.proceed == 'true'
        run: |
          if [ -f package.json ]; then
            corepack enable || true
            if [ -f yarn.lock ]; then yarn install --frozen-lockfile;
            elif [ -f package-lock.json ]; then npm ci;
            else npm install; fi
          else
            echo "No package.json — scaffold, skipping install."
          fi

      - name: Build prompt
        id: load
        if: steps.guard.outputs.proceed == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          ISSUE=${{ steps.resolve.outputs.issue }}
          COMMENTS=$(gh issue view "$ISSUE" --comments --json title,body,comments)
          {
            echo 'prompt<<PROMPT_EOF'
            cat .github/prompts/dev-system.md
            echo ''
            echo '---'
            echo ''
            echo "RUN_LINK: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            echo "ISSUE NUMBER: $ISSUE"
            echo 'ISSUE + COMMENTS (JSON):'
            echo "$COMMENTS"
            echo 'PROMPT_EOF'
          } >> "$GITHUB_OUTPUT"

      - uses: anthropics/claude-code-action@v1
        if: steps.guard.outputs.proceed == 'true'
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          prompt: ${{ steps.load.outputs.prompt }}
          claude_args: |
            --max-turns 150
            --setting-sources user,project,local
            --dangerously-skip-permissions

      - name: Resolve impl PR
        id: implpr
        if: success() && steps.guard.outputs.proceed == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          ISSUE=${{ steps.resolve.outputs.issue }}
          PRJSON=$(gh pr list --repo ${{ github.repository }} --state open \
            --json number,headRefName,labels \
            --jq "[.[] | select(.headRefName | startswith(\"claude/issue-${ISSUE}-\"))] | .[0] // {}")
          PR=$(echo "$PRJSON" | jq -r '.number // ""')
          LABELS=$(echo "$PRJSON" | jq -r '([.labels[].name] // []) | join(",")')
          echo "pr=$PR" >> "$GITHUB_OUTPUT"
          if [ -n "$PR" ] && [[ ",$LABELS," != *",needs-human,"* ]] && [[ ",$LABELS," != *",hold,"* ]]; then
            echo "gate=true" >> "$GITHUB_OUTPUT"
          else
            echo "gate=false" >> "$GITHUB_OUTPUT"
            echo "Skipping gate: pr='$PR' labels='$LABELS' (agent escalated or no PR)."
          fi

      - name: Verification gate
        if: steps.implpr.outputs.gate == 'true'
        run: .github/scripts/run-gates.sh

      - name: Auto-merge on green
        if: steps.implpr.outputs.gate == 'true'
        env:
          GH_TOKEN: ${{ secrets.AUTO_PAT }}
        run: |
          PR=${{ steps.implpr.outputs.pr }}
          gh pr comment "$PR" --repo ${{ github.repository }} --body "🤖 Gates passed. Merging to main.
          <sub>🤖 Dev · ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}</sub><!-- agent-bot -->"
          gh pr merge "$PR" --repo ${{ github.repository }} --squash --delete-branch

      - name: Post failure comment on error
        if: failure()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh issue comment ${{ steps.resolve.outputs.issue }} \
            --repo ${{ github.repository }} \
            --body "🤖 Dev run failed. See: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
          <sub>🤖 Dev · auto-error</sub><!-- agent-bot -->"
```

- [ ] **Step 2: Validate YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/dev-implement.yml')); print('YAML_OK')"`
Expected: `YAML_OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/dev-implement.yml
git commit -m "feat: add dev-implement workflow"
```

---

## Task 10: `dev-revise.yml`

**Files:**
- Create: `.github/workflows/dev-revise.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/dev-revise.yml`:

```yaml
name: Dev Revise

on:
  issue_comment:
    types: [created]

jobs:
  dev-revise:
    # PR comments only. `//` prefix or `<!-- discuss -->` = free discussion, no
    # agent. Merge happens only via /merge or /approved. Authoritative author/
    # allowlist check is the Authorize step (keyed to the originating issue).
    if: |
      github.repository == 'MishaMgla/opencraft1' &&
      github.event.issue.pull_request != null &&
      github.event.comment.user.login != 'github-actions[bot]' &&
      !contains(github.event.comment.body, '<!-- agent-bot -->') &&
      !startsWith(github.event.comment.body, '//') &&
      !contains(github.event.comment.body, '<!-- discuss -->')
    runs-on: [self-hosted]
    concurrency:
      group: dev-revise-pr-${{ github.event.issue.number }}
      cancel-in-progress: false
    permissions:
      contents: write
      issues: write
      pull-requests: write
      id-token: write

    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Resolve PR + branch + owner issue
        id: pr
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ github.event.issue.number }}
          INFO=$(gh pr view "$PR" --repo ${{ github.repository }} --json headRefName,state)
          BRANCH=$(echo "$INFO" | jq -r .headRefName)
          STATE=$(echo "$INFO" | jq -r .state)
          echo "pr=$PR" >> "$GITHUB_OUTPUT"
          echo "branch=$BRANCH" >> "$GITHUB_OUTPUT"
          # Originating issue number parsed from the impl branch claude/issue-<N>-*
          OWNER_ISSUE=$(echo "$BRANCH" | sed -nE 's|^claude/issue-([0-9]+)-.*|\1|p')
          echo "owner_issue=$OWNER_ISSUE" >> "$GITHUB_OUTPUT"
          if [[ "$BRANCH" == claude/issue-* && "$STATE" == "OPEN" ]]; then
            echo "skip=false" >> "$GITHUB_OUTPUT"
          else
            echo "skip=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Authorize
        id: auth
        if: steps.pr.outputs.skip == 'false'
        env:
          ACTOR: ${{ github.event.comment.user.login }}
          OWNER_ISSUE: ${{ steps.pr.outputs.owner_issue }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: .github/scripts/authorize.sh

      - name: Reject unauthorized commenter
        if: steps.pr.outputs.skip == 'false' && steps.auth.outputs.authorized != 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr comment ${{ steps.pr.outputs.pr }} --repo ${{ github.repository }} \
            --body "🤖 Only the originating issue's author or an allowlisted maintainer can steer this PR. Ignoring.
          <sub>🤖 Dev · auth</sub><!-- agent-bot -->"

      - name: Decide mode (merge / revise / skip)
        id: mode
        if: steps.pr.outputs.skip == 'false' && steps.auth.outputs.authorized == 'true'
        env:
          COMMENT_BODY: ${{ github.event.comment.body }}
        run: |
          BODY_TRIM=$(printf '%s' "$COMMENT_BODY" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
          if [[ "$BODY_TRIM" == /merge* || "$BODY_TRIM" == /approved* ]]; then
            echo "mode=merge" >> "$GITHUB_OUTPUT"
          elif [[ "$BODY_TRIM" == /cancel* || -z "$BODY_TRIM" ]]; then
            echo "mode=skip" >> "$GITHUB_OUTPUT"
          else
            echo "mode=revise" >> "$GITHUB_OUTPUT"
          fi

      - name: Merge PR (mode=merge)
        if: steps.mode.outputs.mode == 'merge'
        env:
          GH_TOKEN: ${{ secrets.AUTO_PAT }}
        run: |
          PR=${{ steps.pr.outputs.pr }}
          gh pr merge "$PR" --repo ${{ github.repository }} --squash --delete-branch
          gh pr comment "$PR" --repo ${{ github.repository }} --body "🤖 Merged to main via /merge or /approved. Branch deleted.
          <sub>🤖 Dev · ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}</sub><!-- agent-bot -->"

      - uses: actions/checkout@v6
        if: steps.mode.outputs.mode == 'revise'
        with:
          fetch-depth: 0
          ref: ${{ steps.pr.outputs.branch }}

      - name: Configure git
        if: steps.mode.outputs.mode == 'revise'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

      - uses: actions/setup-node@v4
        if: steps.mode.outputs.mode == 'revise'
        with:
          node-version: '20'

      - name: Install deps if present
        if: steps.mode.outputs.mode == 'revise'
        run: |
          if [ -f package.json ]; then
            corepack enable || true
            if [ -f yarn.lock ]; then yarn install --frozen-lockfile;
            elif [ -f package-lock.json ]; then npm ci;
            else npm install; fi
          else
            echo "No package.json — scaffold, skipping install."
          fi

      - name: Build prompt (revise)
        id: load
        if: steps.mode.outputs.mode == 'revise'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          COMMENT_BODY: ${{ github.event.comment.body }}
        run: |
          PR=${{ steps.pr.outputs.pr }}
          BRANCH=${{ steps.pr.outputs.branch }}
          PR_VIEW=$(gh pr view "$PR" --repo ${{ github.repository }} \
            --json title,body,comments,files,headRefName)
          {
            echo 'prompt<<PROMPT_EOF'
            cat .github/prompts/dev-revise.md
            echo ''
            echo '---'
            echo ''
            echo "RUN_LINK: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            echo "PR NUMBER: $PR"
            echo "PR BRANCH: $BRANCH"
            echo ''
            echo 'PR (JSON):'
            echo "$PR_VIEW"
            echo ''
            echo 'LATEST COMMENT BODY (the revision request):'
            echo "$COMMENT_BODY"
            echo 'PROMPT_EOF'
          } >> "$GITHUB_OUTPUT"

      - uses: anthropics/claude-code-action@v1
        if: steps.mode.outputs.mode == 'revise'
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          prompt: ${{ steps.load.outputs.prompt }}
          claude_args: |
            --max-turns 60
            --setting-sources user,project,local
            --dangerously-skip-permissions

      - name: Verification gate
        if: steps.mode.outputs.mode == 'revise' && success()
        run: .github/scripts/run-gates.sh

      - name: Post failure comment on error
        if: failure()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr comment ${{ steps.pr.outputs.pr }} \
            --repo ${{ github.repository }} \
            --body "🤖 Dev revise failed (mode=${{ steps.mode.outputs.mode }}). See: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
          <sub>🤖 Dev · auto-error</sub><!-- agent-bot -->"
```

- [ ] **Step 2: Validate YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/dev-revise.yml')); print('YAML_OK')"`
Expected: `YAML_OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/dev-revise.yml
git commit -m "feat: add dev-revise workflow with author-rooted authorization"
```

---

## Task 11: `close-issue-on-impl-merge.yml`

**Files:**
- Create: `.github/workflows/close-issue-on-impl-merge.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/close-issue-on-impl-merge.yml`:

```yaml
name: Close issue on impl PR merge

# When a Dev-opened impl PR (head claude/issue-<N>-*) merges into main, close
# the originating issue #<N>. A dedicated workflow because GitHub ignores
# `closes #N` keywords from bot-authored PRs without write access.

on:
  pull_request:
    types: [closed]

jobs:
  close-issue:
    if: |
      github.repository == 'MishaMgla/opencraft1' &&
      github.event.pull_request.merged == true &&
      github.event.pull_request.head.repo.full_name == github.repository &&
      startsWith(github.event.pull_request.head.ref, 'claude/issue-')
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: read

    steps:
      - name: Resolve issue number from branch name
        id: resolve
        env:
          BRANCH: ${{ github.event.pull_request.head.ref }}
        run: |
          ISSUE=$(echo "$BRANCH" | sed -nE 's|^claude/issue-([0-9]+)-.*|\1|p')
          if [ -z "$ISSUE" ]; then
            echo "Could not parse issue number from branch '$BRANCH'; nothing to close." >&2
            exit 0
          fi
          echo "issue=$ISSUE" >> "$GITHUB_OUTPUT"

      - name: Close issue (idempotent)
        if: steps.resolve.outputs.issue != ''
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ISSUE: ${{ steps.resolve.outputs.issue }}
          PR_URL: ${{ github.event.pull_request.html_url }}
        run: |
          STATE=$(gh issue view "$ISSUE" --repo ${{ github.repository }} --json state --jq .state 2>/dev/null || echo "MISSING")
          if [ "$STATE" = "MISSING" ]; then echo "Issue #$ISSUE not found; skipping."; exit 0; fi
          if [ "$STATE" = "CLOSED" ]; then echo "Issue #$ISSUE already closed; skipping."; exit 0; fi
          gh issue close "$ISSUE" --repo ${{ github.repository }} \
            --reason completed \
            --comment "🤖 Closed automatically — implementation PR $PR_URL merged to main.
          <sub>🤖 Dev · auto-close</sub><!-- agent-bot -->"
```

Note: this job runs on `ubuntu-latest` (it only needs `gh`, no agent), so it does
not consume the self-hosted runner.

- [ ] **Step 2: Validate YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/close-issue-on-impl-merge.yml')); print('YAML_OK')"`
Expected: `YAML_OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/close-issue-on-impl-merge.yml
git commit -m "feat: add close-issue-on-impl-merge workflow"
```

---

## Task 12: Documentation

**Files:**
- Create: `docs/project-map/agents.md`
- Create: `docs/agents-setup.md`
- Modify: `AGENT_RULES.md` (add a pointer-table row + changelog discipline note is already covered)
- Modify: `docs/project-map/README.md` (prepend a changelog line)

- [ ] **Step 1: `docs/project-map/agents.md`**

```markdown
# agent system

GitHub-Actions PM + Dev agents that turn issues into merged PRs. Source of truth
for behaviour is the workflow + prompt files under `.github/`.

## flow

1. **Issue opened** → `pm-intake.yml` runs the PM agent. It either asks one
   clarifying question or drafts a spec to `docs/specs/<date>-issue-<N>-<slug>.md`
   on branch `pm/issue-<N>-<slug>`, opens a spec PR, and auto-merges it
   (`AUTO_PAT`), which cascades to dev-implement.
2. **Issue comment** → `pm-followup.yml` runs the PM agent to answer, draft
   (`/ready`), or revise the open spec.
3. **Spec PR merged** (or `/approved` on the issue) → `dev-implement.yml` runs
   the Dev agent: implement on `claude/issue-<N>-<slug>`, run
   `run-gates.sh`, open an impl PR, auto-merge on green (`AUTO_PAT`).
4. **PR comment** → `dev-revise.yml`: revise the code, or `/merge`·`/approved`
   to merge.
5. **Impl PR merged** → `close-issue-on-impl-merge.yml` closes the issue.

## permission model

Comment-driven agents are gated by `.github/scripts/authorize.sh`: a commenter
may steer issue N (and its `pm/issue-N-*` / `claude/issue-N-*` PRs) only if they
authored issue N or appear in `.github/agents-allowlist.txt`. Opening an issue is
open to any collaborator (the repo is private). Spec-merge → dev-implement is
gated by write-access-to-merge, not the author check.

## escape hatches

- `pm:skip` label on an issue → PM agent ignores it.
- `//` prefix or `<!-- discuss -->` in a PR comment → no Dev agent (free chat).
- `hold` / `needs-human` label → suppresses auto-merge; routes to a human.

## files

Workflows: `.github/workflows/{pm-intake,pm-followup,dev-implement,dev-revise,close-issue-on-impl-merge}.yml`.
Scripts: `.github/scripts/{authorize,run-gates,auto-merge-spec}.sh`.
Prompts: `.github/prompts/*.md`. Allowlist: `.github/agents-allowlist.txt`.
Operator setup: `docs/agents-setup.md`.
```

- [ ] **Step 2: `docs/agents-setup.md`**

```markdown
# agent system — operator setup

One-time setup to make the PM/Dev agents run on `MishaMgla/opencraft1`.

## 1. Repository secrets

Add under **Settings → Secrets and variables → Actions**:

- `CLAUDE_CODE_OAUTH_TOKEN` — generate locally with `claude setup-token`
  (uses your Claude subscription; no per-call API billing).
- `AUTO_PAT` — a **fine-grained** personal access token scoped to the
  `opencraft1` repo with: Contents = Read/Write, Pull requests = Read/Write,
  Issues = Read/Write. Used for merges that must cascade to the next workflow
  (a `GITHUB_TOKEN` merge does not trigger new workflow runs).

## 2. Self-hosted runner

The agent jobs use `runs-on: [self-hosted]`. Register one runner to this repo:

1. Visit `https://github.com/MishaMgla/opencraft1/settings/actions/runners/new`.
2. On the runner machine (the existing VDS can host a second runner in its own
   folder):
   ```bash
   mkdir ~/actions-runner-opencraft1 && cd ~/actions-runner-opencraft1
   # run the download lines shown on the page, then:
   ./config.sh --url https://github.com/MishaMgla/opencraft1 --token <TOKEN>
   # accept default name + labels
   sudo ./svc.sh install && sudo ./svc.sh start    # or: ./run.sh
   ```
3. Accept default labels (`self-hosted, Linux, X64`). No custom label needed.

`close-issue-on-impl-merge.yml` runs on `ubuntu-latest` (no agent), so it needs
no self-hosted runner.

## 3. Allowlist

Edit `.github/agents-allowlist.txt` — one GitHub username per line — to grant
maintainers the right to steer any issue/PR's agent regardless of who opened it.
```

- [ ] **Step 3: Add pointer-table row to `AGENT_RULES.md`**

In `AGENT_RULES.md`, under the project-map pointer table, add this row after the glossary row:

```markdown
| PM/Dev agent system (workflows, prompts, permissions) | `docs/project-map/agents.md` |
```

- [ ] **Step 4: Prepend changelog line in `docs/project-map/README.md`**

Add to the top of that file's `## changelog` section:

```markdown
- 2026-06-11: add PM/Dev agent system (`.github/` workflows + `docs/project-map/agents.md`).
```

(If no `## changelog` section exists yet, add one at the end of the file with that single bullet.)

- [ ] **Step 5: Validate the two new YAML-free docs render + commit**

Run: `wc -l docs/project-map/agents.md docs/agents-setup.md`
Expected: both non-empty.

```bash
git add docs/project-map/agents.md docs/agents-setup.md AGENT_RULES.md docs/project-map/README.md
git commit -m "docs: document agent system and operator setup"
```

---

## Task 13: End-to-end smoke test (after secrets + runner exist)

This is a live test. It requires Task-12 setup (secrets + runner) done by the
operator. Do not skip — it is the real verification that the workflows wire up.

- [ ] **Step 1: Push the branch and open a PR for the agent system itself**

```bash
git push -u origin agents/pm-dev-flow
gh pr create --base main --title "feat: PM + Dev agent system" --body "Implements docs/superpowers/plans/2026-06-11-pm-dev-agent-flow.md"
```

- [ ] **Step 2: Merge to main** (workflows must be on the default branch to trigger on issues)

Review, then merge the PR (squash). Confirm `.github/workflows/*` are on `main`.

- [ ] **Step 3: Authorized happy path**

As `MishaMgla`, open a clear, tiny issue (e.g. "Add a CONTRIBUTING.md with a one-line intro").
Expected sequence (watch `gh run list --repo MishaMgla/opencraft1`):
- PM Intake runs → spec PR `pm/issue-<N>-*` opened → auto-merged.
- Dev Implement runs → impl PR `claude/issue-<N>-*` opened → gate skips (no
  toolchain) → auto-merged.
- Close-issue runs → issue closed.

Run to verify final state: `gh issue view <N> --json state --jq .state` → `CLOSED`.

- [ ] **Step 4: Unauthorized steering is blocked**

Have a second account (or simulate by temporarily removing yourself from the
allowlist on a branch — but the real test needs a non-author account) comment on
an open agent issue. Expected: `pm-followup` posts the "Only the issue author or
an allowlisted maintainer…" rejection and runs no agent. Confirm via the run log
that the `Authorize` step emitted `authorized=false` and the agent step was
skipped.

- [ ] **Step 5: Discussion escape hatch**

Comment `// just thinking out loud` on an impl PR. Expected: no `dev-revise` run
starts (the `if:` filters it out). Confirm with `gh run list`.

- [ ] **Step 6: Record any drift**

If a workflow misbehaves, capture the failing run URL, fix the file, re-validate
YAML, commit, and re-run the relevant step. Add a one-line entry to the
`## common pitfalls` section of `AGENT_RULES.md` if something non-obvious bit.

---

## Self-review notes (author check against spec)

- **Spec coverage:** PM+Dev scope (Tasks 7–11) ✓; author+allowlist permissions
  (Task 3 + auth steps in Tasks 8–10) ✓; open intake (Task 7, no auth on
  `issues: opened`) ✓; auto-detect gates (Task 2, wired in Tasks 9–10) ✓;
  AUTO_PAT auto-cascade (Tasks 4, 7, 9) ✓; OAuth auth + self-hosted runner
  (all workflows) ✓; spec output `docs/specs/` (Task 5 prompt) ✓; bot marker
  `<!-- agent-bot -->` (all prompts + workflows) ✓; setup docs (Task 12) ✓.
- **Naming consistency:** `authorized` output, `proceed`/`gate`/`skip`/`mode`
  step outputs, `OWNER_ISSUE`/`ACTOR` env names are used identically across all
  files that reference them.
- **Out of scope (per design):** no research workflow, no visual-regression
  gate, no source changes — none added.
