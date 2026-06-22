# client (web)

TypeScript source compiled in-place to ESM by `tsc` (no bundler). Emitted `.js` files live beside their `.ts` sources and are gitignored build artifacts. Run `cd web && npm run build` before serving locally (the Go server serves `web/` from disk). PixiJS v8 from CDN (the jsdelivr prebuilt ESM bundle, `https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs` — esm.sh was found to break Pixi v8 extension registration during E2E testing). renders an isometric view of the shared world. The shipped client has **zero runtime npm dependencies**; devDeps are build-time only (`typescript`, `@types/node`, `pixi.js` types, `@vercel/node` types, Playwright).

## modules (`web/src/`)
- `iso.ts` — isometric projection (`worldToScreen`, `depth`). the only place that knows the camera is iso; the server is projection-agnostic.
- `wire.ts` — binary codec mirroring `internal/wire`, including movement, role choice on Hello, paint, ult activation, roster/ult state, and shake frames. **must stay byte-for-byte in sync with the Go side.**
- `net.ts` — WebSocket connect, send Hello/Input/Paint/Ult, dispatch decoded frames to handlers.
- `config.ts` — resolves the engine WebSocket URL: fetches `/config.json` (served by a Vercel function from `WS_URL` in the split deploy) and falls back to same-origin `ws(s)://${location.host}/ws` (scheme matched to the page) on any failure, so local single-process dev is zero-config.
- `input.ts` — keyboard state → local movement integration (client-authoritative), plus capture-phase `Space` paint hold/one-shot state and one-shot `E` ult activation.
- `render.ts` — PixiJS app (loaded from the jsdelivr prebuilt ESM bundle): static iso floor, shared painted tile overlays, player tokens (shape + shadow + label), one-shot shake offsets, depth-sorted by world position, camera follow, world-container zoom scaling.
- `main.ts` — orchestration: name/role entry → connect → per-frame loop (move, interpolate remotes, center camera, rate-limited input send). wires top-left HUD zoom buttons to renderer scale without touching page zoom, sends `Space` hold paint requests once per newly entered paint tile, sends `E` ult activation, and renders the roster from server player-state frames. resolves the socket URL via `config.ts` (`resolveWsUrl()`) before connecting. exposes live `{me, others, bounds}` on `window.__game` when `window.__E2E` is set, for the Playwright smoke test (`web/e2e/`); inert otherwise.
- `index.html` — name/role-entry overlay + top-left HUD (status, `Space` paint hint, viewport zoom buttons) + compact player roster HUD + fixed bottom-left GitHub repository link + module entry.

## sharp edges
- remote players are smoothed toward the latest snapshot (`rx += (tx-rx)*0.2`); not time-based interpolation — good enough for MVP.
- input is sent at ~15 Hz as an absolute position; the render loop runs at display refresh.
- `Space` sends one paint request for the local player's current rendered floor tile and, while held, sends one more request each time the player enters a new rendered 128-unit tile. the server chooses the authoritative nearest tile center and decides whether charge should advance, so idle key repeat and same-tile requests do not farm ult charge. paint/shake visibility comes back through server broadcasts rather than local-only prediction. the key handlers run in capture phase so focused HUD controls cannot consume the key first.
- `E` sends an ult activation request. readiness and progress are displayed from server `SPlayer` frames in the roster (`ready` or `n/12`), not predicted client-side.
- HUD `+`/`-` controls scale the Pixi world container in 10% steps from 50% to 150%; this is renderer presentation only, not browser zoom or protocol state.
- WASD moves along world axes, which look diagonal under iso (acceptable for MVP).
- the production engine URL comes from Vercel's `WS_URL` env via `/config.json`; there is no client rebuild on URL change. `web/api/config.js` + `web/vercel.json` wire this up — see `docs/deploy.md`.
