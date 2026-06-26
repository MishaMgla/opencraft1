# PixelLab Asset Generation — Design

**Status:** approved (brainstorming) — ready for implementation plan
**Date:** 2026-06-26
**Area:** agent flow (`.github/`), web client (`web/`)

## Problem

opencraft1 renders everything procedurally: the PixiJS client draws floor
diamonds, shape+shadow player tokens, and colored paint diamonds. There are
**zero image assets** in the repo. We want an issue author to be able to
request game graphics — a tile, a character, a HUD element, an effect — and
have that request turn into committed, rendered pixel art through the existing
issue → spec → impl → auto-merge pipeline, using the [PixelLab.ai](https://www.pixellab.ai/)
generation API.

## Decisions (locked during brainstorming)

1. **Build-time, in the Dev agent.** Generation happens during `dev-implement`,
   not at game runtime. The generated PNG is committed and reviewable in the
   impl PR. No runtime API keys, no hot-path latency, bounded cost (one
   generation per issue).
2. **All four asset types** from the first cut: `tile`, `character`, `hud`,
   `effect`. The generation tooling is shared; per-type cost is mostly renderer
   plumbing.
3. **A committed CLI script**, not the PixelLab MCP server. Deterministic,
   auditable, everything it does shows up in the PR diff — matches how this repo
   already works (committed scripts, deterministic gates).
4. **Structured asset block in the PM spec.** The PM agent emits an explicit
   `## Asset Generation` block (type/name/prompt/size/directions). The Dev agent
   executes it mechanically. The one irreversible/creative decision (the prompt)
   lands in the spec-review gate *before* credits are spent.
5. **Additive named registry with procedural fallback.** A generated asset is
   registered under a name (`tile:stone`, `character:knight`); it does **not**
   auto-replace the global look. The renderer gains the *ability* to render from
   the manifest, with the current procedural draw as default/fallback. Turning
   an asset on globally (e.g. "all players use the knight skin") is a small
   follow-up issue. A bad generation can never visually break the merged game.

## Background: PixelLab v2 API

- Base URL `https://api.pixellab.ai/v2`. Auth: `Authorization: Bearer <token>`.
- **Asynchronous**: generation endpoints return a `job_id`; poll
  `GET /background-jobs/{job_id}` until the result URL/bytes are ready.
- Relevant endpoints:
  - `POST /create-image-pixflux` — single pixel-art image from a prompt.
  - `POST /create-character-with-4-directions` (and `-8-directions`) — one image
    per cardinal facing.
  - `POST /create-tileset` — multi-tile terrain set (out of scope v1; see below).
  - `POST /animate-with-text` — frame animation from an action description.
- Output: transparent PNG, 16×16–512×512 depending on model. Credit-priced,
  roughly $0.002–$0.185 per call by output size.

## Architecture

### 1. Flow

```
Issue ("players should be knights")
  → pm-intake: PM recognizes a graphics ask, drafts spec WITH an
       ## Asset Generation block (type/name/prompt/size/directions)
  → spec PR (prompt reviewable here, before any credits spent)
  → dev-implement: Dev agent runs `node web/tools/gen-asset.mjs ...`,
       which calls PixelLab, commits PNG(s) + updates manifest,
       then wires the renderer to reference the new named asset
  → gates (validate manifest + files; NO live API calls in CI)
  → impl PR (generated art visible in the diff) → auto-merge
```

### 2. Asset storage & manifest

- Committed PNGs under `web/assets/{tiles,characters,hud,effects}/`.
- `web/assets/manifest.json` — the additive named registry the renderer reads.
  The CLI upserts entries; the renderer is the only reader.

```json
{
  "version": 1,
  "assets": {
    "tile:stone":       { "type": "tile", "file": "tiles/stone.png", "size": 128,
                          "prompt": "mossy grey stone floor tile", "issue": 42 },
    "character:knight": { "type": "character", "directions": 4, "size": 64,
                          "frames": { "south": "characters/knight-south.png",
                                      "north": "characters/knight-north.png",
                                      "east":  "characters/knight-east.png",
                                      "west":  "characters/knight-west.png" },
                          "prompt": "armored medieval knight", "issue": 51 },
    "hud:healthbar":    { "type": "hud", "file": "hud/healthbar.png",
                          "prompt": "pixel art health bar", "issue": 60 },
    "effect:sparkle":   { "type": "effect", "fps": 12,
                          "frames": ["effects/sparkle-0.png", "effects/sparkle-1.png"],
                          "prompt": "sparkle burst", "issue": 63 }
  }
}
```

Asset keys are `"<type>:<name>"`. Nothing is auto-activated — the manifest is
*capability + asset*, and the procedural look is the default/fallback.

### 3. Generation CLI — `web/tools/gen-asset.mjs`

- Node, **zero runtime deps**, global `fetch`. Reads `PIXELLAB_API_KEY` from env.
- Invocation:
  ```
  node tools/gen-asset.mjs --type <tile|character|hud|effect> \
      --name <slug> --prompt "<text>" \
      [--size N] [--directions 4|8] [--frames N] [--force]
  ```
- Type → endpoint:

  | type        | endpoint                              | output            |
  |-------------|---------------------------------------|-------------------|
  | `tile`      | `/create-image-pixflux`               | one tile PNG      |
  | `character` | `/create-character-with-4-directions` | one PNG/facing    |
  | `hud`       | `/create-image-pixflux` (transparent) | one UI PNG        |
  | `effect`    | `/animate-with-text`                  | N frame PNGs      |

- Behavior: POST → `job_id` → poll `GET /background-jobs/{job_id}` with backoff
  until complete (5-minute timeout) → download image(s) → write PNG(s) into the
  per-type dir → upsert the manifest entry (stable, sorted output for clean
  diffs).
- **Idempotent**: if the asset key already exists, skip and exit 0 unless
  `--force` is passed — so Dev-agent reruns and quota-recovery resumes do not
  re-spend credits.
- **Size caps** enforced in the CLI: tiles/hud ≤ 128, character ≤ 64 per
  direction, effect frames ≤ 12. Bounds per-call cost.
- **Failure**: non-zero exit with a clear message on API error / poll timeout /
  cap violation, so the Dev agent surfaces it on the PR rather than committing a
  half-baked asset.

> **Two endpoint mappings to firm up in the plan.** (a) `tile` uses single
> `pixflux` image generation; full `/create-tileset` autotiling is out of scope
> for v1. (b) `effect` uses `/animate-with-text`, which may require a base
> image — if so, the CLI first generates a base frame via `pixflux`, then
> animates it. Default to the simplest single-call form; document the fallback.

### 4. Renderer changes (`web/src/`)

- **New `assets.ts`** — loads `manifest.json` once, lazily loads PixiJS textures
  via `Assets.load`, and exposes:
  - `getTileTexture(name)` → `Texture | null`
  - `getCharacterTextures(name)` → `{ south, north, east, west } | null`
  - `getEffectFrames(name)` → `Texture[] | null`
  - `getHudAsset(name)` → `string | null` (image URL)

  Each returns null/empty when the asset is absent → the caller falls back to the
  current procedural draw. Malformed manifest entries are logged and skipped.
- **Tile** (`render.ts`): where a floor diamond / paint overlay is drawn, if a
  tile name resolves in the manifest, draw a textured `Sprite` anchored at the
  128-unit tile center; otherwise the existing solid diamond.
- **Character** (`render.ts`): the player-token render gains the ability to draw
  a directional skin — facing chosen from the movement vector — when one is
  active. v1 ships the capability with **no skin active by default** (shape token
  remains). Global activation is a follow-up.
- **HUD** (`index.html` / `main.ts`): a HUD slot swaps in an `<img>` sourced from
  the manifest when present (HUD is a DOM overlay, not canvas).
- **Effect** (`render.ts`): a one-shot frame-animation player hooked into the
  existing one-shot event path (the same plumbing as the screen shake), playing a
  named effect's frames at a world position.

No wire-protocol change: assets are client-only static files loaded over HTTP,
so `internal/wire` and `web/src/wire.ts` are untouched in v1.

### 5. Agent-flow wiring (`.github/`)

- **PM prompts** (`prompts/pm-system.md`, `prompts/pm-draft-spec.md`): recognize
  graphics asks and emit the `## Asset Generation` block with
  type/name/prompt/size/directions. Add "graphics/asset requests are in product
  scope" to `AGENT_RULES.md` so the product-scope guardrail does not redirect
  them.
- **Dev prompt** (`prompts/dev-*.md`): when a merged spec contains an
  `## Asset Generation` block, run `node web/tools/gen-asset.mjs …` with those
  params, verify the PNG(s) and manifest update, wire the renderer reference,
  then run the gates.
- **Secret**: `PIXELLAB_API_KEY` added to the self-hosted runner and exposed to
  the codex step env in `dev-implement.yml`. Documented in `docs/agents-setup.md`.

### 6. Gates / testing (no credits in CI)

- Generation runs **only** inside `dev-implement`, never in `run-gates.sh`.
  Gates validate the committed result, not the API: manifest matches schema, and
  every file the manifest references exists on disk.
- Unit tests with a **mocked `fetch`** (no network): type→endpoint mapping, arg
  parsing + cap enforcement, manifest upsert (idempotency + `--force`), and the
  poll-until-complete loop. Plus a manifest-schema validator test.
- The existing Playwright smoke must still pass with an empty/asset-free manifest
  (proves the procedural fallback). One fixture asset asserts a manifest tile
  renders as a `Sprite`.

### 7. Error handling

- CLI: non-zero exit + actionable message on API error, poll timeout, or cap
  violation; the Dev agent reports it on the PR.
- Renderer: missing / failed-to-load / malformed asset → procedural fallback,
  never a crash. Bad manifest entries are skipped and logged.

## Out of scope (YAGNI for v1)

- Runtime / live in-game generation.
- Auto-activating a skin or tile globally (each is a tiny follow-up issue that
  flips one manifest entry on).
- Multi-tile autotiling tilesets (`/create-tileset`).
- Inpainting, rotation, image-conversion endpoints; in-app animation editing.

All of the above are clean follow-ups on the same generation tooling and
manifest.

## Success criteria

- A graphics issue produces an impl PR containing the generated PNG(s), an
  updated `manifest.json`, and renderer wiring — auto-merged on green gates.
- The CLI never re-spends credits on a rerun of an already-generated asset.
- With an empty manifest, the game renders exactly as it does today (procedural
  fallback intact); a populated manifest renders the named asset.
- No PixelLab call happens in CI gates; the only live call is in `dev-implement`.
