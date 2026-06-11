# agent system — operator setup

One-time setup to make the PM/Dev agents run on `MishaMgla/openCraft`.

## 1. Repository secrets

Add under **Settings → Secrets and variables → Actions**:

- `CLAUDE_CODE_OAUTH_TOKEN` — generate locally with `claude setup-token`
  (uses your Claude subscription; no per-call API billing).
- `AUTO_PAT` — a **fine-grained** personal access token scoped to the
  `openCraft` repo with: Contents = Read/Write, Pull requests = Read/Write,
  Issues = Read/Write. Used for merges that must cascade to the next workflow
  (a `GITHUB_TOKEN` merge does not trigger new workflow runs).

## 2. Self-hosted runner

The agent jobs use `runs-on: [self-hosted]`. Register one runner to this repo:

1. Visit `https://github.com/MishaMgla/openCraft/settings/actions/runners/new`.
2. On the runner machine (the existing VDS can host a second runner in its own
   folder):
   ```bash
   mkdir ~/actions-runner-opencraft && cd ~/actions-runner-opencraft
   # run the download lines shown on the page, then:
   ./config.sh --url https://github.com/MishaMgla/openCraft --token <TOKEN>
   # accept default name + labels
   sudo ./svc.sh install && sudo ./svc.sh start    # or: ./run.sh
   ```
3. Accept default labels (`self-hosted, Linux, X64`). No custom label needed.

`close-issue-on-impl-merge.yml` runs on `ubuntu-latest` (no agent), so it needs
no self-hosted runner.

## 3. Allowlist

Edit `.github/agents-allowlist.txt` — one GitHub username per line — to grant
maintainers the right to steer any issue/PR's agent regardless of who opened it.
