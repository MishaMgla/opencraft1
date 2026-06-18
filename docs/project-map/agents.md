# agent system

GitHub-Actions PM + Dev agents that turn issues into merged PRs. Source of truth
for behaviour is the workflow + prompt files under `.github/`. The agents run on
the **Codex CLI** (`codex exec`, model `gpt-5.5`) on a self-hosted runner that
is pre-authenticated with a ChatGPT subscription — see `docs/agents-setup.md`.

## flow

1. **Issue opened** → `pm-intake.yml` runs the PM agent. It either asks one
   clarifying question or drafts a spec to `docs/specs/<date>-issue-<N>-<slug>.md`
   on branch `pm/issue-<N>-<slug>`, opens a spec PR, and auto-merges it
   (`AUTO_PAT`), which cascades to dev-implement.
2. **Issue comment** → `pm-followup.yml` runs the PM agent to answer, draft
   (`/ready`), or revise the open spec.
3. **Spec PR merged** (or `/approved` on the issue) → `dev-implement.yml` runs
   the Dev agent: implement on `codex/issue-<N>-<slug>`, run
   `run-gates.sh`, open an impl PR, auto-merge on green (`AUTO_PAT`).
4. **PR comment** → `dev-revise.yml`: revise the code, or `/merge`·`/approved`
   to merge.
5. **Impl PR merged** → `close-issue-on-impl-merge.yml` closes the issue.

## permission model

Comment-driven agents are gated by `.github/scripts/authorize.sh`: a commenter
may steer issue N (and its `pm/issue-N-*` / `codex/issue-N-*` PRs) only if they
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
