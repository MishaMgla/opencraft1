# Bombs & PvP elimination (Bomberman-like)

Status: **Increments 1–2 shipped; Increment 3 (walls) pending** (2026-07-09).
Inc 2 verified end-to-end: a Go driver (kill+credit, self-kill-credits-nobody,
respawn-at-spawn) and a browser drive (server `koPlayer` fires on the blast tile;
client `me.alive` flips false and the token ghosts to 0.35 alpha; roster shows
the ☠ kill count). `go test ./...` + `cd web && npm test` green. Inc 1
verified end-to-end via a throwaway public-API driver (bomb detonates, cross
destroys terrain to ash, flammable arms ignite, a second bomb chain-detonates
before its own fuse); `go test ./...` + `cd web && npm test` green, `go vet` +
`tsc --noEmit` clean.

## Summary

A Bomberman-like layer on the engine: players drop **bombs** that fuse, then
explode in a `+` cross that destroys terrain (reusing the fire automaton) and
**eliminates players** caught in the blast; the dead respawn after a few seconds
and blast **kills** show in the roster. **Crystal** tiles are indestructible
**walls** that block both the blast and movement, so players build mazes
emergently by painting.

Shape decisions (chosen): **emergent + always-on + no arena** — PvP happens
everywhere in the persistent shared world, mazes are player-painted, score is
lifetime kills. No lobby/round/match system.

## Accepted ceilings (honest, by design)

- **Cheatable.** Movement is client-authoritative (players report their own
  position, no server collision). A determined client can lie about position to
  dodge a blast or walk through a wall. Fine among real players; the vision's
  server-authoritative **hardening step** is the real fix and stays deferred.
- **Griefable.** Always-on PvP means a player can camp-bomb newcomers. Cheap
  mitigations if it bites (not built yet): brief respawn invulnerability, a
  no-bomb radius around spawn.

## Build order — three increments, shipped separately

### Increment 1 — Bombs & terrain destruction (no player harm) — CURRENT

Almost pure reuse of the fire automaton. Fully playable/verifiable alone.

- **Input:** drop a bomb — desktop `B` (one-shot, mirrors `Space`/jump). New
  client frame `CBomb` (tag `0x07`, 1 byte). (Mobile button deferred to a
  follow-up; note it.)
- **Bomb** = sim-owned entity (like fire): placed on the actor's paint tile,
  `bombFuseTicks` fuse (~2.5 s = 38 ticks at 15 Hz), `maxBombsPerPlayer` (2) cap,
  one bomb per tile. Broadcast `SBomb(tile, ownerID)` (tag `0x8B`) on placement.
- **Detonation** (fuse hits 0): a `+` blast, `bombRange` (2) tiles each cardinal
  direction, arms clipped at the world edge (walls clip in Increment 3). Per
  blast tile: **flammable → ignite** (reuse `ignite()`); other **painted →
  ash** (destroyed, broadcast/persist via the existing ash `SPaint`); empty
  ground → flash only. Broadcast `SBlast(center, 4 arm lengths)` (tag `0x8C`) for
  the explosion flash.
- **Chain reaction:** a blast tile holding a live bomb detonates it immediately
  (worklist, guarded by removal-on-detonate so nothing double-fires).
- **Client:** send `CBomb` on `B`; render a procedural ticking **bomb** (dark
  disc + pulsing fuse) until its `SBlast`; on `SBlast` draw a brief cross
  explosion flash (reuse the flame draw) and remove the bomb sprite. Ash/fire
  arrive as the normal `SPaint`/`SFire` frames already handled.

### Increment 2 — Elimination, respawn, score

- Player state gains `alive bool`, `kills int`, and a respawn deadline (1 hit =
  out — classic Bomberman; the minimal "health" system).
- At detonation, any live player whose **reported position** lies on a blast tile
  is KO'd → `SKO(victimID, killerID)`. Client ghosts the victim + death fx; the
  killer's `kills++` rides the existing `SPlayer` roster frame.
- **Respawn** after ~4 s at spawn → `SRespawn(id)` un-ghosts. While dead: input
  ignored server-side, cannot be hit again, renders as a faded ghost.
- You **can** die to your own bomb (fair + funny); a self-kill credits no kill.

### Increment 3 — Walls & the maze (emergent, client-side collision)

- **Crystal** (`0x911EB4`) = hard wall: blast arms stop **before** it (survives),
  and it blocks **movement** (client-side collision in `input.ts` — can't step
  onto crystal). Indestructible. All other painted tiles stay destructible → ash.
- Walls are player-painted (crystal = the wall-builder element), so mazes emerge
  with no arena system. Honest ceiling: client-side collision, so a cheating
  client can ignore walls.

## Wire additions

Client→server: `CBomb` (`0x07`). Server→client: `SBomb` (`0x8B`), `SBlast`
(`0x8C`), `SKO` (`0x8D`, Increment 2), `SRespawn` (`0x8E`, Increment 2). Ash and
fire reuse the existing `SPaint`/`SFire`. Per repo rule: mirror every frame in
`web/src/wire.ts`; no golden-fixture regen needed unless an existing encoder
changes (new transient frames follow the `SJump`/`SFire` no-fixture precedent).

## Art (static, house style; procedural fallbacks until PNGs exist)

`bomb` sprite (bold suffix, black outline), reuse the `fire`/explosion sprite for
the blast flash, `ash` tile (quiet suffix, lineless). Generated via
`web/tools/gen-asset.mjs` with a PixelLab key (not rendered by the engine
itself). The generator makes **static** art only, so bomb/explosion liveliness is
code-driven flicker.

## Verification

Per increment, drive the real `Sim` through its public API (throwaway driver, no
committed tests unless asked) and confirm end-to-end, plus `go test ./...` +
`cd web && npm test` + `go vet` + `tsc --noEmit`:

- **Inc 1:** drop a bomb on a painted cross → after the fuse, the cross becomes
  ash (flammable arms catch fire first), a second bomb in range chains, and arms
  clip at the world edge.
- **Inc 2:** a player standing in the blast is KO'd, respawns, killer's kill
  count increments; self-kill kills but credits nothing.
- **Inc 3:** a crystal tile stops the arm and cannot be walked onto.
