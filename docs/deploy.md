# deploy runbook — split client/server

opencraft deploys as two independent halves:

- **client** (`web/`, static ES modules + PixiJS) → **Vercel**
- **engine** (`cmd/server`, Go tick server) → **Railway**

local dev is unaffected: `go run ./cmd/server` serves both halves on `:8080`, and the client falls back to same-origin when `/config.json` is absent.

## 1. deploy the engine to Railway

1. create a Railway project and a service from this repo. Railway reads `railway.json` → builds the `Dockerfile`.
2. the healthcheck path is `/healthz` (already set in `railway.json`). `PORT` is injected by Railway — the engine reads it automatically.
3. generate a public domain for the service (Railway → service → Settings → Networking → Generate Domain). Note it, e.g. `opencraft-engine.up.railway.app`.
4. set the WS origin allowlist **after** you know the Vercel domain (step 2.4). For now leave `ALLOWED_ORIGINS` empty or set a placeholder; you will update it.
5. confirm liveness: `curl https://<railway-domain>/healthz` → `ok`.

## 2. deploy the client to Vercel

1. import the repo into Vercel. Set **Root Directory = `web`** (the client lives there). Framework preset: **Other** (no bundler).
2. set the project env var `WS_URL` = `wss://<railway-domain>/ws` (from step 1.3), e.g. `wss://opencraft-engine.up.railway.app/ws`.
3. deploy. Vercel serves `web/` statically and exposes `web/api/config.js`; `web/vercel.json` rewrites `/config.json` → `/api/config`.
4. note the Vercel domain, e.g. `opencraft.vercel.app`.

## 3. wire the origin allowlist

1. back in Railway, set `ALLOWED_ORIGINS` to the Vercel host(s): `opencraft.vercel.app`. add `*.vercel.app` too if preview deployments should connect.
2. Railway redeploys. the engine now rejects WS upgrades from any other origin.

## 4. smoke test (cross-origin)

1. open `https://<vercel-domain>/` in a browser.
2. confirm in DevTools → Network: `GET /config.json` returns `{ "wsUrl": "wss://<railway-domain>/ws" }`, and a WebSocket to that URL opens (status 101).
3. enter a name → you should spawn in the world. open a second tab → both presences should see each other move.

## troubleshooting

- **WS fails / 403 on upgrade:** `ALLOWED_ORIGINS` doesn't include the exact Vercel host (scheme-less, e.g. `opencraft.vercel.app`). Update it and redeploy.
- **client tries `ws://<vercel-host>/ws`:** `/config.json` isn't returning a `wsUrl` — check `WS_URL` is set in Vercel and the rewrite/function deployed. The client falls back to same-origin only when the fetch fails.
- **mixed-content blocked:** `WS_URL` must be `wss://` (not `ws://`) for an HTTPS client.
- **healthcheck failing on Railway:** confirm the service listens on `$PORT` (it does by default) and that `/healthz` returns `ok`.

## rollback

- **engine:** Railway → Deployments → redeploy a previous successful deployment.
- **client:** Vercel → Deployments → promote a previous deployment to production.
- the two halves version independently; a client rollback does not require an engine rollback (the wire format is unchanged by this split).
