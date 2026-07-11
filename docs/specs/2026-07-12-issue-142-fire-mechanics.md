# Fire mechanics

## Goal

Make fire burn tiles down to a short-lived ash state and then remove that ash so the cell returns to the normal unpainted world.

## Context

The server sim already owns the painted-tile map and fire automaton, and today a burned tile ends as persisted inert ash rather than clearing away (`docs/project-map/server.md`). The client already renders `SFire` as a transient overlay and shows ash via the fallback tile path, so this issue is about changing the burnout lifecycle of a painted tile rather than introducing a new input or a new gameplay system (`docs/project-map/client.md`). This stays within the product vision's additive world-interaction direction by refining an existing tile-only mechanic (`docs/vision.md`, `docs/prd/mvp.md`).

## Requirements

1. Existing fire ignition and spread behavior must remain intact: lava still ignites flammable neighbors, fire still propagates through flammable tiles, and non-flammable materials still stop spread under the current rules.
2. When a burning tile finishes its burn duration, it must enter an ash state instead of disappearing immediately.
3. The ash state must be temporary and server-timed, remaining visible for roughly 1 second before the tile is removed from the painted world.
4. When that ash timeout ends, the tile must clear back to the normal unpainted base cell rather than remaining as a permanent ash paint tile.
5. Once a tile has cleared, it must no longer exist in the persisted painted-tile map and must behave the same as any other unpainted world cell for later paint and fire interactions.
6. The temporary ash state must be visible consistently to connected clients in view of the tile, and the eventual removal must also replicate so all viewers converge on the same cleared result.
7. A player repainting a tile during its temporary ash window must behave deterministically: the new paint replaces the ash presentation and the tile must follow the normal rules for that newly painted material rather than later disappearing because of the earlier ash timer.
8. Join-time world state and persistence must reflect only lasting tile state: a newly joined player may still miss an in-progress burn, but must not receive expired ash as durable terrain after the ash-removal window has passed.
9. The change must not add player damage, extinguish controls, new keybindings, or any new non-tile fire gameplay.

## Out of scope

- Changing which materials are flammable, igniters, or firebreaks.
- Adding a dedicated generated ash tile asset or animated fire asset.
- Reworking fire timing beyond the new temporary ash-removal beat.
- Any player-affecting fire mechanics such as health, knockback, death, or respawn.

## Acceptance

1. A reviewer can paint a flammable area, ignite it with lava, and observe that fire still spreads under the current rules.
2. After a tile burns out, the reviewer sees ash appear briefly, then disappear after about 1 second so the base unpainted world cell is visible again.
3. After that disappearance, reconnecting or reloading does not bring the expired ash tile back as persisted terrain.
4. If a player repaints a tile while it is in the ash window, the new paint remains and is not later cleared by the old burnout timer.
5. The shipped result changes fire burnout from permanent ash to temporary ash followed by tile removal, without adding new player-facing controls or combat behavior.
