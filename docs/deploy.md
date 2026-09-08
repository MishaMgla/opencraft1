# deployment runbook

## Current production — fixed avatars and compact chat (2026-09-09)

Live at **https://opencraft1.com/**. Source commit `c391533a98c52f9ed7a608b95ed03848e3984fa6`
was fast-forwarded and pushed to `main`. Railway deployment
`0be1ef35-2136-468e-b3a6-1c1ebf41e33b` is online in the production service below.
It was built from an allowlisted `git archive` of that exact commit, staged at
`/tmp/opencraft-release.ytHiCt`; no env files, repository metadata or root legacy
Railway configuration were uploaded. Image digest:
`sha256:c2adc91ec169e68ac08b2ae8b3d3f0002db07bbbb3a8fa540f6cad663918bf41`.

This release adds five procedural body families, versioned stable appearance,
one-time legacy guest choice, and compact/expanded chat. [API, migration and
local checks](project-map/evolving-preview.md#доработка-2026-09-09).
Public entry remains direct HTTPS 200 without Basic authentication.

Verified after deployment: hosted smoke; production HTML/CSS/four client modules
match the tested files; new browser guest joins by WebSocket, moves with compact
chat open, stops while typing, sends with input focus retained, and returns to
the same guest and saved message. Two pre-release test guests retained their
seeds and v1 recipes; keeping one and upgrading the other consumed their rights,
and repeat changes returned 409. Test guests and one browser test message remain.
GitHub runs `34292543200` (tests) and `34292543145` (Vercel alias deployment) passed.
Temporary local app processes and the local test DB were stopped; its volume remains.

Rollback must retain recipe v2 support and consumed-choice state. Do not roll
back to the v1 binary listed in the historical section after v2 guests exist:
it cannot render them faithfully. Keep added columns and saved seeds. A compatible
fix-forward or compatible prior image is required. Database restoration and
real-phone keyboard/performance verification remain outstanding; evolution is
still unimplemented. Railway GitHub auto-deploy remains disconnected; the legacy
root `railway.json` is not the production build source.

## Initial production cutover — historical (2026-09-08)

The user explicitly authorized replacing production, then rejected the external
redirect and shared password. **https://opencraft1.com/** now serves the game
directly (HTTP 200), with no Basic authentication. The existing Railway service
serves HTML, local assets, HTTP API and WebSocket on that same origin. Creating
a guest only requires the in-game name; cookie ownership, exact-origin checks
and write validation remain. This is still an early build, not a claim of
completed evolution or public-service hardening.

- Project: `1b8ea81a-5e3b-43e0-bd07-8b8d181aac53`.
- Production environment: `d25afc26-9021-46cc-b7f6-1b079c09d075`.
- App service: `4ea90048-d5f6-46ad-b16c-c5a1b6f72cf5`; direct-domain deployment `ae93ea7f-1238-4f27-b56d-50036b885ee2`.
- New private DB service `world-db`: `a48d4b61-a13b-4878-8d2e-61dd479bcc47`; volume `5ca289f5-7afb-49c5-bf3d-4059960d0a50`, mounted at `/var/lib/postgresql/data`.
- Railway custom domains: apex `acd678ca-5699-4333-b878-fec0d5c15fe2`, www `3b195ac5-76ed-4d42-8b00-0d4372f53bab`; target port 8080.

DNS remains managed by Vercel. Explicit apex ALIAS `eaial9ul.up.railway.app`
(`rec_b9104ee5f8e7bd0aa1eeac11`) overrides its default Vercel route. `www` CNAME
is `aubz5x74.up.railway.app` (`rec_01be81092e92831e46a418ed`); the app redirects
www to the canonical apex. Railway verification TXT records exist at
`_railway-verify` and `_railway-verify.www`; keep them for verification/renewal.
Both domains have working HTTPS. Root `/` serves HTML, not a redirect to
`/evolving/`; that old path still works. Asset URLs are absolute.

Verified after cutover: root HTTPS 200 without Location/WWW-Authenticate; hosted
smoke passed without credentials; a clean browser opened the canonical URL,
created a guest, received the WebSocket welcome and loaded the saved chat.
Go test/vet and whitespace checks passed. Vercel alias-only deployment is
`dpl_BcJztVnFmZ85ohM4EBWAsp6QG1LK`. No database was reset during this correction.

Use `Dockerfile.preview` and its Dockerfile-specific allowlist. These internal
filenames and `PREVIEW_*` variables remain for compatibility; they do not mean
the deployment targets a preview environment. `PREVIEW_PUBLIC_ORIGIN` is the
exact `https://opencraft1.com` origin, `PREVIEW_DATABASE_HOST=world-db.railway.internal`,
and the DSN references `${{world-db.POSTGRES_PASSWORD}}`. Database and role remain
`opencraft_preview`. The old Supabase `DATABASE_URL` is preserved but not read by
this entrypoint. The new production DB starts independently; preview guests and
history were not migrated or deleted. Cookie identity does not transfer domains.
`PREVIEW_ACCESS_PASSWORD` is no longer read; no password is needed by the hosted
smoke check. The old Railway hostname is not the public entry and fails the
exact-host guard. Do not send players there.

Repeat the allowlisted staging procedure in [the scene runbook](project-map/evolving-preview.md),
but pass the production IDs above to `railway up`. The workspace CLI is now
linked to production; still use explicit IDs. Validate with
`node web/tools/check-evolving-hosted.mjs production`, then browser join/chat.
The smoke check leaves one named guest, and the browser check left one test
message. No local game server is needed for a deploy. Browser return through
opencraft1.com restored the same guest and saved message. Both preview app and
preview PostgreSQL deployments are stopped; their volume remains intact.

Vercel aliases use prebuilt Build Output API v3: one route `/(.*)` returning
307 to the canonical `https://opencraft1.com/`, with `Cache-Control: no-store`.
They are not on the canonical domain's request path after the DNS change.
The same alias redirect is recorded in `web/vercel.json`. Railway's old GitHub source
was disconnected to prevent the old `main` from redeploying the legacy game.
No commit/push was performed. Reconnect GitHub only after the production build
configuration and this implementation are in that branch. Existing CI files
below describe the legacy path, not an already migrated autonomous workflow.

Legacy rollback also requires restoring the original Vercel DNS route by removing
only the two explicit traffic records identified above (not the domain or zone).
Then restore Railway deployment `e8e8d3a7-2f4d-484c-aec7-00564035ccea`
with its original `ALLOWED_ORIGINS` for the Vercel domains, then promote Vercel
deployment `dpl_7YURN6L4tHaC2FNwc2SFs8Q6FWnv`. Keep the new DB and volumes; neither
a release rollback nor a restart requires deleting data. Backup restoration and
long-lived connection stability remain unverified.

## Historical split client/server runbook

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
