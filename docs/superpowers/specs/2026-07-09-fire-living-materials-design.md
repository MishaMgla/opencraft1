# Fire — living materials on the paint grid

Status: **design approved, not yet implemented** (2026-07-09).

## Summary

Turn the game's static color→material mapping into a **forest-fire cellular
automaton** running in the existing sim tick loop. Lava tiles ignite flammable
neighbours; fire crawls tile-to-tile through grass/flowers; each burning tile
burns out to **ash** (dead, non-flammable). Painting becomes a living tug-of-war
instead of static decoration — the first mechanic where the world acts on its
own between player inputs.

This is **tile-only**: fire never touches players' bodies (no health, no combat
— stays on the right side of the vision's "no combat" non-goal). It adds **no new
player input**: fire is fully emergent from painting, which already exists.

## Why this fits

- The sim (`internal/world/sim.go`) is already a 15 Hz server-authoritative tick
  loop that owns the painted-tile map. A cellular automaton over that map needs
  **no new client authority** — the server runs it and broadcasts results, same
  as it already does for paint.
- Paint colours already map to materials on the client
  (`web/src/render.ts:23-30`): red=lava, green=grass, magenta=flowers,
  blue=water, yellow=sand, orange=copper, purple=crystal, cyan=ice. Fire gives
  those materials *behaviour*.
- Transient one-shot broadcasts are an established pattern here (`SShake`,
  `SJump`). The one new frame (`SFire`) mirrors them exactly.

## Material classes

Server-side classification of the 8 existing palette colours (`sim.go:21-24`):

| Class | Materials (colour) | Behaviour |
|---|---|---|
| **Ignition** | lava (`0xE6194B`) | Never burns. Ignites flammable 4-neighbours. A permanent hazard border. |
| **Flammable** | grass (`0x3CB44B`), flowers (`0xF032E6`) | Catch fire, burn `burnTicks`, become ash. |
| **Firebreak / inert** | sand, water, copper, crystal, ice, **ash** | Never catch, never spread. Fire stops here and at the world edge. |

Flammable is deliberately just vegetation (grass + flowers). Sand/water/stone are
inert firebreaks. Tune the set later if desired.

## Colour = element (accepted trade-off)

Players do **not** choose their paint colour — it's assigned by join order
(`colorFor(id) = palette[id%8]`, `sim.go:26`). So a player's colour *is* their
element: red players are arsonists, green/magenta are gardeners, blue is a
firebreak, the rest are inert. Fully emergent, zero extra scope.

Known limitation: if no lava-coloured player is online, no fires start. Accepted
for the first cut — ship it, see if the rarity actually bites, and only then add
a colour/material picker (a natural follow-up that would make fire fully
controllable and enrich the whole paint system). Not in scope here.

## Server changes (`internal/world/sim.go`)

New sim-goroutine-owned state (same ownership model as `painted` — no locks):

```go
burning map[tileKey]int // tile -> fire-ticks remaining
```

**Constants:**
- `fireTickEvery = 8` — run a "fire tick" every 8 sim ticks (≈ 2×/sec) so flame
  visibly crawls one ring at a time rather than flashing instantly.
- `burnTicks = 3` — fire ticks a tile stays alight before turning to ash.
- `ashColor = 0x3A4757` — reserved sim-generated colour (not in the player
  palette; renders as the client's neutral fallback diamond, see below).

**Material predicates** over a tile's colour: `isLava`, `isFlammable`,
(everything else = inert).

**Ignition — event-driven, inside `paint()`** (no polling):
- After a tile is painted lava → for each flammable 4-neighbour not already
  burning, ignite it (add to `burning` at `burnTicks`, broadcast `SFire`).
- After a tile is painted flammable → if any 4-neighbour is lava or burning,
  ignite the tile itself.

**Spread — a "fire tick"** (every `fireTickEvery` ticks, in the `ticker.C` case):
1. For each tile in `burning`: ignite its flammable, non-burning 4-neighbours
   (add them to a staged set at `burnTicks`, broadcast `SFire` each).
2. Decrement every currently-burning tile's counter; any reaching 0 →
   set `painted[tile] = ash` (broadcast `EncodePaint(..., ashColor, ownerID)`,
   persist via `savePaint`), remove from `burning`.
3. Merge the staged newly-ignited tiles into `burning`.

Neighbours are the 4 cardinal `PaintTileSize`-steps (matching `paintCross`).

**Bound:** work per fire tick is O(|burning|), and every tile burns exactly once
before becoming inert ash, so a fire consumes a connected flammable region and
self-terminates. `// ponytail: O(burning frontier) per fire tick; index burning
by grid cell only if the painted world ever gets huge.`

**Join snapshot:** in-progress fires are transient (~1.5 s) and are **not**
included in the join handshake — a new joiner may miss an active burn but will
see the resulting ash (persisted paint). `// ponytail:` acceptable; add burning
tiles to the snapshot only if fires ever get long-lived.

## Wire changes (`internal/wire/wire.go` + `web/src/wire.ts`)

One new server→client frame, mirroring `SShake`/`SJump`:

- **`SFire` (tag `0x8A`)**: `[tag][tileX int16][tileY int16]` — "this tile just
  caught fire." Client shows a flame overlay on that tile.
- **Ash reuses `SPaint`** (`EncodePaint` with `ashColor`) — no new persist path.
  When the ash paint frame lands, the client clears that tile's flame overlay
  automatically because the tile's colour changed. No "extinguish" frame needed.

Per repo protocol rules: add the encoder + `SFire` tag on the Go side, mirror the
decode in `web/src/wire.ts`, regenerate golden fixtures
(`go test ./internal/wire -update`), and run both suites.

## Client changes (`web/src/render.ts`, `web/src/net.ts`)

- **Decode `SFire`** → mark the tile burning; draw a **procedural** flame overlay
  (pulsing orange/red glow or a few Pixi particles). Deliberately procedural —
  the asset generator rejects animated `effect` assets (see the
  `pixellab-hardening` project note), so no asset is generated for flame.
- **Clear a tile's flame** when a `SPaint` frame changes that tile (ash lands, or
  a player repaints over it).
- **Ash rendering** = the existing neutral fallback diamond (`0x3A4757`,
  `render.ts:451`): an unmapped colour already renders as a dark-grey diamond,
  which reads as ash for free. `// ponytail:` generate a proper halftone
  ash-tile asset later if it wants more polish.

## Out of scope (deliberately)

- Fire affecting players (damage / knockback / respawn) — needs a health/respawn
  system that doesn't exist; crosses the "no combat" line.
- A colour/material picker — the follow-up that would make fire fully
  controllable. Ship colour-as-element first.
- Water actively *dousing* adjacent fire — inert firebreaks already stop spread;
  active extinguishing is a later tuning knob.
- A generated ash tile / generated flame sprite — procedural + fallback for v1.

## Verification

- **Go unit test** (the one runnable check): a `Sim`-driven test that paints a
  grass strip, paints lava at one end, advances enough ticks, and asserts the
  strip becomes ash and a firebreak (water) tile mid-strip stops the spread.
  (Only add tests the user has asked for per repo rule — this spec proposes it;
  confirm before writing.)
- **Browser:** paint a grass field, have a lava-colour player paint into it,
  watch fire crawl and leave ash; confirm water/edge stop it. Verify at
  realistic scale (a flooded painted world), per the repo's at-scale pitfall.
