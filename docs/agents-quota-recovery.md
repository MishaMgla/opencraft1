# agent quota recovery

Automatic detection and recovery when the Codex subscription's usage quota is
exhausted mid-flow, so stranded work resumes on its own once quota returns.

Design spec: [`superpowers/specs/2026-06-20-codex-quota-recovery-design.md`](superpowers/specs/2026-06-20-codex-quota-recovery-design.md).

## the problem

The four agent workflows (`pm-intake`, `pm-followup`, `dev-implement`,
`dev-revise`) are event-triggered and each shell out to `codex exec`. When the
subscription quota is exhausted, `codex exec` fails — and the triggering event
(issue opened, PR merged, `/approved` comment) does **not** re-fire. Without
recovery, that issue/PR is stranded.

## how it works

1. **Detect.** Every agent run goes through
   [`.github/scripts/run-codex.sh`](../.github/scripts/run-codex.sh), which runs
   `codex exec`, captures the output, and on failure classifies it via
   [`codex-quota-classify.sh`](../.github/scripts/codex-quota-classify.sh)
   (matches `usage_limit_reached` / "usage limit" / the 429-retry-exhausted
   string). A quota block is reported as `quota_blocked=true` (step exits 0); any
   other failure passes through unchanged.

2. **Mark + freeze.** On a quota block the workflow runs
   [`mark-quota-blocked.sh`](../.github/scripts/mark-quota-blocked.sh), which
   writes a hidden resume marker comment on the issue/PR, adds the
   `agents:quota-blocked` label, and sets `AGENTS_QUOTA_FREEZE=true` to pause all
   normal triggers. The marker JSON carries the stage and the inputs needed to
   re-run it (e.g. `{"stage":"dev-revise","pr":51,"comment_body":"…"}`).

3. **Probe + resume.** [`agents-recover.yml`](../.github/workflows/agents-recover.yml)
   runs every ~30 min. While quota-frozen (and only while the manual
   `AGENTS_FREEZE` is **off**) it makes one cheap read-only Codex call. If still
   blocked it waits for the next tick. Once it succeeds,
   [`recover-dispatch.sh`](../.github/scripts/recover-dispatch.sh) re-dispatches
   each labeled item to its workflow's `workflow_dispatch` resume entrypoint with
   the recorded inputs, clears the label, and finally clears
   `AGENTS_QUOTA_FREEZE`.

The resume entrypoint (`workflow_dispatch`) bypasses `AGENTS_QUOTA_FREEZE` but
still respects the manual `AGENTS_FREEZE` kill switch — see
[`agents-killswitch.md`](agents-killswitch.md).

## prerequisites

- **`AUTO_PAT` must include `Variables: Read/Write`** — `GITHUB_TOKEN` cannot
  manage Actions variables. It is wired in as `FREEZE_TOKEN`. Without it, the
  freeze/unfreeze steps fail loudly.
- **The workflows must be on the default branch (`main`).** `gh workflow run`
  (used by recovery) only dispatches workflows present on the default branch, so
  recovery can only resume stages once this change is merged.
- The recovery job runs on the **self-hosted** runner (it needs `codex` for the
  probe).

## operating it

```bash
# see current freeze state (both variables)
gh variable list --repo MishaMgla/opencraft1

# force a recovery attempt now (instead of waiting for the cron)
gh workflow run agents-recover.yml --repo MishaMgla/opencraft1

# manually clear the quota freeze (rarely needed; recovery does this)
gh variable set AGENTS_QUOTA_FREEZE --repo MishaMgla/opencraft1 --body false

# list everything currently stranded by a quota block
gh issue list --repo MishaMgla/opencraft1 --label agents:quota-blocked --state open
gh pr   list --repo MishaMgla/opencraft1 --label agents:quota-blocked --state open
```

## known limitations (v1)

- A quota block mid-`codex exec` loses uncommitted work; resume re-runs the stage
  from scratch. Codex commits atomically at the end, so this is rare.
- Recovery polls on a fixed 30-min cadence rather than parsing Codex's reset time.
- If a marker comment is deleted but the label remains, that item is logged and
  left labeled rather than resumed.
