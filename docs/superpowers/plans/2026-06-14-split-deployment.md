# Split Deployment (Vercel client / Railway server) Implementation Plan

> **Status:** implemented — historical record of work already merged to `main`. Kept for design rationale; **not** active instructions.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the opencraft1 repo deployable as two independent halves — the static client on Vercel and the Go engine on Railway — wired across origins by a runtime `/config.json` fetch, an env-gated WS origin allowlist, and `PORT`/`/healthz` for the host.

**Architecture:** The Go engine stays a single stateful process; this is a deployment split, not horizontal scaling. The client fetches `/config.json` (a Vercel function returning `$WS_URL`) to learn the `wss://` engine URL, falling back to same-origin so local single-process dev is unchanged. The engine reads `PORT`, exposes `/healthz`, and restricts WS origins via `ALLOWED_ORIGINS` (allow-all when unset, for dev).

**Tech Stack:** Go 1.23 (`coder/websocket`), vanilla ES modules (no bundler), Vercel (static + Node serverless function), Railway (Dockerfile build).

> **Testing note (repo rule):** `AGENT_RULES.md` forbids unsolicited automated tests. This plan adds **no** new unit/e2e tests. Each task verifies via `go build`/`go vet`/`go test ./...` (existing suite), `node --check`, and a manual curl/socket check. The existing Playwright e2e must keep passing — it exercises the same-origin fallback path and proves we didn't break local wiring.

---

## File Structure

**Server (Go):**
- `cmd/server/main.go` — modify: listen on `:$PORT` (default 8080).
- `internal/server/server.go` — modify: add `/healthz`, env-gated origin allowlist, conditional static serving.

**Client (`web/`):**
- `web/src/config.js` — create: `resolveWsUrl()` (fetch `/config.json`, fall back to same-origin).
- `web/src/main.js` — modify: import + use `resolveWsUrl()` instead of the hardcoded URL.
- `web/api/config.js` — create: Vercel function returning `{ wsUrl: process.env.WS_URL }`.
- `web/vercel.json` — create: rewrite `/config.json` → `/api/config`.

**Deploy config (repo root):**
- `Dockerfile` — create: multi-stage Go build, no client assets.
- `railway.json` — create: Dockerfile builder + `/healthz` healthcheck.
- `.env.example` — create: document `PORT`, `ALLOWED_ORIGINS`, `WS_URL`.

**Docs:**
- `docs/project-map/server.md`, `docs/project-map/client.md` — modify.
- `AGENT_RULES.md` — modify: deploy commands + env table.
- `docs/deploy.md` — create: deploy runbook.
- `docs/project-map/README.md` — modify: changelog + task→doc row.

---

## Task 1: Engine reads PORT from env

**Files:**
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Replace the hardcoded `:8080` with a `PORT`-driven address**

In `cmd/server/main.go`, replace this block:

```go
	httpSrv := &http.Server{Addr: ":8080", Handler: server.New(sim).Handler()}
	go func() {
		log.Println("listening on :8080")
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
```

with:

```go
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port

	httpSrv := &http.Server{Addr: addr, Handler: server.New(sim).Handler()}
	go func() {
		log.Printf("listening on %s", addr)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
```

(`os` is already imported in this file — no import change needed.)

- [ ] **Step 2: Build and vet**

Run: `go build ./... && go vet ./...`
Expected: no output, exit 0.

- [ ] **Step 3: Verify PORT is honored**

Run: `PORT=9090 go run ./cmd/server` in one shell; in another run `curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:9090/`
Expected: `200` (static index served). Stop the server (Ctrl-C).

- [ ] **Step 4: Commit**

```bash
git add cmd/server/main.go
git commit -m "feat(server): listen on \$PORT (default 8080) for PaaS hosting"
```

---

## Task 2: Engine health endpoint, origin allowlist, conditional static

**Files:**
- Modify: `internal/server/server.go`

- [ ] **Step 1: Add `os` and `strings` imports**

In `internal/server/server.go`, change the import block from:

```go
import (
	"context"
	"log"
	"net/http"

	"github.com/coder/websocket"

	"opencraft1/internal/wire"
	"opencraft1/internal/world"
)
```

to:

```go
import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/coder/websocket"

	"opencraft1/internal/wire"
	"opencraft1/internal/world"
)
```

- [ ] **Step 2: Store precomputed accept options on the Server and add a builder**

Replace:

```go
type Server struct {
	sim *world.Sim
}

func New(sim *world.Sim) *Server { return &Server{sim: sim} }
```

with:

```go
type Server struct {
	sim        *world.Sim
	acceptOpts *websocket.AcceptOptions
}

func New(sim *world.Sim) *Server {
	return &Server{sim: sim, acceptOpts: acceptOptions()}
}

// acceptOptions builds the WebSocket accept policy from ALLOWED_ORIGINS.
// When set (comma-separated host patterns, e.g. "opencraft1.vercel.app,*.vercel.app"),
// only those origins may open a socket. When empty — the local dev case where the
// engine serves the client itself — all origins are allowed.
func acceptOptions() *websocket.AcceptOptions {
	raw := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	if raw == "" {
		return &websocket.AcceptOptions{InsecureSkipVerify: true}
	}
	var patterns []string
	for _, p := range strings.Split(raw, ",") {
		if p = strings.TrimSpace(p); p != "" {
			patterns = append(patterns, p)
		}
	}
	return &websocket.AcceptOptions{OriginPatterns: patterns}
}
```

- [ ] **Step 3: Add `/healthz` and make static serving conditional**

Replace:

```go
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWS)
	mux.Handle("/", http.FileServer(http.Dir("web")))
	return mux
}
```

with:

```go
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/ws", s.handleWS)
	// Serve the static client only when web/ is present (local dev). The Railway
	// engine image carries no client assets — the client is served from Vercel —
	// so this is skipped there and "/" 404s harmlessly.
	if _, err := os.Stat("web"); err == nil {
		mux.Handle("/", http.FileServer(http.Dir("web")))
	}
	return mux
}
```

- [ ] **Step 4: Use the precomputed options in the WS handler**

In `handleWS`, replace:

```go
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// MVP/local dev: allow any origin. Tighten with OriginPatterns for prod.
		InsecureSkipVerify: true,
	})
```

with:

```go
	c, err := websocket.Accept(w, r, s.acceptOpts)
```

- [ ] **Step 5: Build, vet, and run the existing test suite**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: all packages `ok`, exit 0. (No engine-logic changed, so `wire`/`world`/`server` tests stay green.)

- [ ] **Step 6: Manual check — healthz + dev allow-all still works**

Run: `go run ./cmd/server` in one shell. In another:
- `curl -sS http://localhost:8080/healthz` → `ok`
- `curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8080/` → `200`

Stop the server.

- [ ] **Step 7: Manual check — allowlist rejects a foreign origin**

Run: `ALLOWED_ORIGINS=example.com go run ./cmd/server`. In another shell:
```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZQ==' \
  -H 'Origin: http://evil.test' \
  http://localhost:8080/ws
```
Expected: `403` (origin not in the allowlist). Stop the server.

- [ ] **Step 8: Commit**

```bash
git add internal/server/server.go
git commit -m "feat(server): add /healthz, env-gated WS origin allowlist, optional static serving"
```

---

## Task 3: Client resolves the WS URL at runtime

**Files:**
- Create: `web/src/config.js`
- Modify: `web/src/main.js`

- [ ] **Step 1: Create `web/src/config.js`**

```js
// Resolves the game server's WebSocket URL.
//
// In a split deployment the static client (Vercel) and the engine (Railway) run
// on different origins, so the client fetches /config.json — served by a Vercel
// function from the WS_URL env var — to learn the wss:// endpoint.
//
// Locally the Go server serves both halves and there is no /config.json, so any
// failure (404, network error, bad JSON, missing field) falls back to the same
// origin. That keeps local dev zero-config and the e2e smoke test unchanged.
export async function resolveWsUrl() {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && typeof cfg.wsUrl === 'string' && cfg.wsUrl) {
        return cfg.wsUrl;
      }
    }
  } catch {
    // fall through to the same-origin default
  }
  return `ws://${location.host}/ws`;
}
```

- [ ] **Step 2: Syntax-check the new module**

Run: `node --check web/src/config.js`
Expected: no output, exit 0.

- [ ] **Step 3: Import `resolveWsUrl` in `web/src/main.js`**

Change the top import block from:

```js
import { connect } from './net.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
```

to:

```js
import { connect } from './net.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { resolveWsUrl } from './config.js';
```

- [ ] **Step 4: Use the resolved URL in `connect(...)`**

In `web/src/main.js`, change line:

```js
  const net = connect(`ws://${location.host}/ws`, name, {
```

to:

```js
  const net = connect(await resolveWsUrl(), name, {
```

(`start()` is already `async`, so `await` is valid here — no signature change.)

- [ ] **Step 5: Syntax-check the modified module**

Run: `node --check web/src/main.js`
Expected: no output, exit 0.

- [ ] **Step 6: Run the e2e smoke test (proves the fallback path)**

Run: `cd web && npm run test:e2e`
Expected: PASS. (No `/config.json` exists locally, so `resolveWsUrl()` falls back to `ws://${location.host}/ws` and the browser→server loop works exactly as before. First run needs `npx playwright install chromium`.)

- [ ] **Step 7: Commit**

```bash
git add web/src/config.js web/src/main.js
git commit -m "feat(client): resolve WS url from /config.json with same-origin fallback"
```

---

## Task 4: Vercel config function + rewrite

**Files:**
- Create: `web/api/config.js`
- Create: `web/vercel.json`

- [ ] **Step 1: Create the Vercel function `web/api/config.js`**

```js
// Vercel serverless function. Returns the game server's WebSocket URL to the
// client at runtime, sourced from the WS_URL project env var — so the engine
// endpoint can change without a client rebuild and never lives in git.
// Reached via the /config.json rewrite in vercel.json.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ wsUrl: process.env.WS_URL || '' });
}
```

- [ ] **Step 2: Syntax-check the function**

Run: `node --check web/api/config.js`
Expected: no output, exit 0.

- [ ] **Step 3: Create `web/vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/config.json", "destination": "/api/config" }
  ]
}
```

- [ ] **Step 4: Validate the JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('web/vercel.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add web/api/config.js web/vercel.json
git commit -m "feat(client): add Vercel /config.json function + rewrite for WS_URL"
```

---

## Task 5: Engine Dockerfile + Railway config + env example

**Files:**
- Create: `Dockerfile`
- Create: `railway.json`
- Create: `.env.example`

- [ ] **Step 1: Create `Dockerfile` (repo root)**

```dockerfile
# Build the opencraft1 engine (cmd/server) as a static binary, then run it on a
# minimal image. The client is deployed separately to Vercel, so no web/ assets
# are copied — server.go skips static serving when web/ is absent.
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/server /app/server
# Railway injects PORT; the engine reads it (default 8080) and listens on all
# interfaces via ":$PORT".
CMD ["/app/server"]
```

- [ ] **Step 2: Verify the image builds and the binary runs (if Docker is available)**

Run: `docker build -t opencraft1-engine . && docker run --rm -e PORT=8080 -p 8080:8080 -d --name oc-test opencraft1-engine`
Then: `sleep 1 && curl -sS http://localhost:8080/healthz`
Expected: `ok`. Clean up: `docker rm -f oc-test`.

> If Docker is not installed in this environment, skip the runtime check; Step 3's `go build` already proves the binary compiles. Note the skip in the commit body.

- [ ] **Step 3: Confirm the engine still builds without the `web/` dir (image parity)**

Run: `go build -o /tmp/oc-server ./cmd/server && (cd /tmp && PORT=8123 /tmp/oc-server & sleep 1 && curl -sS http://localhost:8123/healthz && curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8123/ ; kill %1)`
Expected: `ok` then `404` — confirms `/healthz` works and static serving is correctly skipped when `web/` is absent (run from `/tmp`, which has no `web/`).

- [ ] **Step 4: Create `railway.json` (repo root)**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/healthz",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Step 5: Create `.env.example` (repo root)**

```bash
# opencraft1 engine (server). Local dev needs none of these — defaults are
# dev-friendly. Railway sets PORT automatically.

# Port the engine listens on. Default 8080.
PORT=8080

# Comma-separated WebSocket origin allowlist (host patterns). Empty = allow all
# (local dev). In production set to the Vercel client domain(s), e.g.
# opencraft1.vercel.app or *.vercel.app
ALLOWED_ORIGINS=

# --- client (Vercel) ---
# Set in the Vercel project dashboard, NOT in this server env. WS_URL is the
# wss:// engine endpoint the /config.json function returns, e.g.
#   wss://opencraft1-engine.up.railway.app/ws
# WS_URL=
```

- [ ] **Step 6: Validate `railway.json`**

Run: `node -e "JSON.parse(require('fs').readFileSync('railway.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile railway.json .env.example
git commit -m "feat(deploy): add engine Dockerfile, railway.json, and .env.example"
```

---

## Task 6: Documentation

**Files:**
- Modify: `docs/project-map/server.md`
- Modify: `docs/project-map/client.md`
- Modify: `AGENT_RULES.md`
- Create: `docs/deploy.md`
- Modify: `docs/project-map/README.md`

- [ ] **Step 1: Update `docs/project-map/server.md`**

In the `## packages` section, change the `cmd/server/main.go` bullet:

```markdown
- `cmd/server/main.go` — entrypoint. starts the sim goroutine and the http server (`:8080`), graceful shutdown on SIGINT.
```

to:

```markdown
- `cmd/server/main.go` — entrypoint. starts the sim goroutine and the http server (listens on `:$PORT`, default `8080`), graceful shutdown on SIGINT.
```

Change the `internal/server/server.go` bullet:

```markdown
- `internal/server/server.go` — http mux: `/` static files (`web/`) + `/ws` upgrade. one reader loop + one writer goroutine per connection; first frame must be Hello.
```

to:

```markdown
- `internal/server/server.go` — http mux: `/healthz` liveness, `/ws` upgrade, and `/` static files (`web/`, only when that dir exists — skipped in the Railway image). WS origin policy comes from `ALLOWED_ORIGINS` (allow-all when unset). one reader loop + one writer goroutine per connection; first frame must be Hello.
```

In `## sharp edges`, replace:

```markdown
- `InsecureSkipVerify` allows all WS origins for local dev; tighten before any public deploy.
```

with:

```markdown
- WS origins are allow-all only when `ALLOWED_ORIGINS` is unset (local dev). In production set it to the Vercel client host(s); see `docs/deploy.md`. The engine is a single stateful process — do **not** run multiple replicas (in-memory world would desync).
```

- [ ] **Step 2: Update `docs/project-map/client.md`**

In `## modules (web/src/)`, add a bullet for the new module (after the `net.js` line):

```markdown
- `config.js` — resolves the engine WebSocket URL: fetches `/config.json` (served by a Vercel function from `WS_URL` in the split deploy) and falls back to same-origin `ws://${location.host}/ws` on any failure, so local single-process dev is zero-config.
```

Change the `main.js` bullet to note it awaits the resolved URL:

```markdown
- `main.js` — orchestration: name-entry → connect → per-frame loop (move, interpolate remotes, center camera, rate-limited input send). resolves the socket URL via `config.js` (`resolveWsUrl()`) before connecting. exposes live `{me, others, bounds}` on `window.__game` when `window.__E2E` is set, for the Playwright smoke test (`web/e2e/`); inert otherwise.
```

In `## sharp edges`, add:

```markdown
- the production engine URL comes from Vercel's `WS_URL` env via `/config.json`; there is no client rebuild on URL change. `web/api/config.js` + `web/vercel.json` wire this up — see `docs/deploy.md`.
```

- [ ] **Step 2b: Self-check the project-map docs stay within the line cap**

Run: `wc -l docs/project-map/server.md docs/project-map/client.md`
Expected: each well under the 250-line hard cap noted in `docs/project-map/README.md`.

- [ ] **Step 3: Update `AGENT_RULES.md` development commands**

In `## development commands`, after the `go run ./cmd/server` line, add:

```markdown
- `PORT=9090 go run ./cmd/server` — run on a custom port (Railway injects `PORT` in prod).
- `ALLOWED_ORIGINS=opencraft1.vercel.app go run ./cmd/server` — run with the prod WS origin allowlist (empty = allow all, dev default).
- `docker build -t opencraft1-engine .` — build the engine image used by Railway.
```

Then add a new subsection immediately after the `## development commands` list:

```markdown
## deployment & environment

split deployment: static client → Vercel, Go engine → Railway. full runbook in `docs/deploy.md`.

| var | side | meaning |
|---|---|---|
| `PORT` | engine | listen port; Railway injects it (default `8080`). |
| `ALLOWED_ORIGINS` | engine | comma-separated WS origin host patterns; empty = allow all (dev). set to the Vercel host(s) in prod. |
| `WS_URL` | client (Vercel) | `wss://` engine endpoint returned by `/config.json`, e.g. `wss://<service>.up.railway.app/ws`. |

config files: `Dockerfile` + `railway.json` (engine), `web/vercel.json` + `web/api/config.js` (client). document new vars in `.env.example`.
```

- [ ] **Step 4: Create `docs/deploy.md`**

```markdown
# deploy runbook — split client/server

opencraft1 deploys as two independent halves:

- **client** (`web/`, static ES modules + PixiJS) → **Vercel**
- **engine** (`cmd/server`, Go tick server) → **Railway**

local dev is unaffected: `go run ./cmd/server` serves both halves on `:8080`, and the client falls back to same-origin when `/config.json` is absent.

## 1. deploy the engine to Railway

1. create a Railway project and a service from this repo. Railway reads `railway.json` → builds the `Dockerfile`.
2. the healthcheck path is `/healthz` (already set in `railway.json`). `PORT` is injected by Railway — the engine reads it automatically.
3. generate a public domain for the service (Railway → service → Settings → Networking → Generate Domain). Note it, e.g. `opencraft1-engine.up.railway.app`.
4. set the WS origin allowlist **after** you know the Vercel domain (step 2.4). For now leave `ALLOWED_ORIGINS` empty or set a placeholder; you will update it.
5. confirm liveness: `curl https://<railway-domain>/healthz` → `ok`.

## 2. deploy the client to Vercel

1. import the repo into Vercel. Set **Root Directory = `web`** (the client lives there). Framework preset: **Other** (no bundler).
2. set the project env var `WS_URL` = `wss://<railway-domain>/ws` (from step 1.3), e.g. `wss://opencraft1-engine.up.railway.app/ws`.
3. deploy. Vercel serves `web/` statically and exposes `web/api/config.js`; `web/vercel.json` rewrites `/config.json` → `/api/config`.
4. note the Vercel domain, e.g. `opencraft1.vercel.app`.

## 3. wire the origin allowlist

1. back in Railway, set `ALLOWED_ORIGINS` to the Vercel host(s): `opencraft1.vercel.app`. add `*.vercel.app` too if preview deployments should connect.
2. Railway redeploys. the engine now rejects WS upgrades from any other origin.

## 4. smoke test (cross-origin)

1. open `https://<vercel-domain>/` in a browser.
2. confirm in DevTools → Network: `GET /config.json` returns `{ "wsUrl": "wss://<railway-domain>/ws" }`, and a WebSocket to that URL opens (status 101).
3. enter a name → you should spawn in the world. open a second tab → both presences should see each other move.

## troubleshooting

- **WS fails / 403 on upgrade:** `ALLOWED_ORIGINS` doesn't include the exact Vercel host (scheme-less, e.g. `opencraft1.vercel.app`). Update it and redeploy.
- **client tries `ws://<vercel-host>/ws`:** `/config.json` isn't returning a `wsUrl` — check `WS_URL` is set in Vercel and the rewrite/function deployed. The client falls back to same-origin only when the fetch fails.
- **mixed-content blocked:** `WS_URL` must be `wss://` (not `ws://`) for an HTTPS client.
- **healthcheck failing on Railway:** confirm the service listens on `$PORT` (it does by default) and that `/healthz` returns `ok`.

## rollback

- **engine:** Railway → Deployments → redeploy a previous successful deployment.
- **client:** Vercel → Deployments → promote a previous deployment to production.
- the two halves version independently; a client rollback does not require an engine rollback (the wire format is unchanged by this split).
```

- [ ] **Step 5: Update `docs/project-map/README.md` — task→doc row and changelog**

In the `## task → doc` table, add a row after the web client row:

```markdown
| deploy (Vercel client / Railway engine) | `../deploy.md` |
```

Prepend a new changelog entry at the top of the `## changelog` list (above the `2026-06-12` entries):

```markdown
- 2026-06-14: split deployment (branch `split-deployment`) — static client → Vercel, Go engine → Railway. client resolves the engine `wss://` URL at runtime via `/config.json` (Vercel function from `WS_URL`, `web/api/config.js` + `web/vercel.json`), falling back to same-origin so local dev is unchanged. engine reads `PORT`, adds `/healthz`, and gates WS origins on `ALLOWED_ORIGINS` (allow-all when unset). adds `Dockerfile`, `railway.json`, `.env.example`, and the `docs/deploy.md` runbook. no wire-format or engine-logic change.
```

- [ ] **Step 6: Verify docs reference real files and commit**

Run: `ls Dockerfile railway.json .env.example web/vercel.json web/api/config.js web/src/config.js docs/deploy.md`
Expected: all paths listed (no "No such file").

```bash
git add docs/project-map/server.md docs/project-map/client.md AGENT_RULES.md docs/deploy.md docs/project-map/README.md
git commit -m "docs: document split deployment (server.md, client.md, AGENT_RULES, deploy runbook)"
```

---

## Final verification

- [ ] **Step 1: Full build, vet, and existing test suite**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: all `ok`.

- [ ] **Step 2: Client syntax + e2e**

Run: `for f in web/src/*.js web/api/config.js; do node --check "$f"; done && cd web && npm run test:e2e`
Expected: no syntax errors; e2e PASS.

- [ ] **Step 3: Confirm the working tree is clean and the branch is ready**

Run: `git status --porcelain`
Expected: empty (everything committed on the `split-deployment` branch).
```
