# Codex Quota-Block Detection & Auto-Recovery — Design

**Date:** 2026-06-20
**Status:** Approved (pending spec review)
**Area:** agent flow / GitHub Actions PM-Dev pipeline

## Problem

The agent flow is four event-triggered GitHub Actions workflows, each shelling
out to `codex exec`:

| Stage | Workflow | Native trigger |
|---|---|---|
| PM intake | `.github/workflows/pm-intake.yml` | issue opened |
| PM follow-up | `.github/workflows/pm-followup.yml` | comment on an issue |
| Dev implement | `.github/workflows/dev-implement.yml` | spec PR merged / `/approved` comment |
| Dev revise | `.github/workflows/dev-revise.yml` | comment on a PR |

When the Codex subscription's usage is exhausted, `codex exec` fails. The step
posts a generic failure comment, the job ends red, and **the triggering event
will not re-fire** — so the work on that issue/PR is stranded. There is no
mechanism to resume it once quota returns.

We want: detect a quota block (vs a genuine agent failure), pause the pipeline,
and automatically resume the stranded work once quota is available again.

## Research findings (Codex quota signal)

- Quota exhaustion surfaces as an HTTP **429 with a structured
  `usage_limit_reached` error** — rendered as *"You've hit your usage limit…
  try again at [date/time]"*. After internal retries it ends with
  *"exceeded retry limit, last status: 429 Too Many Requests"*.
- `codex exec` **exits non-zero on any failure**; progress (incl. these errors)
  streams to **stderr**, the final answer to stdout.
- `--json` mode emits a JSONL event stream including a structured error event —
  a more robust detection channel than free-text grep.
- The error embeds a reset time. Plus is a **5-hour rolling window** with weekly
  caps; the window length is not fixed, so recovery should poll rather than
  assume a single fixed delay.

**Conclusion:** quota blocks are reliably distinguishable from genuine failures
by inspecting Codex output for `usage_limit_reached` / "usage limit" /
the 429-retry-exhausted string (preferring the `--json` error event).

## Decisions (from brainstorming)

1. **Recovery trigger:** scheduled cron, auto-resume (no human in the loop).
2. **Auto-freeze:** on detection, set a **dedicated** `AGENTS_QUOTA_FREEZE=true`
   variable; recovery clears it. (Implementation note: this is intentionally NOT
   the manual `AGENTS_FREEZE` kill-switch — the recovery cron clears the quota
   freeze automatically, and must never be able to lift an operator's incident
   freeze. Workflows gate on both; the manual switch also blocks the resume path.)
3. **Refactor scope:** extract each stage's codex-running core into a
   dispatchable path so the recovery job can re-run it directly. Implemented as
   a **dual-trigger refactor** (native event + `workflow_dispatch`) per
   workflow rather than one monolithic reusable workflow — keeps each stage's
   distinct gating self-contained.
4. **Cron cadence:** every 30 min (bounds wasted wait to ≤30 min against the
   5-hour window; per-tick cost is one cheap read-only probe call).

## Stage / resume map

| Stage | Resume needs |
|---|---|
| PM intake | issue # |
| PM follow-up | issue # + **triggering comment body** |
| Dev implement | issue # |
| Dev revise | PR # + **triggering comment body** |

The two comment-driven stages must preserve the comment that triggered them, not
just the issue/PR number.

## Components

### 1. Quota-aware Codex wrapper — `.github/scripts/run-codex.sh`

Every `codex exec` invocation across the four workflows routes through this
instead of inlining the command. Responsibilities:

- Run `codex exec` (passing through model / sandbox / reasoning args), teeing
  combined stdout+stderr to a log file.
- On non-zero exit, classify the log:
  - **Recoverable backend block** if it matches any of `usage_limit_reached`,
    `You've hit your usage limit`, `exceeded retry limit, last status: 429`
    (and, when `--json` is enabled, the structured `usage_limit_reached` error
    event — preferred), **or** `Selected model is at capacity` (a transient
    model-availability error that, like a quota block, clears on its own). →
    emit step output `quota_blocked=true` and **exit 0**, so the caller
    marks-and-pauses instead of tripping the generic failure path.
  - **Genuine failure** otherwise → exit non-zero → existing failure-comment
    path fires unchanged. No resume marker is written (never auto-retry broken
    code).
- On success → `quota_blocked=false`.

Interface: stdin/args mirror the current `codex exec` call sites; outputs
`quota_blocked` via `$GITHUB_OUTPUT`. The probe (component 4) reuses the same
classifier.

### 2. Mark + freeze (on quota block)

When a workflow sees `quota_blocked=true`, it:

- Writes a hidden machine-readable marker comment on the issue. The JSON carries
  exactly the fields that stage's dispatch entrypoint needs (see stage/resume
  map): issue-only stages omit `comment_body`/`pr`. Examples:
  - `<!-- agents:resume v1 {"stage":"dev-implement","issue":42} -->`
  - `<!-- agents:resume v1 {"stage":"dev-revise","pr":51,"comment_body":"…"} -->`
- Adds an `agents:quota-blocked` label (human visibility / filtering).
- Sets `AGENTS_QUOTA_FREEZE=true` via `gh variable set`, instantly pausing all four
  event-triggered workflows so nothing else burns into the wall (the manual `AGENTS_FREEZE` kill switch is left untouched).

### 3. Dispatchable resume entrypoint (the extracted core)

Each of the four workflows gains a second trigger — `workflow_dispatch` with
`issue` / `pr` / `comment_body` inputs — and its "resolve context" step is
refactored to read from **either** the event payload or the dispatch inputs.
The codex-running core becomes reachable by both the native event and a direct
dispatch.

- The `workflow_dispatch` path is **not** gated by `AGENTS_QUOTA_FREEZE`, so recovery
  can re-run stages while freeze is still being lifted.
- Existing per-stage gating (pm-intake's abuse/security gates, dev-implement's
  capability gate + auto-merge, the duplicate-PR guard) is preserved as-is.

### 4. Recovery cron — `.github/workflows/agents-recover.yml`

- `on: schedule` (~every 30 min) + `workflow_dispatch` (manual kick).
- Early-exits unless `AGENTS_QUOTA_FREEZE == 'true'` (and only while manual `AGENTS_FREEZE` is off) — silent during normal operation.
- **Probe:** cheapest possible `codex exec --sandbox read-only "reply OK"`,
  classified via the same wrapper. Still blocked → exit, wait for next tick.
  Succeeds → quota is back.
- On recovery:
  1. Scan open issues/PRs for `agents:resume` markers.
  2. `gh workflow run <stage>` for each stranded item with its recorded inputs.
  3. Remove the marker comment + `agents:quota-blocked` label per item, only
     after a successful dispatch.
  4. Finally clear `AGENTS_QUOTA_FREEZE` (re-enable normal event triggers).

## Data flow

```
issue/PR event ──> stage workflow ──> run-codex.sh
                                        │
                  quota_blocked=true ───┼──> write resume marker + label
                                        │     set AGENTS_QUOTA_FREEZE=true  ──> pipeline paused
                  genuine failure ──────┴──> existing failure comment (no marker)

cron (30m) ──> AGENTS_QUOTA_FREEZE==true? ──no──> exit
                       │ yes
                       ├─ probe (cheap codex) still blocked? ──yes──> exit
                       │                                       no
                       ├─ for each resume marker: gh workflow run <stage>(inputs)
                       ├─ remove marker + label
                       └─ clear AGENTS_QUOTA_FREEZE ──> normal triggers resume
```

## Error handling & edge cases

- **No retry storms:** only quota blocks get a marker; genuine failures don't.
- **No duplicate PRs:** `dev-implement` already guards on an existing impl PR;
  resume relies on that guard. Markers removed only after successful dispatch.
- **Partial work:** `codex exec` commits atomically at the end, so a
  quota-killed run almost never pushed a branch — clean re-run is safe. Treated
  as a known limitation, not handled.
- **5h vs weekly windows:** the cron polls regardless of window length; recovers
  whenever the probe passes. Parsing the embedded reset-time for smarter
  scheduling is deliberately **out of v1** (YAGNI).
- **Probe cost:** one minimal read-only call per tick while blocked; negligible.
- **Unfreeze ordering:** dispatch stranded stages (dispatch path ignores freeze),
  then clear `AGENTS_QUOTA_FREEZE` last, so event triggers don't re-fire mid-recovery.

## Setup prerequisite

Toggling `AGENTS_QUOTA_FREEZE` requires a token with **`variables: write`** scope.
Verify the existing `AUTO_PAT` has it; otherwise grant it or add a dedicated
`FREEZE_PAT` secret. This is a deployment prerequisite, not a code change.

## Out of scope (v1)

- Parsing Codex's reset-time to schedule a precise wake-up (cron polling covers it).
- Recovering partial/uncommitted agent work.
- Manual `/resume` override command (cron auto-resume is sufficient for v1).

## Testing

- `run-codex.sh` classifier: unit-test against captured sample logs for each
  quota signature and a genuine-failure log (fixture-driven; no live Codex).
- Dispatch path: `workflow_dispatch` each refactored workflow manually with
  sample inputs and confirm it resolves context identically to the event path.
- Recovery cron: `workflow_dispatch` with `AGENTS_QUOTA_FREEZE=true` and a seeded
  marker; confirm probe → dispatch → marker cleanup → unfreeze.
```
