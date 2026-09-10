# project map

navigation hub for AI agents. mirrors the source tree. each leaf doc describes one folder: purpose, key files, dependencies, sharp edges. **target ≤ 150 lines per leaf, hard cap ~250.**

> the source tree exists; leaf docs cover the Go engine (`server.md`) and the web client (`client.md`). as new subsystems land, add one leaf doc per folder, register it in the `tree` and `task → doc` table below, and add a row to the pointer table in `AGENT_RULES.md`.

## how to read

1. read `AGENT_RULES.md` first — it has the rules and the pointer table.
2. find the leaf doc for your task in the table below.
3. load only that leaf. avoid loading the full tree.

For the evolving-world concept, start with `../prd/evolving-world-product-plan.md`.
It routes to the player scenario and visual/UX brief and distinguishes confirmed
direction from proposals. The first implemented, separately hosted 3D slice is documented
in `evolving-preview.md`; the full evolving world is not shipped behavior.
The original vision and subsystem docs remain context for the existing build.

## tree

```
docs/project-map/
  README.md              # this file
  glossary.md            # project-specific terms (empty until the domain emerges)
  server.md              # Go engine (cmd + internal packages)
  client.md              # web client (web/ modules)
  evolving-preview.md    # isolated 3D scene, hosted test and current limits
```

## task → doc

| task area | leaf |
|---|---|
| repo overview | `README.md` |
| terms / acronyms | `glossary.md` |
| evolving-world plan / current planning context | `../prd/evolving-world-product-plan.md` |
| evolving-world implementation sequence / reuse and readiness | `../prd/evolving-world-implementation-plan.md` |
| isolated evolving-world 3D preview / hosted test and local checks | `evolving-preview.md` |
| evolving-world scenario / evolution lifecycle | `../prd/evolving-world-first-session.md` |
| evolving-world low-poly 3D / generative forms / UI | `../prd/evolving-world-visual-ux.md` |
| original product vision | `../vision.md` |
| MVP product requirements | `../prd/mvp.md` |
| MVP engine architecture (technical) | `../superpowers/specs/2026-06-11-opencraft-mvp-engine-design.md` |
| Go engine (server, sim, wire, grid) | `server.md` |
| web client (render, net, input) | `client.md` |
| deploy (Vercel client / Railway engine) | `../deploy.md` |

> add a row per leaf doc as subsystems land.

## changelog

- 2026-09-10: English-only game copy and `en-GB` chat dates, preserving player-authored content; language rule in `AGENT_RULES.md`, implementation/release record in `evolving-preview.md#english-interface--2026-09-10`.
- 2026-09-09 (production, main `9ce13dd`): speech above the actual avatar, marked local echo, one-row composer and opt-in history. Live cursor continues while reading; transient actor IDs prevent duplicate-name confusion. Local/public checks and CI passed; deployment `66faa4f5-a50b-41b7-85dc-b45c22f58241`, release record in `../deploy.md`.
Reverse-chronological. Tracks doc-structure changes and shipped feature milestones. When a branch is named, the work has not merged to `main` yet. New entries go on top; one line per entry; dates are absolute (YYYY-MM-DD).

- 2026-09-09 (production, main `f9d5df1`): transparent chat overlay and one composer/control row; fixed game viewport, expanded dates, accessible touch targets and message-anchored reading position. Local/public checks and CI passed; deployment `faf2a148-e2b5-414f-9d60-859cf58c64bc`, release record in `../deploy.md`.
- 2026-09-09 (production, main `a323b38`): simplify the avatar chooser, collapse storage information, center/fit preview bodies between header and form, repair detached body joints without changing saved seeds or choice rights. Four-viewport/five-family browser regression, production checks and CI passed; deployment `b720ecd4-de34-4827-a474-1f638a10c26d`, release record in `../deploy.md`.
- 2026-09-09 (production, main `c391533`): versioned procedural bodies, atomic one-time choice for legacy guests, compact/expanded chat with preserved drafts and reading position. API v2 guards old clients; local checks, GitHub CI and hosted browser/legacy-transition checks passed. Deployment `0be1ef35-2136-468e-b3a6-1c1ebf41e33b`; release and rollback limits in `../deploy.md`.
- 2026-09-08 (production entry fix): connect opencraft1.com directly to Railway with HTTPS, serve the game at `/`, remove shared Basic auth, keep guest ownership/CSRF checks; update the hosted smoke check to reject redirects/password prompts.
- 2026-09-08 (production): deploy the evolving 3D scene to the existing Railway production service with a new private database; redirect opencraft1.com to it. Preserve legacy/preview data, stop the preview app, disconnect old Railway GitHub auto-deploy; current runbook and rollback in `../deploy.md`.

- 2026-09-08 (separate test deployment): user authorized remote testing; deploy preview app and private PostgreSQL in Railway `evolving-preview`, with HTTPS/password gate and guest-authenticated sockets. Production unchanged; local preview processes stopped. Runbook in `evolving-preview.md`.
- 2026-09-08 (local implementation, not deployed): add isolated PostgreSQL guest ownership, idempotent committed chat, numeric cursor history and disconnect/graceful-shutdown position saves; document browser/outage/restart checks and remaining limits.
- 2026-09-07 (local implementation, not deployed): add isolated empty-preview sim/entrypoint, locally served procedural Three.js avatars, keyboard/stick movement and live chat. Reuse existing transport; disable legacy actions and obstacles. At this initial slice there was no durable history/auth/evolution.
- 2026-09-07 (planning only): add one consolidated evolving-world implementation plan grounded in current client, server, storage and agent workflow; separate proposed reuse, staged acceptance and release prerequisites. No code, infrastructure or deployment changes.
- 2026-09-06 (planning only): add evolving-world product plan, player scenario and low-poly 3D visual/UX brief with phone wireframes; link the planning context for agents and scope the prior art direction to the existing build. No gameplay implementation or deployment.
- 2026-07-15 (follow-up): landmarks pass 2 — the four free-projection buildings read alien (wrong axonometry, inconsistent scale), so the set is reduced to ONE guided building: `gen-landmark.mjs` now composes a 2:1 iso base-diamond + player-sprite scale reference and generates img2img, locking the projection to the game camera and the door to player height; renderer keeps the crop aspect (no square squash).
- 2026-07-15: replace the blurry 3×3 temple with four **soviet-eclectic landmarks** in the slop house style (2×2 panelka-deity with arms from windows on the old temple spot, 2×1 panelka-temple with onion dome + space mosaic, 1×1 carpet-facade GASTRONOM khrushchevka-altar, 1×1 kiosk/panelka/stalinka totem), generated at native res via new `gen-landmark.mjs` (transparent, no baked ground — fixes the upscale blur); server + client generalize the single temple footprint to a shared `landmarks` table (collision/paint/fire/bomb/critters unchanged in behavior).
- 2026-07-15 (branch `critters-god-hand`): add transient **critters** (habitat-capped spawn pool, wander/follow/panic/held FSM, hazard/temple avoidance, grass→flowers conversion, habitat-empty despawn) and **god-hand** grab/hold/drop (`CGrab`/`CHold`/`CDrop`), broadcast every 2nd tick via `SCritters` (0x90) through a new per-connection latest-only snap slot that never evicts event frames, plus a reliable snapshot in the join handshake. Client renders critters as half-scale tokens, adds desktop cursor carry (server-confirmed) and mobile two-tap grab/drop. Verified: Go 55 tests, web 42 unit + e2e (incl. `SCritters` → `window.__game.critters` end-to-end, skips when the joining player's palette color isn't flammable).
- 2026-07-14 (branch `chat-and-minimal-ui`): add **global ephemeral chat** and restyle the whole UI/HUD to a flat **thin-line / mono** minimalist system. Chat: new wire frames `CChat` (0x08) / `SChat` (0x8F, name+text), server-side trim + 200-rune cap + per-player ~0.5s rate limit, broadcast to all incl. sender (server echo, no local echo); client log (last 6 lines, fading) + input, with game keys (WASD/Space/F/E/B) suppressed while any text field is focused. UI: rewrite `ui.css` to hairline borders + monospace + one accent over the dark base, drop the nano-banana healthbar HUD asset for text ult status, and simplify `index.html`. Removed jump is deferred. Verified: Go 39 tests, web 38 unit + 3 e2e (incl. chat round-trip through the real server).
- 2026-07-13 (branch `codex/issue-143-research-game-mechanics`): add one animated permanent 3×3 temple northeast of spawn, with client/server collision, fully blocked paint/fire/bomb interactions, blast-arm occlusion, and a deterministic missing-art fallback (issue #143).
- 2026-07-12 (branch `codex/issue-140-hud-style`): replace legacy retro-pixel DOM chrome with the flat, irregular house presentation across entry, HUD, help, roster, profile, mobile controls, and repository link, and show registered sprite previews in both character pickers (issue #140).
- 2026-07-12 (branch `codex/issue-142-fire-mechanics`): refine fire burnout so spent flammable tiles become temporary ash for about 1 second, then replicate a tile clear and delete the persisted paint entry instead of leaving permanent ash terrain (issue #142).
- 2026-07-09: add **PvP elimination (Bomberman Increment 2)** — a bomb blast now KOs any live player standing on it (1 hit = out); the dead become a dimmed, frozen ghost (input ignored server-side), respawn at spawn after ~4s, and blast **kills** show in the roster (☠ column). Self-kills eliminate but credit nobody. New frames `SKO` (0x8D), `SRespawn` (0x8E); `SPlayer` gains a `kills` byte. Movement is client-authoritative so respawn carries the position for the local player to adopt (like Welcome). Verified end-to-end (Go driver: kill+credit+respawn+self-kill; browser: `me.alive` flips + token ghosts). Remaining: Increment 3 (crystal walls + collision).
- 2026-07-09: generate + wire real **pixel-art assets** for the fire/bomb layer (PixelLab, house Halftone-Comic style): `ash-tile` (pale, seamless quiet ground — replaces the gray fallback diamond for burned/destroyed terrain) and `bomb` (transparent fuse-bomb sprite — replaces the procedural disc). `render.ts` uses each texture when loaded and keeps the procedural draw as fallback. (Fire now renders via the animated `fire` effect already on main, so the single-frame `fire` prop from this branch is superseded.) Verified in-browser: assets serve + load, ash renders on bombed terrain.
- 2026-07-09: add **bombs (Increment 1 of the Bomberman-like)** — press `B` to drop a fused bomb that explodes in a `+` cross (range 2), destroying painted terrain to ash and igniting flammable tiles (reuses the fire automaton), chain-detonating other bombs in the blast. Server-owned like fire (transient, never persisted); ~2.5s fuse; max 2 live bombs per player. New frames `CBomb` (0x07), `SBomb` (0x8B), `SBlast` (0x8C). No player harm yet — elimination/respawn/score is Increment 2, walls+collision is Increment 3. Spec: `docs/superpowers/specs/2026-07-09-bombs-pvp-elimination-design.md`.
- 2026-07-09: add **fire** — a forest-fire cellular automaton over the painted map. Lava tiles ignite flammable neighbours (grass, flowers); fire crawls one ring per fire step (every 8 sim ticks) and each burning tile turns to inert **ash** after 3 steps; water/sand/stone and the world edge are firebreaks. Tile-only (no player effect), zero new input (emergent from painting — a player's paint colour is their element). One new transient wire frame `SFire` (0x8A); ash reuses `SPaint`. Client draws a procedural pulsing flame overlay and renders ash as the neutral fallback diamond. Spec: `docs/superpowers/specs/2026-07-09-fire-living-materials-design.md`.
- 2026-07-08 (branch `codex/issue-137-character-shake-foreign-tile`): stop applying avatar shake presentation when players enter foreign painted tiles while preserving shared paint, ult, movement, roster, and jump behavior (issue #137).
- 2026-07-08 (branch `codex/issue-134-character-sprites`): add browser-local character selection for the four `create-character-pro` cast members, send the chosen character through join/presence state, and render selected ordinal walk-cycle skins for local and remote players (issue #134).
- 2026-07-06 (branch `codex/issue-116-mobile-support`): add tap-first mobile controls with tap-to-move destinations and touch action buttons for paint, jump, and ult while preserving desktop keyboard controls (issue #116).
- 2026-07-02 (branch `codex/issue-111-cell-tiles-stitch`): hide unintended stitch lines between adjacent painted terrain tiles with seam-safe texture masks and fallback diamonds while preserving tile placement, paint color mapping, and gameplay behavior (issue #111).
- 2026-07-02 (branch `codex/issue-110-loader-on-website-start`): show a startup loader for saved-username auto-join until the server welcome arrives, avoiding a welcome-form flash for returning users while falling back to the normal entry form on startup failure (issue #110).
- 2026-07-02 (branch `codex/issue-107-tiles-cells-outline`): remove visible outlines from base world cells, painted tile overlays, and missing-asset fallback diamonds while preserving existing tile size, placement, color mapping, and gameplay behavior (issue #107).
- 2026-06-28 (branch `codex/issue-101-space-key`): split the control bindings so `Space` jumps, `F` paints/changes cell color with the existing hold-to-paint behavior, and the HUD `?` help popover documents `Space`/`F`/`E` controls (issue #101).
- 2026-06-28 (branch `codex/issue-102-tiles-graphics`): render the eight shared paint colors as generated terrain tile graphics (lava, grass, sand, water, copper, crystal, ice, flowers) while keeping the previous colored diamond as the missing-asset fallback (issue #102).
- 2026-06-28 (branch `codex/issue-97-horse-animations`): extend the character asset contract for ordinal walk cycles so horse animation frames preserve the iso diagonal facings (`north-east`/`south-east`/`south-west`/`north-west`) instead of reverting to cardinal side/front/back views (issue #97).
- 2026-06-28 (branch `fix/issue-92-horse-iso-diagonal`): actually fix the horse for the iso view (issue #92 follow-up) — add PixelLab 8-direction support so characters generate the four DIAGONAL ordinal facings (`gen-asset.mjs --facings ordinal`), and ground skinned characters in the renderer (auto-detect feet row + drop the procedural shadow) so they no longer hover with a doubled shadow. Supersedes the earlier relabel-only attempt below.
- 2026-06-27 (branch `codex/issue-92-sprite-graphics-direction`): regenerate the horse character asset and document the four-slot isometric character-facing contract for future graphics requests (issue #92).
- 2026-06-27 (branch `codex/issue-83-graphics-horse`): render all players as generated four-direction horse characters with movement-facing and presentation-only walk motion, falling back to procedural tokens if the asset is unavailable (issue #83).
- 2026-06-23 (branch `codex/issue-71-game-graphics`): restyle the full client presentation with a sharp retro-symbolic world, HUD, roster, entry flow, and profile modal while preserving gameplay behavior (issue #71).
- 2026-06-23 (branch `codex/issue-75-jump-functionality`): add a multiplayer-visible, cosmetic one-shot jump on fresh `Space` presses while preserving existing `Space` paint and hold-to-paint behavior (issue #75).
- 2026-06-23 (branch `codex/issue-72-game-field-size`): double the playable world bounds from 4096×4096 to 8192×8192 while keeping viewport/HUD behavior unchanged (issue #72).
- 2026-06-23 (branch `codex/issue-68-save-username`): persist the browser-local username, auto-join saved users on reload, and add a top-left profile modal for local username edits (issue #68).
- 2026-06-22 (branch `codex/issue-62-issue-59-retro-and-explanation`): add player-facing issue-59 mechanics guidance to the welcome overlay and README, covering role choice, Pulse/Cross/Trail effects, ult charge/activation, hold-to-paint, and roster progress (issue #62).
- 2026-06-22 (branch `codex/issue-59-player-roster-and-ults`): add role selection, player roster HUD, non-combat Pulse/Cross/Trail ults charged by normal painting, `E` ult activation, and hold-to-paint while moving (issue #59).
- 2026-06-22 (branch `fix/join-handshake-tile-flood`): deliver the join handshake (Welcome + painted world + Enters) reliably instead of through the lossy `send` path — a painted world past the 64-frame buffer was evicting Welcome, so clients rendered tiles but never learned their id and paint/movement were dead (issue #55 follow-up).
- 2026-06-22 (branch `codex/issue-55-cell-color-changing-alignment`): align `Space` paint targeting with the rendered isometric floor tile under the player's feet (issue #55).
- 2026-06-21 (branch `codex/issue-52-verify-test`): restore hardened Space paint input handling and add regression coverage for shared paint replay plus one-shot shake behavior (issue #52).
- 2026-06-21 (branch `codex/issue-42-game-viewport`): add subtle top-left HUD viewport zoom buttons plus an always-visible `Space` paint hint (issue #42).
- 2026-06-21 (branch `codex/issue-43-space-paint-shake`): add session-scoped shared tile painting on `Space` plus one-shot avatar shake when players enter another player's painted tile (issue #43).
- 2026-06-21: add a minimal fixed bottom-left GitHub repository link over the web game viewport (issue #37).
- 2026-06-20 (branch `chore/cruft-audit-cleanup`): PM product-scope guardrail — the PM agent now softly redirects "start over" issues (rebuild from scratch, wipe the codebase, pivot to a different project) toward a concrete game-improving alternative instead of drafting a spec, and never closes/locks them (that stays the security classifier's job). Rule in `AGENT_RULES.md` ("product scope"); new redirect mode in `self-audit.md` + `pm-system.md`, backstop in `pm-draft-spec.md`; intake `ACTION` line updated.
- 2026-06-19: repo cruft audit — removed the dead Next.js-oriented index generator (`scripts/build-index.ts`) and its empty `docs/project-map/index/` output (the repo is Go + vanilla TS, not a Next.js App Router tree), purged accidentally-committed `.playwright-mcp/` session dumps (now gitignored), refreshed this file's stale "no source tree yet" boilerplate, and added `Status:` headers to historical plans/specs.
- 2026-06-16: add engine `/version` endpoint — returns deployed commit SHA and build timestamp as JSON, with Railway Docker builds stamping metadata via ldflags.
- 2026-06-15: make current-map player visibility global — server snapshots now include every connected player, movement no longer hides players by grid distance, and leave events fire on disconnect/session exit.
- 2026-06-15: web client migrated to TypeScript (tsc type-strip, no bundler; emitted `.js` are gitignored build artifacts). Local dev/e2e now require `cd web && npm run build` first.
- 2026-06-14: split deployment (branch `split-deployment`) — static client → Vercel, Go engine → Railway. client resolves the engine `wss://` URL at runtime via `/config.json` (Vercel function from `WS_URL`, `web/api/config.js` + `web/vercel.json`), falling back to same-origin so local dev is unchanged. engine reads `PORT`, adds `/healthz`, and gates WS origins on `ALLOWED_ORIGINS` (allow-all when unset). adds `Dockerfile`, `railway.json`, `.env.example`, and the `docs/deploy.md` runbook. no wire-format or engine-logic change.
- 2026-06-12: add browser e2e smoke test — one Playwright spec (`web/e2e/game.spec.js`) drives load → join → move against the real `go run ./cmd/server`, reading client state via a `window.__game` hook in `web/src/main.js` (inert unless `window.__E2E`). adds the `e2e` job to `.github/workflows/test.yml` and a Playwright devDependency in `web/package.json`. covers the browser→server wiring (module/pixi load, ws handshake, input loop) the unit suites can't see.
- 2026-06-12: add MVP test suite — Go tests for `wire`/`grid`/`sim` (incl. integration tests driving the `Sim` goroutine) + JS `node --test` protocol-parity tests, both validating shared golden fixtures (`web/test/wire_fixtures.json`, generated by `go test ./internal/wire -update`). add `.github/workflows/test.yml` (go + web) and fill in the `testing layout` section of `AGENT_RULES.md`.
- 2026-06-11: implement MVP engine — Go tick server (`cmd/server`, `internal/{wire,world,server}`) + pixijs isometric client (`web/`). add `server.md` / `client.md` leaf docs.
- 2026-06-11: define the product — opencraft1 is a multiplayer browser isometric world. add `docs/vision.md`, `docs/prd/mvp.md` (MVP: shared-world movement + presence), and `docs/superpowers/specs/2026-06-11-opencraft1-mvp-engine-design.md` (Go engine: single-process tick server + grid interest management, pixijs client, binary protocol). seed glossary product/technical terms.
- 2026-06-11: add PM/Dev agent system (`.github/` workflows + `docs/project-map/agents.md`).
- **2026-06-11** — installed AI-docs scaffolding (thin `AGENTS.md`/`CLAUDE.md` stubs, `AGENT_RULES.md` single source of truth, `docs/project-map/` hub + glossary + index, `scripts/build-index.ts` generator), mirroring the contentos pattern. No leaf docs yet — repo is a pre-code scaffold.
