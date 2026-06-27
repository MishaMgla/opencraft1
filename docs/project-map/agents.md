# agent system

GitHub-Actions PM + Dev agents that turn issues into merged PRs. Source of truth
for behaviour is the workflow + prompt files under `.github/`. The agents run on
the **Codex CLI** (`codex exec`, model `gpt-5.5`) on a self-hosted runner that
is pre-authenticated with a ChatGPT subscription — see `docs/agents-setup.md`.

## flow

1. **Issue opened** → `pm-intake.yml` runs the PM agent. Its self-audit
   (`self-audit.md`) picks one of three modes: **redirect** (out of product
   scope — see below), **question** (one clarifying question), or **draft** (write
   a spec to `docs/specs/<date>-issue-<N>-<slug>.md` on branch
   `pm/issue-<N>-<slug>`, open a spec PR, auto-merge with `AUTO_PAT`, cascading to
   dev-implement).
2. **Issue comment** → `pm-followup.yml` runs the PM agent to answer, draft
   (`/ready`), or revise the open spec.
3. **Spec PR merged** (or `/approved` on the issue) → `dev-implement.yml` runs
   the Dev agent: implement on `codex/issue-<N>-<slug>`, run
   `run-gates.sh`, open an impl PR, auto-merge on green (`AUTO_PAT`).
4. **PR comment** → `dev-revise.yml`: revise the code, or `/merge`·`/approved`
   to merge.
5. **Impl PR merged** → `close-issue-on-impl-merge.yml` closes the issue.

Graphics specs can include `## Asset Generation` blocks consumed by the Dev
agent. For character sprites in the isometric game, the four generated slots are
still stored under the PixelLab/API names `south`, `north`, `east`, and `west`,
but specs and reviews should treat them as diagonal visual facings:
`north` = `north-east`, `east` = `south-east`, `south` = `south-west`, and
`west` = `north-west`. Character art should not bake in a ground shadow; the
renderer owns grounding.

## permission model

Comment-driven agents are gated by `.github/scripts/authorize.sh`: a commenter
may steer issue N (and its `pm/issue-N-*` / `codex/issue-N-*` PRs) only if they
authored issue N or appear in `.github/agents-allowlist.txt`. Opening an issue is
open to any collaborator (the repo is private). Spec-merge → dev-implement is
gated by write-access-to-merge, not the author check.

## product-scope guardrail

Distinct from the security classifier (spam / abuse / injection / malicious code,
which closes/locks). This is a **soft product** guardrail: issues should improve
the game, not start over. If an ask is teardown/pivot (rebuild from scratch, wipe
the codebase, swap to a different project), the PM enters **redirect mode** — it
posts one kind comment that affirms the interest, explains opencraft1 grows
additively on its engine, and proposes a concrete game-improving alternative. It
never closes, locks, or labels, and never drafts a spec for the teardown ask. The
rule lives in `AGENT_RULES.md` ("product scope"); the logic is in `self-audit.md`
+ `pm-system.md` (redirect mode), with a backstop check in `pm-draft-spec.md`.

## escape hatches

- `pm:skip` label on an issue → PM agent ignores it.
- `//` prefix or `<!-- discuss -->` in a PR comment → no Dev agent (free chat).
- `hold` / `needs-human` label → suppresses auto-merge; routes to a human.

## files

Workflows: `.github/workflows/{pm-intake,pm-followup,dev-implement,dev-revise,close-issue-on-impl-merge}.yml`.
Scripts: `.github/scripts/{authorize,run-gates,auto-merge-spec}.sh`.
Prompts: `.github/prompts/*.md`. Allowlist: `.github/agents-allowlist.txt`.
Operator setup: `docs/agents-setup.md`.
