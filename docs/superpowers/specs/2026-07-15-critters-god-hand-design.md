# Critters + God-Hand Design

Status: Approved (design debated with Codex gpt-5.6-terra high, 2 rounds; all findings incorporated)
Date: 2026-07-15

## Summary

Small NPC **critters** that live off painted terrain, plus a Dungeon Keeper-style **god-hand**: players click a critter, carry it with the cursor, and drop it; the world reacts to where it lands. Adds interactivity and an idle "the world lives without you" layer. No win condition.

Design inspiration: Populous / Dungeon Keeper hand-of-god. Scope: one critter kind, carry-only (no throw physics), transient population.

## Server (sim)

### Model

- New sim-goroutine-owned `critters` map id→critter, transient like `bombs`/`burning`, **never persisted**. After a restart the world repopulates from terrain.
- Critter fields: `id uint32`, `kind byte`, position (int16 world coords), `state`, `holderID` (0 = unheld), per-state timers.
- Global cap **40**, and an explicit live cap `critterCount ≤ livingTileCount` (living tile = painted grass `0x3CB44B` or flowers `0xF032E6`). The count-based cap is authoritative — grabbing a critter off the only living tile must NOT open a spawn slot.

### Spawn

- When a valid living tile first exists and the pool is empty, spawn the **first critter immediately** (no dead-looking cold start).
- Thereafter every ~60 ticks (~4 s): if below both caps, pick a random **unoccupied** living painted tile and spawn a critter there. No living tiles → no spawns.

### Behavior state machine

Decisions every 4 ticks (~0.27 s); **position advances at fixed speed every sim tick** (no 3.7 Hz teleport-jitter). States:

- `wander` — short random drift segments; prefers living tiles; avoids lava, fire, water, world edge, temple (same blocked-tile check as players).
- `follow` — a player standing within ~1.5 tiles for ≥3 s attaches the critter; it trails at ~half a tile. Detaches when the player moves beyond ~6 tiles, leaves, or is **KO'd**.
- `panic` — 2–3 s fast flee away from the trigger, then back to `wander`.
- `held` — in a player's hand. **Mutually exclusive with `follow`** (attaching clears following and vice versa). Position handling per platform below.

### Despawn (habitat failure)

- When the living-tile count transitions **nonempty → empty**, start a global grace timer (~10 s); if habitat returns (any living tile painted) the timer is **cancelled**. When it expires, all non-held critters despawn.
- The timer only starts on the transition — a critter spawned while habitat exists is never killed by a stale pre-existing grace window.
- Ties fire into the ecology: burning the last grass/flowers empties the world of critters. No hunger, no breeding.

### Drop reactions (exact tile rules)

All rules are tile/point rules against the existing painted-tile lookup and temple geometry:

- Drop into temple footprint or out of bounds → project to nearest valid point outside.
- Onto/adjacent to fire or lava tile → `panic`.
- Onto water → splash; pick a safe (non-water, non-lava, non-fire, non-temple) cell in the **local 3×3**; none available → `panic` in place. No unbounded nearest-dry search.
- Within follow-attach radius of another player → `follow` switches to them.
- Onto grass/flowers → content `wander`.

### Held lifecycle

Release the held critter (drop in place, then normal drop reactions) on **every** invalid-holder transition, before the player state changes: holder KO'd, holder disconnects, holder leaves. One critter per hand: `player.heldCritterID` (0 = none); a grab while already holding is rejected.

## Wire protocol

Client→server (continuing numbering after `CChat` 0x08):

- `CGrab` 0x09 — `critterID uint32`. Server validates: critter exists, unheld, player alive, player not already holding, critter within ~4 tiles of the player. Conflicts resolved by sim command channel ordering.
- `CHold` 0x0A — `(x, y)` cursor world position, ~15 Hz while holding (desktop only). No critterID — the server knows what this player holds. Clamped to world bounds and to a radius around the holder. Stale `CHold`/`CDrop` from a player holding nothing is ignored.
- `CDrop` 0x0B — `(x, y)` drop position; server applies drop reactions.

Server→client:

- `SCritters` 0x90 — full snapshot: count + per critter `{id uint32, kind byte, x int16, y int16, state byte, holderID uint32}` — 14 bytes/entity, ~570 B at cap. Sent every 2nd tick (~7.5 Hz).
  - The join handshake carries one reliable `SCritters` (same reliable path as the painted world).
  - Broadcast path: **latest-only snapshot slot** per connection — a newer `SCritters` replaces the queued one instead of stacking in the FIFO, so self-superseding snapshots can never evict non-superseding event frames (Enter/Leave/paint/KO/bomb/fire).

Snapshot-not-events rationale: new joiners and laggy clients are always consistent; no per-critter enter/leave/move bookkeeping; a lost frame is superseded by the next.

Security note (accepted limitation): player positions are client-authoritative, so grab proximity and follow attachment are spoofable. Acceptable **only while critters confer no score, resource, or PvP advantage**. If critters ever grant anything, grab validation must stop trusting client positions.

## Client

### Rendering

- Critters render as mini-sprites (~half character height), same depth-sort and `rx += (tx-rx)*0.2` smoothing as remote players.
- Held critter drawn lifted (y-offset; ground shadow stays under it).
- Pointer cursor over a critter.

### Hand input — desktop

`pointerdown` on a critter → `CGrab`; after the server ack (critter appears held by me in `SCritters` / grab confirmation), the critter renders **directly under the cursor locally** (local prediction); `pointermove` → `CHold` at ~15 Hz; `pointerup` → `CDrop`. Remote viewers see the interpolated snapshot positions.

### Hand input — mobile

No continuous `CHold`. First tap on a critter grabs it; while held, its position is **server-derived**: authoritative holder position + fixed above-player offset, recomputed every sim tick (not a frozen point, not follower behavior). Second tap on the ground sends `CDrop` at that position. Tap-to-move is suppressed while holding (the ground tap is the drop, not a destination).

### Assets

- One critter kind at launch (`kind` byte reserved for more, no format change needed).
- Generated via the existing `gen-asset.mjs` / nano-banana slop-style pipeline: 4 ordinal facings, `--no-background`, no baked shadow (renderer grounds by alpha), ~half character height. No walk cycle — reuse the presentation-only fallback trot.
- Missing asset → procedural fallback token, per the standard `assets.ts` contract.

## Product loop (v1)

A settled critter occasionally converts its current **grass tile to flowers** (a normal `SPaint`; **never awards ult charge**). One-way for v1 — gives players a reason to place and rescue critters (visible habitat history), and fire removing habitat closes the loop. Add flower decay only if persistent flower saturation proves visually bad.

## Tests

- Go `internal/wire`: encode/decode `CGrab`/`CHold`/`CDrop`/`SCritters` + regenerate golden fixtures for JS parity.
- Go sim: spawn only on unoccupied living tiles; explicit `critterCount ≤ livingTileCount` cap holds when a critter is grabbed off its tile; immediate first spawn; wander avoids lava/temple; grab→hold→drop cycle; double-grab rejection; **one-hand-only** (second grab while holding rejected); **stale hold/drop ignored**; **KO releases held critter**; follow detaches on KO; auto-drop on disconnect; panic on fire; follow switching; **water drop with no safe 3×3 cell → panic in place**; **temple/edge drop projection**; **despawn grace starts only on nonempty→empty transition and cancels on habitat return**; grass→flowers conversion never charges ult.
- Web `node --test`: parity for the new frames via golden fixtures.
- E2E: critter appears in snapshot; grab/drop via the `window.__game` hook. Plus one Go test proving a **saturated lossy queue** still recovers critter state via the latest-only slot without evicting event frames.

## Non-goals (deferred)

Breeding/population dynamics, critter persistence, multiple kinds, throw-arc physics, harming critters, critter×bomb interactions, flower decay, any critter-granted score/resource.
