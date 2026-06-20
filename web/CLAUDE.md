# web

Browser multiplayer client: TypeScript, no bundler, PixiJS isometric renderer talking to the Go engine over a binary WebSocket protocol.

## Public surface
- `index.html` loads `src/main.js` as an ES module; name-form submit calls `start(name)`.
- Runtime WS endpoint comes from `GET /config.json` (`{wsUrl}`); falls back to same-origin `ws(s)://<host>/ws`.
- `web/api/config.ts` is a Vercel function returning `WS_URL` env var; reached via the `/config.json` rewrite in `vercel.json`.

## Layout
- `src/main.ts` — orchestration: form submit → `start()`; builds `{me, others, bounds}`, wires net handlers, runs the PixiJS ticker loop.
- `src/net.ts` — WebSocket wrapper; sends Hello on open, decodes each frame, dispatches to `handlers[msg.type]`.
- `src/wire.ts` — binary codec mirroring `internal/wire/wire.go` (little-endian, int16 positions).
- `src/config.ts` — resolves WS URL (fetch `/config.json` else same-origin).
- `src/input.ts` — WASD/arrows → normalized delta, integrated and clamped to `bounds`.
- `src/render.ts` — PixiJS floor + player tokens, `zIndex = wx+wy` depth sort, camera follow.
- `src/iso.ts` — isometric projection (`KX=0.5`, `KY=0.25`); only camera-angle-aware module.
- `src/pixi-cdn.d.ts` — types the CDN PixiJS import by re-exporting the `pixi.js` types-only dep.

## Patterns
- Game state (`me`, `others`, `bounds`) is mutated in place; net handlers and the loop share the same object references — no re-assignment, no framework.
- Other players interpolate toward the latest snapshot (`rx += (tx-rx)*0.2`); only `me` is locally simulated.
- Input is gated on `me.id !== 0` so no frame streams before Welcome arrives.

## Gotchas
- `src/wire.ts` must stay byte-for-byte in sync with `internal/wire/wire.go`; drift on either side fails the parity tests.
- Go owns the golden fixtures (`web/test/wire_fixtures.json`); regenerate with `go test ./internal/wire -run TestWireFixtures -update`, never hand-edit.
- No bundler: `tsc` type-strips each `.ts` to a sibling `.js`, so imports use `.js` extensions and committed `.js` files are build output.
- PixiJS is imported from a hardcoded CDN URL in `src/render.ts` (`pixi.js@8.19.0`); the `pixi.js` devDep is types-only and its version MUST match the CDN URL.
- `window.__game` (the e2e read hook for live `{me, others, bounds}`) is only set when `window.__E2E` is truthy, injected by an init script before load.
- `resolveWsUrl()` swallows any `/config.json` failure (404/network/bad JSON/missing field) and falls back to same-origin — local dev stays zero-config but a misconfigured `WS_URL` fails silently to the wrong endpoint.

## Dependencies
- Runtime: none (PixiJS via CDN). Dev: typescript, @types/node, @playwright/test, @vercel/node, pixi.js (types only).

## Testing (run from web/)
- Install: `npm ci`  Build: `npm run build`  Watch: `npm run watch`
- Unit: `npm test` (`tsc && node --test test/`)
- E2E: `npm run test:e2e` (Playwright; boots `go run ./cmd/server` on :8080 from repo root).
