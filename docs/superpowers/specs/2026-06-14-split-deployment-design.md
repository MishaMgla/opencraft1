# split deployment: client (Vercel) / server (Railway) — design

**status:** approved, pre-implementation
**date:** 2026-06-14
**supersedes nothing.** extends the MVP engine (`2026-06-11-opencraft1-mvp-engine-design.md`) with a deployment topology. no engine-logic or wire-format changes.

## problem

Today one Go binary serves both the static client (`http.FileServer(http.Dir("web"))`) and the `/ws` game endpoint on a hardcoded `:8080`. The client hardcodes its socket URL as `ws://${location.host}/ws` (`web/src/main.js:29`), assuming client and server share an origin. WS accept uses `InsecureSkipVerify: true` (allow-all origins). This is a single-origin, single-process deployment.

We want a **split deployment**: serve the static client from a CDN and run the Go engine on a persistent host, wired across origins over TLS.

## decisions (locked)

| decision | choice | rationale |
|---|---|---|
| hosting | **client → Vercel**, **server → Railway** | static CDN + custom domain for the client; persistent, WS-friendly, TLS-terminated process for the engine. Railway MCP + Vercel skills already present in the toolchain. |
| scope | **code + config only** | make the repo split-deployable and document the deploy; no live resources provisioned in this change. The operator runs the actual deploys from the runbook. |
| client config | **runtime `/config.json` fetch** | the client learns the server `wss://` URL at load from a Vercel function reading `$WS_URL`; URL changes without a rebuild and stays out of git. |
| server build | **Dockerfile (multi-stage)** | explicit and provider-portable; preferred over Railway Nixpacks auto-detect for reproducibility and lock-in avoidance. |

## non-goals

- **No horizontal scaling of the engine.** World state is in-memory in a single `Sim` goroutine; running multiple engine replicas would shard/desync the world. That is a separate, larger project. This change keeps exactly one engine process.
- **No wire-format / protocol / engine-logic changes.** The Go↔JS golden fixtures and both test suites are untouched.
- **No new automated tests** (per `AGENT_RULES.md` "no unsolicited tests"). Verification is by build/vet/existing suites + a manual smoke test in the runbook.
- **No bundler.** The client stays vanilla ES modules; config injection must not require a build toolchain on the client.

## architecture

```
Browser ──HTTPS──▶ Vercel (static web/)            client: PixiJS v8 (CDN), ES modules
   │                  └─ /config.json → /api/config (Vercel function → $WS_URL)
   └──── wss:// ─────▶ Railway (cmd/server)          engine: Sim 15 Hz + /ws + /healthz
```

The engine remains a single stateful process (in-memory world, 15 Hz tick). The split is purely about *where* each half runs and *how* they find each other across origins.

### local dev is unchanged (one command)

`go run ./cmd/server` still serves `web/` + `/ws` on `:8080`. The client's config fetch **falls back to same-origin** (`ws://${location.host}/ws`) whenever `/config.json` is absent or unparseable — which is exactly the local single-process case. No local config file is required, and the existing Playwright e2e (which boots the real Go server same-origin) keeps passing untouched.

## component changes

### client (`web/`)

- **`web/src/config.js`** (new) — `export async function resolveWsUrl()`:
  - `fetch('/config.json')`; on `res.ok` and valid JSON with a `wsUrl` string → return it.
  - on **any** failure (non-OK status, network error, JSON parse error, missing field) → return `` `ws://${location.host}/ws` ``.
  - this single fallback branch is what keeps local dev zero-config and keeps the e2e green.
- **`web/src/main.js`** — replace the hardcoded `` connect(`ws://${location.host}/ws`, …) `` at line 29 with `connect(await resolveWsUrl(), …)`. The init path becomes `async`. The `window.__game` e2e hook is still installed after `connect`, so the smoke test is unaffected.
- **`web/api/config.js`** (new) — Vercel serverless function returning `{ wsUrl: process.env.WS_URL }` as JSON. Keeps the prod URL in Vercel env, not git; changeable without a code change.
- **`web/vercel.json`** (new) — rewrite `/config.json` → `/api/config`; serve `web/` as the static root; conservative cache headers (no-cache on `/config.json`, normal caching on assets).

### server (Go)

- **`cmd/server/main.go`** — read `PORT` from env (default `8080`); listen on `:${PORT}`. Railway injects `PORT`.
- **`internal/server/server.go`**:
  - **`/healthz`** → `200 OK` plain text. Used as the Railway healthcheck path and as a general uptime probe.
  - **origin allowlist** — read `ALLOWED_ORIGINS` (comma-separated host patterns). If non-empty → `websocket.AcceptOptions{OriginPatterns: [...]}`. If empty → keep `InsecureSkipVerify: true` for frictionless local dev. Prod sets the env; dev does not. This retires the `server.md` "tighten before any public deploy" sharp edge.
  - **static serving** — register `http.FileServer(http.Dir("web"))` on `/` **only when the `web/` directory exists** (it does locally; it won't in the Railway image). Otherwise skip it. Harmless either way; the engine image carries no client assets.

### deployment config

- **`Dockerfile`** (new) — multi-stage: `golang` builder compiles `./cmd/server` to a static binary; minimal runtime stage runs it. No `web/` copied (client lives on Vercel). Exposes the port from `PORT`.
- **`railway.json`** (new) — `build.builder: DOCKERFILE`; `deploy.healthcheckPath: /healthz`; a sane restart policy.
- **`.env.example`** (new) — documents `PORT` and `ALLOWED_ORIGINS` (server) and notes Vercel's `WS_URL` (client). No secrets committed.

### docs (required by repo protocol)

- **`docs/project-map/server.md`** — document `PORT`, `/healthz`, `ALLOWED_ORIGINS`; retire the `InsecureSkipVerify` sharp edge (now env-gated).
- **`docs/project-map/client.md`** — document the `/config.json` fetch + same-origin fallback.
- **`AGENT_RULES.md`** — add deploy commands and an env-var table; note the new files.
- **`docs/deploy.md`** (new) — runbook: build/push the engine to Railway, set `ALLOWED_ORIGINS`, grab the Railway URL; deploy `web/` to Vercel, set `WS_URL` to `wss://<railway-host>/ws`; cross-origin smoke test; rollback notes.
- **`docs/project-map/README.md`** — changelog entry + a `docs/deploy.md` row in the task→doc table; pointer-table row in `AGENT_RULES.md`.

## data flow (prod)

1. Browser loads `https://<vercel-host>/` → static HTML + ES modules + PixiJS from CDN.
2. `main.js` calls `resolveWsUrl()` → `fetch('/config.json')` → Vercel rewrites to `/api/config` → `{ wsUrl: "wss://<railway-host>/ws" }`.
3. Client opens `wss://<railway-host>/ws`. Railway terminates TLS, forwards to the Go engine.
4. Engine checks the `Origin` header against `ALLOWED_ORIGINS` (the Vercel host). On match, upgrade proceeds; the existing Hello → join → snapshot loop runs unchanged.

## error handling & edge cases

- **`/config.json` unreachable / malformed** → client falls back to same-origin `ws://`. (Correct for local dev; in prod a missing function would mean the client tries to socket to the Vercel origin and fail visibly — surfaced in the runbook smoke test.)
- **mixed content** — prod `wsUrl` is explicitly `wss://`, so an HTTPS page never opens an insecure socket. The `ws://` fallback only triggers on a local (non-TLS) origin.
- **origin rejected** — if `ALLOWED_ORIGINS` omits the Vercel host, the WS upgrade is refused; the runbook calls out setting it to the exact deployed Vercel domain (including preview domains if those should connect).
- **`web/` absent in the engine image** — static handler is skipped; `/` returns 404 from the engine, which is fine (clients never hit the engine origin for HTML).

## verification

- `go build ./...`, `go vet ./...`, `go test ./...` green.
- `node --check` on changed JS modules.
- existing Playwright e2e (`cd web && npm run test:e2e`) still passes — proves the same-origin fallback path end-to-end.
- exact syntax for `vercel.json` rewrites, the Vercel function signature, `railway.json` schema, and `coder/websocket` `OriginPatterns` verified against Context7 before writing code.
- live cross-origin smoke test documented in `docs/deploy.md` for the operator to run post-deploy.
