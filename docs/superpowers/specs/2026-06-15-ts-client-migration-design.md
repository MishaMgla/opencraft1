# typescript migration of the web client — design

**status:** approved, pre-implementation
**date:** 2026-06-15
**scope:** `web/` client only. the Go engine (`cmd/`, `internal/`) is untouched.
**revises one constraint** from `2026-06-14-split-deployment-design.md`: that spec listed *"no build toolchain on the client."* this migration intentionally introduces a single `tsc` compile step. it does **not** introduce a bundler — the client stays vanilla ES modules served as individual files.

## problem

The `web/` client is vanilla JavaScript (`web/src/*.js`, ES modules, no bundler). The operator prefers TypeScript. We want real `.ts` source with full type-checking, without abandoning the project's deliberate zero-dependency / no-bundler design and without touching the Go engine, the deploy topology, or the wire protocol.

The defining constraint: the Go server serves the client verbatim via `http.FileServer(http.Dir("web"))` (`internal/server/server.go:54`), and `web/index.html` loads `./src/main.js`. Both local dev and the Playwright e2e suite (`go run ./cmd/server`) load `web/src/*.js` straight from disk. **The browser must therefore find `.js` files in `web/src/`.** Browsers cannot execute `.ts`.

## decisions (locked)

| decision | choice | rationale |
|---|---|---|
| approach | **`tsc` type-strip, no bundler** | full `.ts` source; `tsc` emits plain ESM 1:1; keeps the zero-dep / no-bundler ethos. |
| output model | **emit `.js` in place into `web/src/`, gitignored** | the Go `FileServer`, `index.html`, `playwright.config.js`, and Vercel static serving all stay unchanged — they keep seeing `web/src/main.js`. |
| tests | **run on emitted `.js`** (compile, then `node --test`) | identical test semantics; no Node version bump; no experimental flags. preserves the Go↔JS golden parity check. |
| node version | **stays 20** | tests run on compiled `.js`, so native type-stripping (Node 22+/24) is not needed. |
| Pixi types | **`pixi.js` as a types-only devDep + ambient `.d.ts` shim for the CDN URL import** | the runtime import stays the jsDelivr URL; only types come from npm. |
| `api/config.js` | **migrate to `api/config.ts`** | Vercel compiles TS functions natively; keeps the client one language. |
| migration granularity | **file-by-file via `allowJs: true`** | each module can land and pass CI independently; no big-bang cutover. |

## non-goals

- **No bundler / no minification / no npm runtime deps.** Pixi stays a CDN import; the client ships as individual ES module files.
- **No engine, wire-protocol, or deploy-topology changes.** `internal/wire/wire.go`, the golden fixtures, the Railway/Vercel split, and `vercel.json` rewrites are untouched except for adding `buildCommand`.
- **No new test cases** (per `AGENT_RULES.md` "no unsolicited tests"). Existing suites are ported to run against the compiled output; the cross-language golden test is preserved, not extended.
- **No `web/dist/` re-rooting.** Emit-in-place was chosen specifically to avoid changing the Go server / index.html / Vercel output dir.

## architecture

```
web/src/*.ts  ──tsc (1:1, no bundle)──▶  web/src/*.js  (gitignored build artifact)
                                              │
   index.html  ──<script src="./src/main.js">─┘   ← unchanged
                                              │
   served by:  Go http.FileServer(web)  (local + e2e)   ← unchanged
               Vercel static (prod)      ← buildCommand:"tsc" added
```

`tsc` is a pure type-strip: source is restricted to erasable syntax so every `.ts` maps to one structurally-identical `.js`. No specifier rewriting — source already uses `.js` import specifiers (`./net.js`), which are correct for both TS resolution and browser ESM.

### output model detail

- `tsconfig.json` `rootDir` and `outDir` both = `src`, so `wire.ts` → `wire.js` beside it.
- `.gitignore` gains `web/src/*.js` (and `web/api/*.js`). The `.js` files are never committed — they are produced by `tsc` before any browser loads them.
- the lone exception to watch: nothing else in `web/src/` is a hand-authored `.js` after migration, so the blanket ignore is safe.

## tooling

### `web/tsconfig.json`
- `module: "esnext"`, `moduleResolution: "bundler"`
- `target: "es2022"` (matches modern evergreen browsers + the CDN Pixi build)
- `strict: true`
- `verbatimModuleSyntax: true` — import/export elision is predictable; no injected helpers
- `erasableSyntaxOnly: true` — forbids enums / namespaces / param-properties, guaranteeing emit is a clean type-strip
- `allowJs: true` — enables incremental migration (un-migrated `.js` still type-checked loosely)
- `outDir: "src"`, `rootDir: "src"`

> exact option names/behaviors (esp. `erasableSyntaxOnly`, `verbatimModuleSyntax`, and Vercel's static-project `buildCommand` semantics) to be re-verified against current docs (Context7) during the implementation-plan phase.

### `web/package.json`
- add `devDependencies`: `typescript`, `pixi.js` (types only)
- scripts:
  - `"build": "tsc"`
  - `"watch": "tsc --watch"` (local dev convenience)
  - `"test": "tsc && node --test test/"`
  - `"test:e2e"` unchanged (the e2e job builds first)

### Pixi type shim
`render.ts` imports from the jsDelivr URL at runtime. Add an ambient declaration (e.g. `web/src/pixi-cdn.d.ts`) declaring `module 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs'` that re-exports from `pixi.js`, so the URL import is typed without changing the runtime specifier.

## build & CI integration

- `web/vercel.json`: add `"buildCommand": "tsc"`. `vercel build` installs devDeps and runs it, producing `web/src/*.js` into the static output. The `/config.json` rewrite and `git.deploymentEnabled:false` are unchanged.
- `.github/workflows/test.yml`:
  - **web** job: `npm ci` then `npm test` (which compiles + runs unit tests). a type error fails the job — this is the new gate.
  - **e2e** job: add `npm run build` before `npx playwright test` so the Go server has `web/src/*.js` to serve.
- `.github/workflows/deploy-client.yml`:
  - **test** job (the deploy gate): `npm ci` + `npm test` instead of bare `node --test`.
  - **deploy** job: unchanged — `vercel build` now runs `tsc` via `buildCommand`.

## cross-language protocol parity (must not regress)

`web/test/wire.test.js` validates the JS protocol mirror against `web/test/wire_fixtures.json`, which Go's `TestWireFixtures` generates/checks. After migration, `wire.ts` → `wire.js` is what the test loads, so the same golden check still guards against `wire.ts` drifting from `internal/wire/wire.go`. The fixtures file and the Go side are untouched.

## migration order

`allowJs: true` lets each step land green independently:

1. `wire.ts` — highest type value, protected by the golden test.
2. `iso.ts`, `config.ts` — leaf modules, no internal deps.
3. `net.ts`, `input.ts` — depend on `wire`/`config`.
4. `render.ts` — Pixi types + the CDN shim land here.
5. `main.ts` — the entry; ties the typed modules together.
6. `test/wire.test.ts` (+ any other `web/test/*.js`).
7. `api/config.ts`.

`scripts/build-index.ts` already exists as an in-repo TS pattern to mirror for tsconfig/style conventions.

## local-dev change (the one ergonomic cost)

Running the engine locally to view the client now requires `tsc` first so `web/src/*.js` exist:

```
cd web && npm run watch    # in one terminal (or `npm run build` once)
go run ./cmd/server        # in another — serves web/ as before
```

This will be documented in `web/package.json` scripts and the deploy/dev docs. Engine-only work (`go test ./...`) is unaffected.

## risks / edge cases

- **stale `.js` artifacts locally.** mitigated by `tsc --watch`; a stale-output footgun only if someone edits `.ts` and runs the server without rebuilding. document the `watch` script.
- **Vercel static `buildCommand`.** must confirm a no-framework ("Other") Vercel project runs `buildCommand` and still serves the web root with the emitted `.js`. verify in the plan phase before touching `vercel.json`.
- **`erasableSyntaxOnly` availability.** requires a recent TypeScript (5.8+). pin the `typescript` devDep accordingly.
- **gitignored `.js` + `allowJs`.** during the incremental window, both `foo.ts` and a stale committed `foo.js` could coexist; each migration step must delete the old committed `.js` in the same commit that adds `foo.ts`, before the ignore rule masks it.
