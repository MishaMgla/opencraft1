# agent rules

single source of truth for rules and documentation pointers shared by all AI coding agents working in this repository.

> **scaffold status.** this repo is an early scaffold — most code does not exist yet. sections marked _(pending stack)_ are placeholders to fill in once the codebase lands. do not invent rules to fill them; add a rule when the code it governs exists.

## how this doc works

- this file holds all shared rules. `CLAUDE.md` and `AGENTS.md` at the repo root are thin pointer stubs that link here and must not contain rules of their own.
- when adding or changing a rule: edit this file. touch the root stubs only if the pointer or purpose line itself changes.
- when adding or changing architecture or code behavior: update the matching `docs/project-map/*` doc in the same change. see [documentation maintenance protocol](#documentation-maintenance-protocol).
- keep `CLAUDE.md` and `AGENTS.md` in sync. they are intentionally near-identical. divergence is a bug.

## important rules

- **use Context7 MCP** to fetch up-to-date docs for any library, framework, or API task (`mcp__context7__resolve-library-id`, `mcp__context7__query-docs`).
- **use Web Search** when Context7 is insufficient or info needs to be current.
- **ask clarification questions** if requirements are unclear, before proceeding.
- **no unsolicited tests.** do not add or update automated tests (unit, integration, e2e) unless the user explicitly asks for test work.
- **environment & secrets.** keep secrets in `.env` or `.env.local`; never commit credentials. document new env vars in `.env.example`.

## product scope (PM guardrail)

### in-game language (confirmed 2026-09-10)

All game-authored, player-facing text must be in English: entry screens,
buttons, labels, placeholders, tooltips, accessibility names, help, statuses,
errors, notifications, and generated world/artifact names and stories.
This applies to existing and future game content on every platform, regardless
of the player's browser language or the language used to discuss the project.
Preserve player-authored names and messages as written; do not translate or
restrict them. Project discussions and planning documents may remain in Russian.
Earlier Russian UI examples in planning docs are historical, not approved copy
for implementation. Recording this rule does not mean existing UI is translated.

**Evolving-world planning (2026-09-06).** For the new player-driven world,
start at `docs/prd/evolving-world-product-plan.md`, then read the scenario or
visual/UX document linked there. On 2026-09-07 the user authorized implementation
of the first isolated 3D scene. On 2026-09-08 the user authorized deploying it
for remote testing, then explicitly requested replacing production on the same
day. Deploy the new scene directly to the existing Railway production service;
the separate preview is no longer the release target. Preserve both legacy and
preview data. The public entry must stay at `https://opencraft1.com/`, without a
Railway redirect or shared Basic password; guest-cookie ownership remains required.
This workspace is a VDS accessed over SSH. Local servers
are for temporary tests only; stop them after checks and share the hosted URL.
See `docs/project-map/evolving-preview.md` for the implemented slice and limits;
the wider planning documents do not imply that evolution is already implemented.
The new direction is mobile-first low-poly 3D inspired by TempleOS, with
generative geometry independent of a required image-generation service or
manual modeling tool. Distinguish confirmed direction, proposed details, and
historical discussion. The existing-build guidance below is not the visual
brief for that new direction.

issues are for **changing or improving the game** within the product vision
(`docs/vision.md`) — features, fixes, balance/tuning, polish, and additive layers
that build on the existing engine. this is a **product** guardrail, separate from
the security classifier (which handles spam / abuse / injection / malicious code).

- **in scope:** anything that extends or improves opencraft1 as it is — new
  gameplay surface, rendering/UX, netcode, persistence, an additive roadmap layer,
  bug fixes, performance, polish. graphics/asset requests (a tile, character, or
  hud element) are explicitly in scope — the PM drafts an `## Asset Generation`
  block and the Dev agent generates the art via `web/tools/gen-asset.mjs`. do not
  redirect these as teardown or pivot. (animated `effect` assets are not yet
  supported — the generator rejects them; see `.github/prompts/pm-draft-spec.md`.)
- **out of scope (do not spec):** "start over" asks — rebuild or rewrite the
  project from scratch, wipe or mass-delete the codebase, swap opencraft1 for a
  different product/genre, or otherwise turn it into a different project. partial
  rewrites that serve a concrete in-scope improvement are fine; teardown for its
  own sake is not.
- **handling is soft and kind.** an out-of-scope ask is not abuse — never close,
  lock, or label it as such. instead the PM **redirects**: affirm the underlying
  interest, explain that opencraft1 grows additively on its engine rather than by
  teardown, and offer ONE concrete, game-improving alternative the author can say
  yes to (anchor it to `docs/vision.md` / `docs/prd/mvp.md`). if the author then
  narrows to an in-scope request, proceed normally.

## coding style & naming

- **backend:** Go 1.23. format with `gofmt`; vet with `go vet ./...`. package layout: `cmd/<binary>` for entrypoints, `internal/<pkg>` for engine packages. lower_snake file names, idiomatic Go exported/unexported naming.
- **client:** vanilla ES modules under `web/src/`, no bundler. PixiJS v8 imported from CDN. `camelCase` functions, one responsibility per module file.

## visual style (house art direction)

**Scope:** the following describes the existing 2D build. For evolving-world
planning, use `docs/prd/evolving-world-visual-ux.md`; its user-approved low-poly
3D direction supersedes this legacy style for the proposed new experience.
Do not infer that the new renderer or asset-generation approach is implemented.

opencraft1's chosen visual identity is **dataset-poison AI-slop** (the
`dataset-poison-extra-limbs` style picked from the nano-banana style exploration
in `moodboard/`). Every generated asset — tile, character, or hud — is rendered
in this style so the world stays cohesive. The generator is **nano-banana**
(Google Gemini 3.1 Flash Image, "Nano Banana 2") via the **OpenRouter Image
API** (`web/tools/nanobanana.mjs`).

**the tool applies the style — pass a plain subject.** `gen-asset.mjs` wraps
`--prompt` in the house style automatically based on `--type`, so the prompt is a
**bare subject only** — no style words, no suffix. (this overrides the older
"append a halftone suffix" and the even older "no style words" guidance.)

**figure-ground rule (important).** characters and props must POP; ground tiles
must RECEDE. The wrapper differs by type:

- **characters / hud — BOLD slop.** wrong objects fused into the body (car
  parts, branches, ghost label text) and too many hallucinated limbs at wrong
  angles; flat off-register poster art, not photoreal. these are the foreground,
  they grab the eye. rendered on a green screen and knocked out to transparency.
- **ground tiles — QUIET poison-accent.** seamless, flat, low-contrast, muted
  sickly greens/purples with subtle AI-slop grain, no bold outlines — so tiles
  sit BEHIND the cast. a tile that competes for attention is a bug; regenerate.

- **palette is free per subject.** the slop is a *technique*, not a fixed
  palette — grass is green, lava is red. the wrapper governs how it renders
  (chaotic bold slop for foreground, muted seamless grain for ground).
- **seamless tiles.** ground tiles must tile without a visible seam. generate,
  then verify with `python3 web/tools/seamcheck.py <tile.png>` (edge mismatch
  < 25 reads seamless); if it won't roll seamless after a few tries, run
  `python3 web/tools/wrapblend.py <tile.png>` (a deterministic 4px edge
  cross-fade) to close the seam.
- **characters.** always `--facings ordinal` (four ISO diagonals:
  `north-east`/`south-east`/`south-west`/`north-west`) — the facings that read
  under the iso camera. `--animate walk` synthesizes the walk cycle locally from
  those four stills. strong silhouette, no baked ground shadow.
- **reference.** the chosen-style sheet and the full style comparison are in
  `moodboard/` (see `moodboard/README.md` for the index); the winning prompts
  are in `moodboard/style-exploration-nb2-gpt/round8/prompts.json`. the character
  generation pipeline and seamless-tile tooling are documented in
  `docs/character-generation-pipeline.md`.

## testing layout

- **Go engine:** standard `*_test.go` alongside the package under test (`internal/<pkg>/<name>_test.go`); table-driven where it fits. run with `go test ./...`. Integration-style tests may drive a package's public API directly (e.g. `world` tests start a `Sim` goroutine and read its `out` channels).
- **web client (unit):** TypeScript, type-stripped to ESM by `tsc` (no bundler). run `cd web && npm test` (compiles, then runs `node --test test/*.test.js test/*.test.mjs`, compatible with Node 20 and 24). The legacy client uses PixiJS from a CDN; the evolving scene serves pinned Three.js locally. Tests stay in `web/test/`.
- **cross-language protocol parity:** `internal/wire/wire.go` and `web/src/wire.ts` are hand-mirrored. the shared golden vectors in `web/test/wire_fixtures.json` are **generated by Go** (`go test ./internal/wire -update`) and validated by **both** suites — Go asserts its encoders still produce those bytes, the TS client asserts its decoder/encoder agrees. after any wire-format change: update both sides, run `-update`, commit the regenerated fixtures, and run both suites.
- **browser e2e (smoke):** one Playwright spec in `web/e2e/*.spec.js` covers the load → join → move path. Playwright's `webServer` boots the real `go run ./cmd/server` and drives headless Chromium against it. it reads live client state via a `window.__game` hook in `web/src/main.ts` that is inert unless an init script sets `window.__E2E`. deliberately a smoke test: it proves the browser→server **wiring** (module load, pixi.js CDN load, WebSocket handshake, input loop) — not protocol/logic correctness, which the unit suites own. run with `cd web && npm run test:e2e` (needs `npx playwright install chromium` once).
- scope **unit** tests to engine logic (wire, grid, sim); do not unit-test the websocket plumbing or the pixijs render/input layers. that wiring is covered end-to-end by the browser smoke test above rather than by unit tests.

## commit & pull request guidelines

- concise, imperative commit messages; keep related changes together.
- for PRs, describe the affected surface, link related issues, and include screenshots for UI changes.

## documentation maintenance protocol

- before changing routes, APIs, shared UI, auth, services, tooling, or shared types, read the matching `docs/project-map/*` doc first.
- when a change alters behavior, architecture, integrations, commands, or verification workflow, update the affected `docs/project-map/*` file in the same change.
- when rules change, edit this file. root stubs `CLAUDE.md` and `AGENTS.md` only need touching if the pointer or purpose line changes — keep them in sync.
- when you ship something that changes project-map structure (a leaf doc added/removed/renamed, an index format change) or a notable feature, prepend a one-line entry to the `## changelog` section in `docs/project-map/README.md`.

## development commands

- `go build ./...` — compile everything.
- `go vet ./...` — static checks.
- `go run ./cmd/server` — run the game server on `:8080` (serves `web/` + the `/ws` endpoint).
- `PORT=9090 go run ./cmd/server` — run on a custom port (Railway injects `PORT` in prod).
- `ALLOWED_ORIGINS=opencraft1.vercel.app go run ./cmd/server` — run with the prod WS origin allowlist (empty = allow all, dev default).
- `docker build -t opencraft1-engine .` — build the engine image used by Railway.
- `cd web && npx tsc --noEmit` — type-check the client without emitting (no bundler; `npm run build` emits the sibling `.js`).
- `go test ./...` — run the Go engine tests.
- `cd web && npm test` — type-check + run the web client unit tests (compiles TS, then runs Node's test runner on the emitted JS).
- `cd web && npm run build` — type-strip `web/src/*.ts` → sibling `.js` (required before running the Go server locally, which serves `web/`).
- `cd web && npm run watch` — same as build, in watch mode for local dev.
- `cd web && npm run test:e2e` — run the browser smoke test (boots the Go server + headless Chromium; needs `npx playwright install chromium` once).
- `go test ./internal/wire -update` — regenerate the shared Go↔JS protocol golden fixtures after a wire-format change (then run both suites).

## deployment & environment

split deployment: static client → Vercel, Go engine → Railway. full runbook in `docs/deploy.md`.

| var | side | meaning |
|---|---|---|
| `PORT` | engine | listen port; Railway injects it (default `8080`). |
| `ALLOWED_ORIGINS` | engine | comma-separated WS origin host patterns; empty = allow all (dev). set to the Vercel host(s) in prod. |
| `WS_URL` | client (Vercel) | `wss://` engine endpoint returned by `/config.json`, e.g. `wss://<service>.up.railway.app/ws`. |

config files: `Dockerfile` + `railway.json` (engine), `web/vercel.json` + `web/api/config.ts` (client). document new vars in `.env.example`.

runtime config bridge (client): the browser fetches `/config.json`, which `web/vercel.json` rewrites to the `web/api/config.ts` serverless function; that function returns `{ wsUrl: WS_URL }`. `web/src/config.ts` (`resolveWsUrl()`, called from `web/src/main.ts`) consumes it, falling back to same-origin `ws://<host>/ws` when `/config.json` is absent (local single-process dev). this is two halves of one mechanism — do not mistake `web/api/config.ts` and `web/src/config.ts` for duplicate/dead config.

## common pitfalls

patterns that have actually bitten in this repo. read before doing similar work.

- **never send connection-critical frames through the lossy `send()` path.** `send()` (in `internal/world/sim.go`) drops the *oldest* queued frame when a player's `out` channel (cap 64) is full. The join handshake — Welcome + one Paint per persisted tile + Enters — was streamed through it before any writer drained the channel, so once the persisted painted world grew past ~64 tiles the Welcome frame was evicted; clients rendered the tiles but never learned their id, so movement and Space-paint were dead (issue #55 follow-up). Initial state is now returned by `Sim.Join` and written reliably on the connection goroutine; only ongoing/lossy updates use `send()`.
- **verify against realistic, at-scale state — not just the empty/default world.** This bug was invisible locally and in tests because both spawn into an *empty* world at the lattice-aligned legacy spawn point (2048). The buffer overflow only appears with >64 persisted tiles, and the issue-#55 alignment math (floor vs. round) only differs *off* a tile center — yet every test placed the player exactly on one. When a change touches join-time volume, fixed-size buffers, or coordinate snapping, add a test that exercises the non-default case (a flooded world, an off-lattice position) and confirm the feature end-to-end in the browser, not just that the suite is green.

add to this list when something bites. keep each entry to one line of rule + one of context.

## project-map pointer table

start at `docs/project-map/README.md`, then load the subtree doc relevant to the task:

| task area | read this |
|---|---|
| repo overview | `docs/project-map/README.md` |
| project-specific terms / acronyms | `docs/project-map/glossary.md` |
| evolving-world plan / current planning context | `docs/prd/evolving-world-product-plan.md` |
| evolving-world implementation sequence / reuse and readiness | `docs/prd/evolving-world-implementation-plan.md` |
| isolated evolving-world 3D preview / hosted test and local checks | `docs/project-map/evolving-preview.md` |
| mobile shells / shared transport / build and device gates | `docs/project-map/mobile.md` |
| evolving-world player flow / evolution lifecycle | `docs/prd/evolving-world-first-session.md` |
| evolving-world low-poly 3D / generative forms / UI | `docs/prd/evolving-world-visual-ux.md` |
| original product vision | `docs/vision.md` |
| MVP product requirements | `docs/prd/mvp.md` |
| MVP engine architecture (technical design) | `docs/superpowers/specs/2026-06-11-opencraft-mvp-engine-design.md` |
| Go engine (server / sim / wire / grid) | `docs/project-map/server.md` |
| web client (render / net / input) | `docs/project-map/client.md` |
| PM/Dev agent system (workflows, prompts, permissions) | `docs/project-map/agents.md` |

> as subsystems land, add one row per leaf doc (e.g. `app architecture`, `service / lib layer`, `API routes`, `shared UI`) pointing at its `docs/project-map/*` file.
