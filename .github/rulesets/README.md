# branch rulesets (config-as-doc)

`main-protection.json` is the intended GitHub ruleset for `main`. It is **not**
auto-applied — a maintainer applies it with an admin token:

```bash
.github/scripts/apply-ruleset.sh
```

Implements Phase 0.3/0.4 of [`../../docs/security-implementation-plan.md`](../../docs/security-implementation-plan.md).

> **plan requirement.** Rulesets / branch protection are **disabled on a free private repo** — GitHub
> returns `403 "Upgrade to GitHub Pro or make this repository public"`. They are free on **public** repos
> (and available on Pro/Team for private). So this ruleset **activates at the moment the repo goes public**,
> which is exactly when its protection is needed; until then it stays config-as-doc and `apply-ruleset.sh`
> will fail with that 403. Enforcement therefore can't be smoke-tested while the repo is free+private.

## what it enforces on `main`

- **PR required** (no direct pushes), **linear history**, **no force-push**, **no branch deletion**.
- **Code-owner review required** (`require_code_owner_review: true`) → paired with
  [`../CODEOWNERS`](../CODEOWNERS), any PR touching a guardrail path (`.github/**`, security docs,
  Dockerfile, dependency manifests) needs the owner's approval and cannot auto-merge. This is the
  Tier-B forcing function (#8, T4).
- **Required status checks: intentionally NONE** (see the deadlock note below). Agent PRs are gated by the
  *inline* `run-gates.sh` + `capability-gate-pr.sh` in `dev-implement` instead.
- **Bypass = Repository admin only** (`bypass_actors: [RepositoryRole admin]`). The human owner can merge
  guardrail PRs (a solo owner can't approve their own PR, so they'd otherwise be locked out of `.github`
  changes). The **bot stays caged**: its merge identity is a repo-scoped GitHub App token, which is *not* an
  admin role, so it cannot bypass — it can only auto-merge non-guardrail Tier-A PRs (0 approvals, no owner).

## deliberate choices / tradeoffs (review before applying)

- **`required_approving_review_count: 0`** — ordinary feature PRs (no owned files) stay auto-mergeable, so
  autonomy is preserved; only owned-file PRs require the code-owner approval. Verify your account sees the
  code-owner requirement bite at count 0; if your org requires ≥1, raise it (and accept that all PRs then
  need an approval).
- **`required_signatures` omitted** — the dev agent commits via plain `git` on the runner, which is not
  GPG-signed; requiring signatures would block the bot's own PRs. Add it once commits are signed (GitHub
  App identity / sigstore).
- **`strict_required_status_checks_policy: false`** — avoids forcing every autonomous PR to rebase on the
  latest `main` before merge (churn under concurrent agent PRs). Flip to `true` for stricter safety once
  the merge cadence is understood.
- **`required_status_checks` removed — DEADLOCK avoidance.** The agents create PRs with `GITHUB_TOKEN`, and
  GitHub does **not** start `pull_request` workflow runs for `GITHUB_TOKEN`-created events. So `tests` and
  `capability-gate` never run on agent PRs → a required check would sit "pending" forever → the bot's
  auto-merge (and the whole cascade) would be **permanently blocked**. Agent PRs are instead gated *inline*
  in `dev-implement` (`run-gates.sh` + `capability-gate-pr.sh`) before the AUTO_PAT merge. **To make
  required checks safe, agent PRs must first be created by an identity that triggers workflows — a GitHub
  App token (not `GITHUB_TOKEN`, and not `AUTO_PAT`, which must not be exposed to the agent).** Re-add the
  `required_status_checks` rule once that lands.

## not applied by automation, by design

Applying a ruleset is a privileged admin action — keeping it a deliberate maintainer step (not a bot step)
is itself part of the threat model: the agent must not be able to relax its own cage.
