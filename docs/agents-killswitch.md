# agent kill switch

A global freeze for the autonomous agent flow (Phase 3.2 of
[`security-implementation-plan.md`](security-implementation-plan.md), control #15).

## how it works

Each agent workflow (`pm-intake`, `pm-followup`, `dev-implement`, `dev-revise`) gates its job on a repo
**Actions variable** `AGENTS_FREEZE`:

```yaml
if: |
  github.repository == 'MishaMgla/opencraft1' &&
  vars.AGENTS_FREEZE != 'true' &&
  ...
```

When `AGENTS_FREEZE == 'true'`, those jobs are skipped — **no agent (codex) runs, no comment, no merge.**
Unset/anything-else → agents run normally (fail-safe default).

The protective workflows — `policy-gate` (capability gate), `secret-segmentation`, and `tests` — are
**deliberately not** frozen: they only inspect PRs and must keep running even during a freeze.

## freeze / unfreeze

```bash
# freeze (halts all agents immediately; in-flight jobs finish, new ones don't start)
gh variable set AGENTS_FREEZE --repo MishaMgla/opencraft1 --body true

# unfreeze
gh variable set AGENTS_FREEZE --repo MishaMgla/opencraft1 --body false
# or: gh variable delete AGENTS_FREEZE --repo MishaMgla/opencraft1

# check
gh variable list --repo MishaMgla/opencraft1
```

Setting it needs a token with repo admin / `actions:write`. A repo variable (not a secret) is used so its
state is visible in Settings → Secrets and variables → Actions.

## when to use

- A prompt-injection or abuse incident is suspected.
- A bad merge / runaway loop is in progress.
- Cost spike, or you're mid-migration and want the flow paused.

Pair with alerting (Telegram) once that lands so a freeze is announced.
