# agent system — operator setup

One-time setup to make the PM/Dev agents run on `MishaMgla/opencraft1`.

## 1. Repository secrets

Add under **Settings → Secrets and variables → Actions**:

- `AUTO_PAT` — a **fine-grained** personal access token scoped to the
  `opencraft1` repo with: Contents = Read/Write, Pull requests = Read/Write,
  Issues = Read/Write, **Variables = Read/Write**. Used for merges that must
  cascade to the next workflow (a `GITHUB_TOKEN` merge does not trigger new
  workflow runs), and for the quota-recovery flow to toggle the
  `AGENTS_QUOTA_FREEZE` Actions variable (`GITHUB_TOKEN` cannot manage
  variables). See [`agents-quota-recovery.md`](agents-quota-recovery.md).

- `PIXELLAB_API_KEY` — PixelLab API token (from account settings at
  [pixellab.ai](https://pixellab.ai)). Set as a repo Actions secret. Used only
  by the Dev agent during `dev-implement` to generate committed pixel art via
  `web/tools/gen-asset.mjs`. Absent ⇒ asset issues fail the gen step (no
  silent skip); non-asset issues are unaffected.

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

### 2b. Go toolchain (required for the verification gate)

`run-gates.sh` **fails closed** when `go.mod` is present but `go` is not on the
runner's PATH (`go.mod present but 'go' is not installed … cannot verify`), so any
impl PR touching `internal/**.go` never auto-merges until Go is installed. Install
the version in `go.mod` (currently `go 1.25.0`; a newer 1.x also works) and make it
reachable from the runner service's PATH — the simplest is a symlink into
`/usr/local/bin` (already on the systemd service PATH, same as `node`):

```bash
GO_VER=1.25.0
curl -fsSL "https://go.dev/dl/go${GO_VER}.linux-amd64.tar.gz" -o /tmp/go.tgz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf /tmp/go.tgz
sudo ln -sf /usr/local/go/bin/go /usr/local/bin/go
sudo ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
# verify under the runner's PATH (no service restart needed — resolved per-command):
env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sh -c 'go version'
```

## 3. Allowlist

Edit `.github/agents-allowlist.txt` — one GitHub username per line — to grant
maintainers the right to steer any issue/PR's agent regardless of who opened it.
