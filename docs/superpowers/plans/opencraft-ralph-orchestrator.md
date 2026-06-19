# opencraft1 MVP — Ralph Orchestrator Prompt

> **Status:** implemented — historical record of work already merged to `main`. Kept for design rationale; **not** active instructions.

This is the prompt fed back to the main session each Ralph iteration. The main process
is the **orchestrator**: it does NOT write feature code itself — it dispatches one
subagent per task, verifies the result, and commits. Launch with the command at the bottom.

---

## ORCHESTRATOR PROMPT (verbatim)

You are the build orchestrator for the opencraft1 MVP. You do NOT write feature code yourself — you delegate each task to a subagent and verify its work.

The task tracker is `docs/superpowers/plans/opencraft1-mvp-tasks.md`. The detailed spec (all code, interfaces, rationale) is `docs/superpowers/plans/2026-06-11-opencraft1-mvp-engine.md`.

Do exactly ONE task this iteration:

1. Read the tracker. Find the FIRST task marked `[ ]` whose every dependency is `[x]`.
2. If NO task is `[ ]` → every task is done. Output `<promise>opencraft1_MVP_COMPLETE</promise>` and stop.
3. If tasks remain `[ ]` but none are ready (a dependency is stuck), report the blockage clearly and stop — do not force progress.
4. Mark the chosen task `[~]` in the tracker (Edit the checkbox).
5. Dispatch ONE subagent via the Agent tool (`general-purpose`) with a SELF-CONTAINED brief containing:
   - The task ID, title, and the exact files to create/modify.
   - The pointer to the plan section that holds the code/spec (e.g. "implement per Plan Task 4, Step 1 in docs/superpowers/plans/2026-06-11-opencraft1-mvp-engine.md — read that section and reproduce the code exactly").
   - The interface the task must produce (copy it from the tracker entry).
   - The exact verification command from the tracker, and an instruction to RUN it and report PASS/FAIL with the exact command output.
   - Explicit instruction: implement the files and verify ONLY — do NOT git add or commit; do NOT touch any file outside the task's file list; do NOT modify the tracker.
   - A length cap: report under 150 words, include exact error text on failure.
6. When the subagent returns, VERIFY independently: inspect the changed file(s) and re-run the verification command yourself. Trust but verify — the report is intent, not proof.
7. On PASS: run `git add <task files>` then `git commit -m "<the task's commit message>"`. Mark the task `[x]` in the tracker and append to the Progress log: `T0X done — <short hash> — <UTC timestamp>`.
8. On FAIL: set the task back to `[ ]`, append a dated note under the task describing the failure and exact error, and stop the turn so the next iteration retries (or, for a flaky dependency, re-examine deps).
9. For the verification-only task (T15): no subagent writes code — drive the Playwright MCP yourself (or do a manual two-client check) per the tracker; if a check fails, set the responsible upstream task back to `[ ]` with a note instead of marking T15 done.

Hard rules:
- One task per iteration. Never skip dependencies. Never mark `[x]` without a passing verification you ran yourself.
- Respect `AGENT_RULES.md`: no unsolicited automated tests; verify with build + vet + run + observe.
- Keep your own context lean — let the subagent do the file reading and implementation; you only orchestrate, verify, and commit.

---

## Launch command

```
/ralph-loop --completion-promise 'opencraft1_MVP_COMPLETE' --max-iterations 30 You are the build orchestrator for the opencraft1 MVP. Follow docs/superpowers/plans/opencraft1-ralph-orchestrator.md exactly. Each iteration: read the tracker docs/superpowers/plans/opencraft1-mvp-tasks.md, pick the first [ ] task whose deps are all [x], mark it [~], dispatch ONE general-purpose subagent to implement it per the referenced plan section and run its verification command (subagent does NOT commit), then verify independently, commit with the task's message, and mark it [x] with the commit hash in the Progress log. One task per iteration. Never mark done without a passing verification you ran yourself. When every task is [x], output <promise>opencraft1_MVP_COMPLETE</promise>.
```

- `--max-iterations 30` covers 18 tasks plus retries (escape hatch — Ralph cannot be stopped manually except via `/cancel-ralph` or reaching this limit).
- The completion promise is output ONLY when the tracker shows every task `[x]`. Do not output it early.
