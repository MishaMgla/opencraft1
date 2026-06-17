# security implementation plan

rollout of [`security-architecture.md`](security-architecture.md), in dependency order. each item lists
**what** to change, **where**, and a **done-check**. one PR per item where practical.

> **gate:** the repo must **not** be flipped to public until **Phase 0 is complete and verified**. Phase 0
> closes the exploits that exist the instant an untrusted user can open an issue (T1–T4).

current stack the plan edits: self-hosted runner; `codex exec --model gpt-5.5` for PM + dev; workflows
`pm-intake.yml`, `pm-followup.yml`, `dev-implement.yml`, `dev-revise.yml`, `close-issue-on-impl-merge.yml`;
gate `.github/scripts/authorize.sh` + `.github/agents-allowlist.txt`; spec branches `pm/issue-*`, impl
branches `codex/issue-*`.

---

## Phase 0 — blocks going public (must-have)

**0.1 — kill issue-author self-authorization** *(T1)*
- where: `.github/scripts/authorize.sh`, all four agent workflows.
- change: remove the `OWNER==ACTOR` branch as a privilege grant. authorization to advance to dev =
  allowlist OR API permission `∈ {admin, write}`, checked **at execution time** for every privileged
  command (`/approved`, `/merge`). conversation (PM) stays open to anyone but never escalates privilege.
- done-check: a throwaway non-collaborator account commenting `/approved` on its own issue does **not**
  trigger `dev-implement`; an allowlisted/write user still does.

**0.2 — secret segmentation** *(T3)*
- finding (audited): prod-deploy secrets are **already segmented** — `VERCEL_*` live only in
  `deploy-client.yml` (a standalone `push`-triggered job); **no agent workflow references Vercel / Supabase
  / Railway secrets**. The only prod-grade credential co-resident with agent execution is **`AUTO_PAT`** (a
  real-user PAT used so the merge cascades to downstream workflows), present in all four agent workflows.
- shipped: `.github/scripts/check-secret-segmentation.sh` + `.github/workflows/secret-segmentation.yml` —
  a deterministic guard that **fails CI if an agent workflow gains a prod secret**, locking in the
  invariant. It warns (does not fail) on the `AUTO_PAT` exception. Verified: current tree passes; an
  injected `secrets.SUPABASE_*` fails it.
- follow-up (delicate — do **with** Phase 1.2, with testing, not blind): isolate `AUTO_PAT` into a no-agent
  merge job/workflow so the privileged PAT never co-resides with untrusted-input agent execution. Coupled
  to ephemeral runners (1.2), since a persistent runner is the real exfil window. Also add explicit
  least-privilege per-job `permissions:` and drop unused `id-token: write`.
- done-check: guard green on every PR; (follow-up) `grep` shows no `AUTO_PAT` in any agent-execution job.

**0.3 — branch-protection ruleset on `main`** *(T4, wall)*
- where: GitHub repo ruleset (config-as-doc; record the intended ruleset in this repo).
- change: no direct push; PR required; required status checks incl. the capability gate (0.5); linear
  history; no force-push; **no bot/admin/Actions bypass**; signed/bot-identity commits.
- done-check: a direct push to `main` is rejected; a PR without passing checks cannot merge; bot cannot
  bypass.

**0.4 — CODEOWNERS guardrail denylist + least-privilege tokens** *(T4, #8/#9)*
- where: `.github/CODEOWNERS`; ruleset; all workflow `permissions:` blocks.
- change: require **code-owner review** on guardrail paths (`.github/**`, agent prompts, `authorize.sh`,
  allowlist, ruleset/env config, `*deploy*`/`*secret*`/auth/CORS, dep manifests/lockfiles); protect the
  ownership files themselves. remove `checks:`/`statuses: write` from agent jobs; pin expected check
  identity.
- done-check: an agent PR touching `.github/workflows/**` is blocked pending human review and cannot
  automerge.

**0.5 — capability diff-gate (KEYSTONE)** *(#3/#4)*
- where: `.github/scripts/capability-gate.sh` + `.github/workflows/policy-gate.yml`.
- change: on every PR, classify the *diff's* capabilities (path denylist + content signals: deps, outbound
  network, dynamic exec, secret-like identifiers, external URLs, diff size). **default-deny ambiguity** →
  Tier B fails the check; Tier A passes. Registered in the ruleset `required_status_checks` as
  `capability-gate`. Runs on the untrusted `pull_request` event (read-only, no secrets).
- status: **classifier + check shipped** (v1, heuristic). done-check met — verified: docs-only / ordinary
  feature / `author`-path → Tier A (pass); new dependency / `fetch(process.env.SECRET)` / workflow edit /
  external URL / >600-line diff → Tier B (fail).
- follow-up (not in this step): (a) wire the existing automerge paths (`auto-merge-spec.sh`,
  dev-implement) to refuse Tier B; (b) harden with `gitleaks` + `semgrep` to catch what regex misses
  (Layer #6: auth-in-app-code, RLS, symlinks).

---

## Phase 1 — plane split & runner hardening

**1.1 — Codex subscription everywhere + model tiering** *(#5)* — owner decision (2026-06): **no metered API
key**; keep the Codex subscription for all agents and economize by model tier.
- shipped: PM (`pm-intake`, `pm-followup`) and the future security agent → **`gpt-5.4`**; dev
  (`dev-implement`, `dev-revise`) stays **`gpt-5.5`**.
- consequence: the subscription session is now present in the untrusted PM/security jobs, so it is a
  high-value credential there. Its sole protection is **runner isolation (1.2)** — ephemeral + egress
  allowlist — so 1.2 is now load-bearing, not optional.
- done-check: PM runs on `gpt-5.4`, dev on `gpt-5.5`; (after 1.2) an injected PM prompt cannot persist or
  exfiltrate the session.

**1.2 — disposable, egress-restricted runners** *(#6, T7)*
- change: one **disposable VM per job** (not just `--ephemeral` process); egress allowlist (enumerate real
  GitHub/registry endpoints); `actions/checkout` `persist-credentials: false` on untrusted jobs; **no cache
  shared between untrusted and trusted jobs**.
- done-check: a job cannot reach an arbitrary external host; VM is destroyed post-job; no cross-plane cache.

**1.3 — security agent → structured verdict + deterministic dispatcher** *(#12/#14)*
- change: security agent emits `{verdict∈enum, confidence, reason, sensitive_paths[]}` only; a **code**
  dispatcher maps enum→action (label/close/lock). agent has **no write capability**. PRD/verdict carry
  taint + provenance (quoted source refs).
- done-check: agent output that says "close all issues" does nothing unless the enum maps to it; dispatcher
  is the only writer.

---

## Phase 2 — tiering & deploy

**2.1 — capability Tier A/B classifier wired to merge** *(#4)*
- shipped: `dev-implement.yml` runs `.github/scripts/capability-gate-pr.sh` **inline** before "Auto-merge
  on green" (agent PRs open with `GITHUB_TOKEN`, which does NOT trigger the `pull_request` policy-gate, so
  the gate must run in-job like `run-gates.sh`). Tier A → auto-merge; Tier B → `needs-human` label + comment,
  **no auto-merge** (fail-closed: empty/error tier also holds).
- deliberately NOT gated: the markdown **spec-PR** auto-merge (`auto-merge-spec.sh`) — PRDs are prose and
  trip content signals (the security doc itself classifies Tier B), and they carry no executable risk;
  gating them would freeze the cascade. The human `/merge` path (`dev-revise`) is left as-is (a write-access
  maintainer is already the human in the loop).
- follow-up: add a `docs/**` / prose exemption to the content signals so docs PRs aren't needlessly Tier B;
  optionally annotate (not block) `dev-revise`.
- done-check: an impl PR with a clean diff auto-merges; one adding a dep / outbound call / secret ref gets
  `needs-human` and is not auto-merged. Classifier verified on real commit ranges.

**2.2 — decouple deploy, Environment secrets, human gate first** *(#10)* — owner decision (2026-06): **no
OIDC**; deploy secrets live in a GitHub Environment.
- where: new `deploy.yml` (or keep `deploy-client.yml`) bound to a protected GitHub **Environment**.
- change: deploy separate from merge; deploy secrets stored as **Environment secrets**, exposed **only** to
  the deploy job that references that environment; environment protection with a **human approval gate
  initially** (relax to wait-timer / branch-restriction once the capability gate is proven). OIDC remains a
  future nice-to-have, not required.
- done-check: a merge to `main` does not auto-deploy; deploy requires the environment gate; no agent job
  can read the Environment secrets.

---

## Phase 3 — abuse / PM controls & observability

**3.1 — PM sprawl & abuse controls** *(#11)*
- change: bounded rounds → `needs-human`; structured PRD-complete checklist gate; dedupe; per-author +
  global rate limits; cost circuit-breaker (daily metered-spend cap → freeze + alert); third-party comments
  gated on write-permission; metered key treated as burnable (caps, rotation).
- done-check: an issue can't loop forever; a duplicate is linked+closed; spend cap trips the freeze.

**3.2 — observability, kill switch, alerts, new-account friction** *(#13/#15/#16)*
- change: Langfuse tracing with redaction + retention + **no tracing of secret jobs**; `agents:freeze`
  kill switch checked first by every workflow; Telegram alerts on block/policy-fail/Tier-B/merge/deploy/
  cost-breach; new/zero-rep accounts → discussion-only until trust accrues.
- done-check: setting `agents:freeze` halts all agent workflows; traces contain no secrets; a brand-new
  account's issue does not auto-advance to dev.

---

## sequencing notes

- 0.5 (keystone) and 0.3/0.4 (ruleset) are mutually reinforcing — land them together; a gate that the bot
  can bypass is worthless.
- Phase 1.1 depends on 0.2 (secret segmentation) being in place so the metered key is scoped from day one.
- treat the capability taxonomy (0.5) as an owned, versioned artifact; review it whenever a new attack class
  appears. it is the thing attackers will probe.
