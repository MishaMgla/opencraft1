# self-hosted runner hardening (Phase 1.2)

Phase 1.2 of [`security-implementation-plan.md`](security-implementation-plan.md), controls #6 / T7.

**Why this is host-side.** The agent flow runs on a self-hosted runner because it uses a logged-in **Codex
subscription session** (not a metered API key — see 1.1). After the 1.1 decision, that session is also
present in the *untrusted* PM jobs, so **runner isolation is the only thing protecting it** from a prompt
injection. None of that can be configured from the repo — it lives on the runner host. This doc is the
runbook for the machine owner.

Goal: a single prompt injection in an agent job can neither **persist** (T7) nor **exfiltrate** (T3) the
Codex session or anything else.

Three independent layers; do all three.

---

## 1. Ephemeral registration — one job per runner, then gone

Register the runner with `--ephemeral` so it accepts exactly one job and de-registers:

```bash
# on the runner host, in the actions-runner dir
./config.sh --url https://github.com/MishaMgla/opencraft1 --token <REG_TOKEN> --ephemeral --name oc-eph --labels self-hosted
```

Then re-create it after each job. Either:
- a supervisor loop that re-runs `config.sh --ephemeral` + `run.sh` per job, **fetching a fresh
  registration token each time** (`gh api -X POST repos/MishaMgla/opencraft1/actions/runners/registration-token`); or
- **actions-runner-controller** (ARC) on k8s with `ephemeral: true` — it gives a fresh pod per job out of
  the box (recommended if you already run k8s).

Ephemeral alone does **not** reset the host filesystem — pair it with layer 2.

---

## 2. Disposable filesystem per job — fresh VM/container each run

The runner *process* being ephemeral doesn't wipe the disk, the Docker socket, tool caches, or the Codex
session files. Run each job on a throwaway root:

- **Best: one micro-VM per job** (Firecracker / a fresh cloud VM from a golden image that has codex
  pre-authenticated). Destroy the VM when the job ends. Nothing survives between jobs.
- **Good: rootless container per job** via the runner's container hooks
  (`ACTIONS_RUNNER_CONTAINER_HOOKS`) — each job runs in a fresh container; the host stays clean. Do **not**
  mount the Docker socket into the job (socket = host root).
- The **Codex session must live outside the job's reach**: bake it into the VM image / a host path the job
  container cannot read, not in the workspace or a job-readable env. Treat it like a credential.

No cache shared between jobs (and never between an untrusted PM job and a trusted dev job).

---

## 3. Egress allowlist — even a successful injection can't phone home

Default-deny outbound; allow only what the flow needs. Apply on the host (nftables/iptables) or via an
egress proxy the job is forced through. The authoritative GitHub list comes from the meta API:

```bash
gh api meta --jq '.actions, .api, .web, .packages' 2>/dev/null   # or: curl -s https://api.github.com/meta
```

Allow (HTTPS/443 outbound only; no inbound is needed — runners poll out):

| Purpose | Hosts |
|---|---|
| GitHub core | `github.com`, `api.github.com`, `codeload.github.com`, `objects.githubusercontent.com`, `*.actions.githubusercontent.com`, `pkg.actions.githubusercontent.com` |
| Containers | `ghcr.io`, `*.pkg.github.com` |
| Codex / model | `api.openai.com`, `chatgpt.com`, `auth.openai.com` (the codex subscription endpoints) |
| Node toolchain | `registry.npmjs.org`, `nodejs.org` |
| Go toolchain | `proxy.golang.org`, `sum.golang.org`, `storage.googleapis.com` (Go module mirror) |
| Playwright (e2e) | `playwright.azureedge.net` / `cdn.playwright.dev` |

Caveats: several are CNAME chains that can change — re-resolve from `gh api meta` periodically, prefer the
documented apex/wildcards over hard-coded IPs. Block everything else. This is the layer that turns
"injection exfiltrated the session" into "injection couldn't reach its server."

---

## what stays in the repo (already done / can't be `persist-credentials:false`)

- The read-only guard workflows (`policy-gate`, `secret-segmentation`) run on **GitHub-hosted**
  `ubuntu-latest` with `persist-credentials: false` — they need no host secrets and never push.
- The **agent** jobs (`pm-*`, `dev-*`) **must keep** git credentials — they push branches and open PRs — so
  `persist-credentials: false` is *not* applicable there. Their isolation comes from layers 1–3 above, not
  from dropping credentials. (This is also why the `AUTO_PAT` isolation, plan 0.2 follow-up, belongs with
  this phase.)

## verification

- Start a job that runs `curl -m5 https://example.com` → must fail (egress blocked); `curl https://api.github.com` → ok.
- After a job, confirm the runner de-registered and the workspace/VM is gone.
- Confirm a job container cannot read the Codex session path or the Docker socket.
