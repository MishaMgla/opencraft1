# client (web)

TypeScript source compiled in-place to ESM by `tsc` (no bundler). Emitted `.js` files live beside their `.ts` sources and are gitignored build artifacts. Run `cd web && npm run build` before serving locally (the Go server serves `web/` from disk). PixiJS v8 from CDN (the jsdelivr prebuilt ESM bundle, `https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs` — esm.sh was found to break Pixi v8 extension registration during E2E testing). renders an isometric view of the shared world. The shipped client has **zero runtime npm dependencies**; devDeps are build-time only (`typescript`, `@types/node`, `pixi.js` types, `@vercel/node` types, Playwright).

## modules (`web/src/`)
- `iso.ts` — isometric projection (`worldToScreen`, `depth`). the only place that knows the camera is iso; the server is projection-agnostic.
- `wire.ts` — binary codec mirroring `internal/wire`. **must stay byte-for-byte in sync with the Go side.**
- `net.ts` — WebSocket connect, send Hello/Input, dispatch decoded frames to handlers.
- `config.ts` — resolves the engine WebSocket URL: fetches `/config.json` (served by a Vercel function from `WS_URL` in the split deploy) and falls back to same-origin `ws(s)://${location.host}/ws` (scheme matched to the page) on any failure, so local single-process dev is zero-config.
- `input.ts` — keyboard state → local movement integration (client-authoritative).
- `render.ts` — PixiJS app (loaded from the jsdelivr prebuilt ESM bundle): static iso floor, player tokens (shape + shadow + label), depth-sorted by world position, camera follow.
- `main.ts` — orchestration: name-entry → connect → per-frame loop (move, interpolate remotes, center camera, rate-limited input send). resolves the socket URL via `config.ts` (`resolveWsUrl()`) before connecting. exposes live `{me, others, bounds}` on `window.__game` when `window.__E2E` is set, for the Playwright smoke test (`web/e2e/`); inert otherwise.
- `index.html` — name-entry overlay + top-left HUD + fixed bottom-left GitHub repository link + module entry.

## sharp edges
- remote players are smoothed toward the latest snapshot (`rx += (tx-rx)*0.2`); not time-based interpolation — good enough for MVP.
- input is sent at ~15 Hz as an absolute position; the render loop runs at display refresh.
- WASD moves along world axes, which look diagonal under iso (acceptable for MVP).
- the production engine URL comes from Vercel's `WS_URL` env via `/config.json`; there is no client rebuild on URL change. `web/api/config.js` + `web/vercel.json` wire this up — see `docs/deploy.md`.
