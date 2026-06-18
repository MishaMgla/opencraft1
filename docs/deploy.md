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

the service auto-redeploys from the connected GitHub repo, but `railway.json` sets `build.watchPatterns` so **only engine changes** (`cmd/**`, `internal/**`, `go.mod`, `go.sum`, `Dockerfile`, `railway.json`) trigger a redeploy. client-only `web/**` pushes don't restart the engine (which would drop live player WebSocket connections). Railway bills usage-based on the running container, not per build, so the cost driver is the always-on engine + player egress, not deploy frequency.

## 1b. enable player persistence (Supabase Postgres)

optional but recommended for production — without it, player positions reset every engine restart (in-memory only).

1. in the Supabase project (`opencraft1`, ref `yewdvlscipamycxdosui`), the `public.player_state` table already exists (migration `create_player_state`). it stores last-known `x`/`y`/`color` keyed on player `name` — the only stable identity until auth lands. RLS is enabled with **no policies**: the public PostgREST/anon API is denied, while the engine (direct Postgres connection) bypasses RLS.
2. grab the **session pooler** connection string: Supabase dashboard → **Connect** button (top bar) → **Session pooler** (Supavisor, port **5432**). use this, *not* the direct `db.<ref>.supabase.co` string — that endpoint is IPv6-only without the paid IPv4 add-on, which Railway may not reach. session mode is IPv4-compatible and (unlike the transaction pooler on 6543) keeps persistent connections + prepared statements, so pgx needs no tweaks. it looks like `postgresql://postgres.<ref>:[PASSWORD]@aws-X-<region>.pooler.supabase.com:5432/postgres`.
3. set `DATABASE_URL` to that URI in Railway (engine service → Variables). on boot the engine logs `persistence: postgres`; if unset it logs `persistence: disabled (DATABASE_URL unset)` and runs in-memory.
4. behavior: position is loaded on join (returning names respawn where they left off), and saved on leave, on a 30s periodic flush, and on graceful shutdown. all writes are async — they never block the tick loop. DB trouble degrades gracefully (logged; joins still succeed at center).

> the engine needs Go 1.25+ (pgx dependency); the `Dockerfile` and CI pin `1.25`.

## 2. deploy the client to Vercel (prebuilt, built in CI)

the client is **built in GitHub Actions and uploaded prebuilt** — Vercel never runs a (billable) build. `web/vercel.json` sets `git.deploymentEnabled: false`, so Vercel's Git integration does **not** auto-build; `.github/workflows/deploy-client.yml` is the only thing that ships the client (`vercel pull → vercel build → vercel deploy --prebuilt`). the CLI runs from the repo root and honors the project's **Root Directory = `web`** pulled by `vercel pull`.

one-time setup:

1. import the repo into Vercel. Set **Root Directory = `web`** (the client lives there). Framework preset: **Other** (no bundler).
2. set the project env var `WS_URL` = `wss://<railway-domain>/ws` (from step 1.3), e.g. `wss://opencraft1-engine.up.railway.app/ws`. read at runtime by `web/api/config.js`, so it never needs a rebuild to change.
3. locally run `vercel link` against the project once, then copy `orgId`/`projectId` from `.vercel/project.json`. add three repo secrets (GitHub → Settings → Secrets and variables → Actions): `VERCEL_TOKEN` (Vercel → Account → Tokens), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

ongoing (no Vercel build cost):

- **push to `main` touching `web/**`** → workflow deploys to **production**.
- **PR touching `web/**`** → workflow deploys a **preview** and comments the URL.
- Vercel serves `web/` statically and runs `web/api/config.js`; `web/vercel.json` rewrites `/config.json` → `/api/config`.

note the Vercel domain, e.g. `opencraft1.vercel.app`.

## 3. wire the origin allowlist

1. back in Railway, set `ALLOWED_ORIGINS` to the Vercel host(s): `opencraft1.vercel.app`. add `*.vercel.app` too if preview deployments should connect.
2. Railway redeploys. the engine now rejects WS upgrades from any other origin.

## 4. smoke test (cross-origin)

1. open `https://<vercel-domain>/` in a browser.
2. confirm in DevTools → Network: `GET /config.json` returns `{ "wsUrl": "wss://<railway-domain>/ws" }`, and a WebSocket to that URL opens (status 101).
3. enter a name → you should spawn in the world. open a second tab → both presences should see each other move.

## troubleshooting

- **WS fails / 403 on upgrade:** `ALLOWED_ORIGINS` doesn't include the exact Vercel host (scheme-less, e.g. `opencraft1.vercel.app`). Update it and redeploy.
- **client tries `ws(s)://<vercel-host>/ws`:** `/config.json` isn't returning a usable `wsUrl` — check `WS_URL` is set in Vercel and the rewrite/function deployed. The client falls back to same-origin when the fetch fails **or** when the response has no usable `wsUrl`; note a misconfigured `WS_URL` still returns HTTP `200` with `{"wsUrl":""}`, which also triggers the fallback — so a `200` does not mean the URL is set.
- **mixed-content blocked:** `WS_URL` must be `wss://` (not `ws://`) for an HTTPS client.
- **healthcheck failing on Railway:** confirm the service listens on `$PORT` (it does by default) and that `/healthz` returns `ok`.

## rollback

- **engine:** Railway → Deployments → redeploy a previous successful deployment.
- **client:** Vercel → Deployments → promote a previous deployment to production.
- the two halves version independently; a client rollback does not require an engine rollback (the wire format is unchanged by this split).
