# PM + Dev Agent Flow — Design

> **Status:** implemented — historical record of work already merged to `main`. Kept for design rationale; **not** active instructions.

**Date:** 2026-06-11
**Repo:** `MishaMgla/opencraft1` (private, default branch `main`)
**Status:** Approved design, pending implementation plan

## Goal

Stand up a GitHub-Actions-driven multi-agent workflow on `opencraft1`, modeled on
the `contentos` PM/Dev pipeline but with **our own prompts** and a **stricter,
author-rooted permission model**. Issues and PRs may only be steered by the
person who started the originating issue, or by a hardcoded allowlist.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Pipeline scope | **PM + Dev only** — no research stage |
| Permission model | **Author of originating issue + hardcoded allowlist** (replaces contentos's OWNER/COLLABORATOR/MEMBER association check) |
| Intake | **Open** — anyone who can open an issue triggers the PM agent (repo is private, so this is bounded to collaborators); the allowlist only governs steering *others'* threads |
| Dev verification gates | **Auto-detect** — run lint/typecheck/test only if `package.json` defines those scripts; skip cleanly otherwise (repo is a scaffold with no toolchain yet) |
| Merge model | **Full auto-cascade** (same as contentos): PM auto-merges the spec PR via `AUTO_PAT`; Dev auto-merges the impl PR on green via `AUTO_PAT`; originating issue auto-closes |
| Claude auth | `CLAUDE_CODE_OAUTH_TOKEN` (subscription, via `claude setup-token`) |
| Runner | Self-hosted, `runs-on: [self-hosted]` (one runner registered to `opencraft1`) |

## End-to-end flow

```
You open an issue
   └─▶ pm-intake.yml ─ PM agent: self-audit → ask ONE clarifying question, OR
                       draft a spec → open spec PR (pm/issue-<N>-<slug>)
                       → auto-merge spec PR via AUTO_PAT ───cascade──┐
                                                                     ▼
                                                  dev-implement.yml ─ Dev agent:
                                                    read merged spec → write code on
                                                    claude/issue-<N>-<slug> → run gates
                                                    (auto-detected) → open impl PR
                                                    → auto-merge on green via AUTO_PAT ──┐
                                                                                         ▼
                                                            close-issue-on-impl-merge.yml
                                                            → close issue #N

Revise loops:
  comment on the ISSUE    ─▶ pm-followup.yml ─ PM agent revises spec / answers
  comment on the impl PR  ─▶ dev-revise.yml  ─ Dev agent revises code, or
                                               /approved · /merge → merge PR
```

## Permission model (the core differentiator)

Authority is **rooted in the originating issue's author**, plus a global allowlist.

**Definitions**
- `author(N)` = GitHub login that opened issue `N` (`github.event.issue.user.login`
  for issue events; resolved via `gh issue view N` for PR/PR-comment events).
- `allowlist` = usernames listed in `.github/agents-allowlist.txt`, one per line,
  seeded with `MishaMgla`.

**Rule**
> A user may steer issue `N` or any agent-opened PR belonging to issue `N`
> (`pm/issue-N-*`, `claude/issue-N-*`) **iff** `user == author(N)` **OR**
> `user ∈ allowlist`.

**Why author-of-issue and not author-of-PR:** the impl/spec PRs are opened by the
bot, so their GitHub author is `github-actions[bot]`, not a human. "PR starter"
must therefore mean the *originating issue's* starter — otherwise no human could
ever steer the PR. We parse `<N>` out of the branch name (`pm/issue-<N>-…`,
`claude/issue-<N>-…`) and look up `author(N)`.

**Intake is exempt from the steering check:** opening an issue *is* the act of
starting it, so `pm-intake` runs for any opener (bounded to collaborators by the
private repo). The steering check applies to comment-driven events only.

### Gate implementation — shared `authorize.sh` (chosen approach)

Each agent workflow runs `.github/scripts/authorize.sh` as its **first job step**.
The script:
1. Identifies the **actor** (comment author, or issue author on `opened`).
2. Resolves the **owner** = `author(N)`:
   - issue events → `github.event.issue.user.login`;
   - PR / PR-comment events → parse `N` from the branch, `gh issue view N`.
3. Reads `.github/agents-allowlist.txt`.
4. **Authorized** iff `actor == owner` OR `actor ∈ allowlist`.
5. If not authorized: post a short "not authorized" comment and exit the job
   cleanly (neutral, not a red failure).

A cheap inline `if:` pre-filter still guards each workflow to avoid spinning the
runner on irrelevant events — repo guard, command-prefix match (e.g.
`/approved`, `/merge`), and bot-comment filter (`<!-- agent-bot -->`). The
*authoritative* author/allowlist decision lives in `authorize.sh` because it may
need a `gh` lookup (PR→issue resolution) that a YAML `if:` expression cannot do.

Rejected alternative — inline `if:` per workflow: cannot resolve the originating
issue's author for PR comments (payload exposes only the bot as PR author), and
duplicates the allowlist across YAML files.

## Files to create

**Workflows — `.github/workflows/`**
- `pm-intake.yml` — `issues: [opened]` → PM agent → auto-merge spec PR (cascade)
- `pm-followup.yml` — `issue_comment: [created]` on an issue (not a PR) → PM revise/answer
- `dev-implement.yml` — `pull_request: [closed]` (merged, head `pm/issue-*`), plus the
  `/approved` issue-comment path → Dev agent → gates → impl PR → auto-merge on green
- `dev-revise.yml` — `issue_comment: [created]` on a PR (head `claude/issue-*`) → Dev
  revise, or `/approved` · `/merge` → merge
- `close-issue-on-impl-merge.yml` — `pull_request: [closed]` (merged, head `claude/issue-*`)
  → close originating issue (shell only, no agent)

**Scripts — `.github/scripts/`**
- `authorize.sh` — the shared permission gate (described above)
- `auto-merge-spec.sh` — merge the spec PR via `AUTO_PAT` so the merge cascades to dev
- `run-gates.sh` — auto-detect: if `package.json` has `lint`/`typecheck`/`test`
  scripts, run them; otherwise log "no toolchain, skipping" and pass

**Prompts — `.github/prompts/`** (our own; reference `AGENT_RULES.md` + `docs/project-map`)
- `pm-system.md`, `self-audit.md`, `pm-draft-spec.md`, `pm-revise-spec.md`
- `dev-system.md`, `dev-revise.md`

**Config / data**
- `.github/agents-allowlist.txt` — seeded with `MishaMgla`
- `.claude/settings.json` — whitelist `git` / `gh` / test commands for the agents

**Agent output location**
- Agent-authored specs → `docs/specs/<date>-issue-<N>-<slug>.md`
  (kept distinct from the human brainstorming dir `docs/superpowers/specs/`)

## Conventions inherited from contentos

- Branch naming: spec = `pm/issue-<N>-<slug>`, impl = `claude/issue-<N>-<slug>`
- Bot-comment marker `<!-- agent-bot -->` (our own marker) to break trigger loops
- Labels: `hold` / `needs-human` suppress auto-merge and route to a human
- `claude-code-action@v1` with `--setting-sources user,project,local`
  and `--dangerously-skip-permissions`; per-job `--max-turns` budgets
- `AUTO_PAT` used for any merge that must cascade to the next workflow, because a
  `GITHUB_TOKEN`-triggered event does **not** start new workflow runs (GitHub's
  loop-prevention rule)

## Required setup (deploy-time, documented for the user — not code)

1. **`AUTO_PAT`** — fine-grained PAT scoped to `opencraft1`: Contents RW,
   Pull requests RW, Issues RW. Add as repo secret.
2. **`CLAUDE_CODE_OAUTH_TOKEN`** — generate via `claude setup-token`. Add as repo secret.
3. **Self-hosted runner** registered to `opencraft1` (the existing contentos VDS can
   host a second runner process in its own folder). Accept default labels
   (`self-hosted, Linux, X64`); no custom label needed.

## Out of scope

- Research agent / `/research` flow
- Visual-regression gate (`test:visual`) and baseline auto-commit — no UI/test
  toolchain in the scaffold yet; revisit when a frontend lands
- Any change to existing `opencraft1` source (there is none yet)

## Open follow-ups (post-MVP)

- Add real lint/typecheck/test gates once `package.json` + toolchain land
  (`run-gates.sh` already auto-detects them, so this is config-only later)
- Optional: per-issue `pm:skip` label to opt an issue out of the PM agent
