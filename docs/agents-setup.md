# agent system — operator setup

One-time setup to make the PM/Dev agents run on `MishaMgla/opencraft1`.

## 1. Repository secrets

Add under **Settings → Secrets and variables → Actions**:

- `AUTO_PAT` — a **fine-grained** personal access token scoped to the
  `opencraft1` repo with: Contents = Read/Write, Pull requests = Read/Write,
  Issues = Read/Write. Used for merges that must cascade to the next workflow
  (a `GITHUB_TOKEN` merge does not trigger new workflow runs).

The agents authenticate to Codex via a ChatGPT subscription stored **on the
runner** (step 2), so no model API key is kept as a repo secret and there is no
per-call API billing.

## 2. Self-hosted runner

The agent jobs use `runs-on: [self-hosted]`. Register one runner to this repo:

1. Visit `https://github.com/MishaMgla/opencraft1/settings/actions/runners/new`.
2. On the runner machine (the existing VDS can host a second runner in its own
   folder):
   ```bash
   mkdir ~/actions-runner-opencraft1 && cd ~/actions-runner-opencraft1
   # run the download lines shown on the page, then:
   ./config.sh --url https://github.com/MishaMgla/opencraft1 --token <TOKEN>
   # accept default name + labels
   sudo ./svc.sh install && sudo ./svc.sh start    # or: ./run.sh
   ```
3. Accept default labels (`self-hosted, Linux, X64`). No custom label needed.

### 2a. Codex CLI (install + authenticate once)

The workflows call `codex exec` directly, so the CLI must be installed and
logged in **as the same OS user the runner service runs as** (its `auth.json`
lives in that user's `$CODEX_HOME`, default `~/.codex`):

```bash
npm install -g @openai/codex      # or: brew install codex
codex login                       # ChatGPT browser sign-in; persists ~/.codex/auth.json
codex login status                # confirm: "Logged in using ChatGPT"
```

`gh` must also be on the runner's PATH (the agents drive `git` + `gh`). Tokens
in `~/.codex/auth.json` auto-refresh on use as long as that directory persists,
so this is a one-time step. To re-auth or rotate, re-run `codex login`.

`close-issue-on-impl-merge.yml` runs on `ubuntu-latest` (no agent), so it needs
no self-hosted runner.

### 2b. Build toolchains (required by the verification gate)

Before merging, the Dev agent runs `.github/scripts/run-gates.sh`, which builds
and tests the project's real suites. It **fails closed**: if the repo declares a
toolchain but the tool is missing on the runner, that is a gate _failure_, not a
skip — so the agent's auto-merge is correctly blocked rather than merging
unverified code. The runner therefore needs every toolchain the repo uses:

- **Go** — matches `go.mod` (CI pins `1.25`; see `.github/workflows/test.yml`).
  Without it, the gate reports _"go.mod present but 'go' is not installed"_ and
  **no Go change can ever auto-merge** — `dev-implement`/`dev-revise` runs end in
  `failure` even when the agent's diff is correct. Install so `go` is on the
  runner service user's PATH (e.g. the official tarball into `/usr/local/go`).
- **Node + npm** — runs the `web/` unit suite (`npm ci && npm test`). Node is
  already needed for the Codex CLI in step 2a, so npm is usually present.

After installing, confirm as the runner's OS user: `go version` and `npm -v`.

> Note: impl PRs are opened by `github-actions[bot]`, so the `pull_request`
> `tests` workflow lands in `action_required` and does not run Go CI on the PR
> itself — the gate above is the agents' only pre-merge Go check, which is why
> the runner must have Go. Hosted Go CI only runs unattended on `push` to `main`.

## 3. Allowlist

Edit `.github/agents-allowlist.txt` — one GitHub username per line — to grant
maintainers the right to steer any issue/PR's agent regardless of who opened it.
