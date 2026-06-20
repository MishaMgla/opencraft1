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
  (
    github.event_name == 'workflow_dispatch' ||           # quota-recovery resume
    ( vars.AGENTS_QUOTA_FREEZE != 'true' && ... )          # normal event triggers
  )
```

When `AGENTS_FREEZE == 'true'`, those jobs are skipped — **no agent (codex) runs, no comment, no merge** —
including the quota-recovery resume path. Unset/anything-else → agents run normally (fail-safe default).

### `AGENTS_FREEZE` vs `AGENTS_QUOTA_FREEZE`

There are **two** freeze variables, and they are not interchangeable:

- **`AGENTS_FREEZE`** — the **manual** operator kill switch (this doc). Highest priority; blocks everything,
  including resume. **Only a human sets or clears it.** The automated recovery flow never touches it.
- **`AGENTS_QUOTA_FREEZE`** — set automatically when a Codex run hits the subscription usage limit, and
  cleared automatically by `agents-recover.yml` once quota returns. It pauses normal event triggers but is
  bypassed by the recovery `workflow_dispatch` resume. See
  [`agents-quota-recovery.md`](agents-quota-recovery.md).

Keeping them separate means the recovery cron can never override an operator's incident freeze.

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
