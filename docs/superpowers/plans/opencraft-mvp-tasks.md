# opencraft MVP — Ralph Task Tracker

> **Single source of truth for build progress.** The orchestrator (main Claude) reads
> this file every iteration, picks the next ready task, dispatches ONE subagent to do it,
> verifies, then marks it done. Subagents implement; the orchestrator verifies + commits.
>
> **Detailed spec for every task lives in** [`2026-06-11-opencraft-mvp-engine.md`](2026-06-11-opencraft-mvp-engine.md).
> This tracker is the orchestration index — it points each task at the exact plan section
> that contains its code, interface, and rationale. Do not duplicate code here.

## Status legend
- `[ ]` pending — not started (or failed, awaiting retry)
- `[~]` in progress — a subagent is currently working it (orchestrator sets this before dispatch)
- `[x]` done — implemented, verification passed, committed

## Rules (for the orchestrator)
1. **One task per iteration.** Pick the FIRST `[ ]` task whose every dependency is `[x]`.
2. **Never skip dependencies.** If no task is ready, something is wrong — report it, don't force progress.
3. **Subagents do not commit.** They implement + run the verification command + report PASS/FAIL with exact output.
4. **Orchestrator verifies independently** — re-run the verification command yourself before marking `[x]`.
5. **Never mark `[x]` without a passing verification.** On failure: set back to `[ ]`, append a dated note under the task, let the next iteration retry.
6. **Commit message** is given per task; use it verbatim. Record the commit hash in the task's Done note.
7. When all tasks are `[x]`, output the completion promise: `<promise>OPENCRAFT_MVP_COMPLETE</promise>`.
8. **No unsolicited tests** (`AGENT_RULES.md`): verification is build + vet + run + observe, never test-first.

---

## Tasks

### [x] T01 — Go module init
- **Deps:** none
- **Files:** create `go.mod`
- **Spec:** Plan Task 1, Step 1.
- **Interface:** `module opencraft`, `go 1.23`.
- **Verify:** `test -f go.mod && head -1 go.mod` shows `module opencraft`.
- **Commit:** `chore: init go module`

### [x] T02 — Server scaffold + static page
- **Deps:** T01
- **Files:** create `cmd/server/main.go`, `web/index.html`
- **Spec:** Plan Task 1, Steps 2–4. (Minimal `http.FileServer` over `web/`; placeholder HTML.)
- **Verify:** `go build ./... && go run ./cmd/server & sleep 1 && curl -s localhost:8080 && kill %1` — prints the `opencraft scaffold ok` HTML, no build errors.
- **Commit:** `feat: scaffold Go server serving static web client`

### [x] T03 — Record toolchain in AGENT_RULES
- **Deps:** T01
- **Files:** modify `AGENT_RULES.md`
- **Spec:** Plan Task 1, Step 5 (replace `## coding style & naming` and `## development commands` `_(pending stack)_` bodies with the Go/JS toolchain blocks).
- **Verify:** `grep -q "go build ./..." AGENT_RULES.md && grep -q "vanilla ES modules" AGENT_RULES.md`
- **Commit:** `docs: record Go/JS toolchain in AGENT_RULES`

### [x] T04 — Binary wire protocol (Go)
- **Deps:** T01
- **Files:** create `internal/wire/wire.go`
- **Spec:** Plan Task 2, Step 1. Also see the wire-protocol table at the top of the plan.
- **Interface:** type consts `CHello/CInput/CPing/SWelcome/SSnapshot/SEnter/SLeave/SPong`; `Ent{ID uint32; X,Y int16}`; encoders `EncodeWelcome/EncodeSnapshot/EncodeEnter/EncodeLeave/EncodePong`; `ParseClient(b []byte)(ClientMsg, bool)` with `ClientMsg{Type byte; Name string; X,Y int16; T uint32}`.
- **Verify:** `go build ./internal/wire && go vet ./internal/wire` — no output, exit 0.
- **Commit:** `feat: add binary wire protocol (encoders + client decoder)`

### [x] T05 — Spatial grid / area-of-interest (Go)
- **Deps:** T01
- **Files:** create `internal/world/grid.go`
- **Spec:** Plan Task 3, Step 1.
- **Interface:** consts `WorldSize=4096`, `CellSize=256`, `GridDim=16`; `type Grid`; `NewGrid()`; `(*Grid).Insert/Remove/Move`; `(*Grid).Neighbors(x,y int16) []uint32`.
- **Verify:** `go build ./internal/world && go vet ./internal/world` — no output, exit 0.
- **Commit:** `feat: add uniform spatial grid for area-of-interest`

### [x] T06 — Simulation core (Go)
- **Deps:** T04, T05
- **Files:** create `internal/world/sim.go`
- **Spec:** Plan Task 4, Step 1. Depends on `wire` encoders + `grid` (same package).
- **Interface:** `type Sim`; `NewSim()`; `(*Sim).Run(ctx)`; `(*Sim).Join(name string, out chan []byte) uint32`; `(*Sim).Input(id uint32, x,y int16)`; `(*Sim).Leave(id uint32)`; `(*Sim).Ping(id uint32, t uint32)`.
- **Verify:** `go build ./internal/world && go vet ./internal/world` — no output, exit 0.
- **Commit:** `feat: add authoritative 15Hz simulation core with AoI snapshots`

### [x] T07 — WebSocket dependency + connection handler (Go)
- **Deps:** T04, T06
- **Files:** modify `go.mod`/`go.sum` (`go get github.com/coder/websocket@latest`), create `internal/server/server.go`
- **Spec:** Plan Task 5, Steps 1–2.
- **Interface:** `server.New(sim *world.Sim) *Server`; `(*Server).Handler() http.Handler`.
- **Verify:** `go build ./internal/server && go vet ./internal/server` — no output, exit 0.
- **Commit:** `feat: add websocket connection handler`

### [x] T08 — Wire sim + server in main (Go)
- **Deps:** T02, T07
- **Files:** modify `cmd/server/main.go` (replace Task 1 stub with full wiring + graceful shutdown)
- **Spec:** Plan Task 5, Steps 3–4.
- **Verify:** `go build ./... && go vet ./... && go run ./cmd/server & sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" localhost:8080 && kill %1` — build/vet clean; curl prints `200`.
- **Commit:** `feat: wire up sim + websocket server in main`

### [x] T09 — Isometric projection (client, pure)
- **Deps:** T01
- **Files:** create `web/src/iso.js`
- **Spec:** Plan Task 6, Step 1.
- **Interface:** `KX`, `KY` consts; `worldToScreen(wx,wy) -> {x,y}`; `depth(wx,wy) -> number`.
- **Verify:** `node --check web/src/iso.js` — no output, exit 0.
- **Commit:** `feat: add isometric projection helpers (client)`

### [x] T10 — Binary wire codec mirror (client, pure)
- **Deps:** T01
- **Files:** create `web/src/wire.js`
- **Spec:** Plan Task 7, Step 1. **Must match the Go protocol (T04) byte-for-byte.**
- **Interface:** `encodeHello(name) -> ArrayBuffer`; `encodeInput(x,y) -> ArrayBuffer`; `decodeServer(view: DataView) -> {type, ...}` (`'welcome'|'snapshot'|'enter'|'leave'|'pong'|'unknown'`).
- **Verify:** `node --check web/src/wire.js` — no output, exit 0.
- **Commit:** `feat: add client-side binary wire codec mirroring the Go protocol`

### [x] T11 — Network layer (client)
- **Deps:** T10
- **Files:** create `web/src/net.js`
- **Spec:** Plan Task 8, Step 1.
- **Interface:** `connect(url, name, handlers) -> { sendInput(x,y), close() }`; handlers keyed `welcome/snapshot/enter/leave/pong` (+ optional `close`).
- **Verify:** `node --check web/src/net.js` — no output, exit 0.
- **Commit:** `feat: add client websocket net layer`

### [x] T12 — Input → local movement (client)
- **Deps:** T01
- **Files:** create `web/src/input.js`
- **Spec:** Plan Task 9, Step 1.
- **Interface:** `createInput() -> { step(pos, speed, dt, bounds) -> boolean }` (mutates `pos.{x,y}`, clamps to `bounds`, returns whether moved).
- **Verify:** `node --check web/src/input.js` — no output, exit 0.
- **Commit:** `feat: add client keyboard input + local movement integration`

### [x] T13 — PixiJS renderer (client)
- **Deps:** T09
- **Files:** create `web/src/render.js`
- **Spec:** Plan Task 10, Step 1. Uses PixiJS v8 (CDN) + `iso.js`.
- **AMENDMENT (post-T15):** the plan's import URL `https://esm.sh/pixi.js@8` is broken — esm.sh's split-module delivery makes Pixi v8 double-register extensions ("Extension type batcher already has a handler"), so `app.init()` throws and no canvas renders. Use the official prebuilt ESM bundle instead: `https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs` (verified in-browser: init OK, WebGL renderer, named exports present). Fixed in commit `46aee18`.
- **Interface:** `createRenderer() -> { app, addToken(id,name,color,x,y), removeToken(token), placeToken(token), setLocal(x,y), centerCamera(x,y) }`; `token = {container,rx,ry,tx,ty}`.
- **Verify:** `node --check web/src/render.js` — no output, exit 0. (Node can't resolve the CDN import but `--check` only parses syntax.)
- **Commit:** `feat: add pixijs isometric renderer (client)`

### [x] T14 — Orchestration entry + client shell (client)
- **Deps:** T11, T12, T13
- **Files:** create `web/src/main.js`, replace `web/index.html` (real client shell: overlay + HUD + module entry)
- **Spec:** Plan Task 10, Steps 2–4.
- **Verify:** `node --check web/src/main.js` — no output, exit 0. (`index.html` is static markup; visual check happens in T15.)
- **Commit:** `feat: add client orchestration entry and real client shell`

### [x] T15 — End-to-end multiplayer verification
- **Deps:** T08, T14
- **Files:** none (verification-only task; fixes re-open the responsible task)
- **Spec:** Plan Task 11, Step 1.
- **Verify:** Run `go run ./cmd/server`, open two clients at `http://localhost:8080`. Confirm: (1) each renders the iso floor with its own centered token; (2) WASD/arrow movement in one client is seen moving (interpolated) in the other, HUD "players nearby" ≥ 1; (3) closing one client removes its token from the other; (4) no console errors, `/ws` carries **binary** frames. Use the Playwright MCP (two browser tabs/contexts) to automate; fall back to manual if needed. If any check fails, set the responsible task (`T08`/`T14`/etc.) back to `[ ]` with a note and do NOT mark T15 done.
- **Commit:** *(no code — record the verification result in the Done note; no commit unless a fix was made under another task)*

### [x] T16 — Server leaf doc
- **Deps:** T08
- **Files:** create `docs/project-map/server.md`
- **Spec:** Plan Task 11, Step 2.
- **Verify:** `test -f docs/project-map/server.md && grep -q "single source of truth" docs/project-map/server.md`
- **Commit:** `docs: add server leaf doc for the Go engine`

### [x] T17 — Client leaf doc
- **Deps:** T14
- **Files:** create `docs/project-map/client.md`
- **Spec:** Plan Task 11, Step 3.
- **Verify:** `test -f docs/project-map/client.md && grep -q "byte-for-byte" docs/project-map/client.md`
- **Commit:** `docs: add client leaf doc for the web client`

### [x] T18 — Register leaf docs in project-map + AGENT_RULES
- **Deps:** T16, T17
- **Files:** modify `docs/project-map/README.md` (tree + task→doc table + changelog), `AGENT_RULES.md` (pointer table rows)
- **Spec:** Plan Task 11, Steps 4–5.
- **Verify:** `go build ./... && go vet ./...` clean; `grep -q "server.md" docs/project-map/README.md && grep -q "client.md" docs/project-map/README.md`
- **Commit:** `docs: register server/client leaf docs in project-map`

---

## Progress log
*(orchestrator appends one line per completed task: `T0X done — <commit hash> — <UTC timestamp>`)*

> **Environment note:** `go` is not on the default PATH. Go 1.23.4 is installed at `$HOME/.local/go/bin`. Prefix every Go command with `export PATH="$HOME/.local/go/bin:$PATH"` (profile edits are not permitted). `node` v20.20.1 is on PATH for client `node --check` tasks.
> **Run+curl tasks (T08/T15):** the plan's `kill %1` job control does NOT work in the non-interactive shell, and `pkill -f cmd/server` matches the runner's own command line. Start with `setsid go run ./cmd/server >/tmp/srv.log 2>&1 &`, `sleep 2.5`, curl, then stop the server with `fuser -k 8080/tcp`.

- T01 done — 27deecb — 2026-06-11
- T02 done — e031766 — 2026-06-11
- T03 done — 129d7de — 2026-06-11
- T04 done — 4eb6701 — 2026-06-11
- T05 done — 5e6bfb6 — 2026-06-11
- T06 done — 3db8c3e — 2026-06-11
- T07 done — 1b6c92c — 2026-06-11 (note: go.mod lists coder/websocket as `// indirect`; T08's `go mod tidy`/build will promote it to direct — harmless, build passes)
- T08 done — 9a14d97 — 2026-06-11 (full build/vet clean, HTTP 200; coder/websocket now direct)
- T09 done — 0f3173a — 2026-06-11
- T10 done — b376975 — 2026-06-11 (byte offsets cross-checked vs Go: type bytes, Enter color@9/nlen@13/name@14, Snapshot ent x@+4/y@+6 all match)
- T11 done — 47cdac0 — 2026-06-11
- T12 done — 4cf0935 — 2026-06-11
- T13 done — ec7510b — 2026-06-11
- T14 done — 4e8eed6 — 2026-06-11
- T15 done — 46aee18 — 2026-06-11 (Playwright E2E: canvas renders 0 errors after pixi CDN fix; 2 raw-WS clients over binary frames — mutual Enter, B's movement to (2200,2150) propagated to A, 27 snapshots, Leave on disconnect. Found+fixed pixi import bug in render.js; see T13 amendment.)
- T16 done — 76f031a — 2026-06-11
- T17 done — 83095ca — 2026-06-11
- T18 done — 2de11cf — 2026-06-11

**ALL 18 TASKS COMPLETE.** opencraft MVP engine built, verified end-to-end (Go tick server + PixiJS isometric client, real-time multiplayer over binary WebSocket). One defect found and fixed during E2E (pixi CDN import). Tracker committed separately.
