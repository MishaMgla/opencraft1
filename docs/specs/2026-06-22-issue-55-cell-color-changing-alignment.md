# Cell color changing alignment

## Goal

Make `Space` paint the tile visually under the player's feet / center on screen instead of an offset neighboring tile.

## Context

The web client renders the world in an isometric projection, follows the local player, and sends one-shot `Space` paint requests against shared world tile state (`docs/project-map/client.md`). The existing paint feature already treats painted tiles as multiplayer-visible shared state (`docs/specs/2026-06-21-issue-43-space-paint-shake.md`), but issue #55 reports that the targeted tile is visibly shifted toward the top-left of the player's on-screen position. This spec narrows the fix to paint-target alignment so the paint result matches the rendered isometric presentation without expanding the paint mechanic itself.

## Requirements

1. When the local player presses `Space`, the painted tile must be the tile visually under that player's feet / center in the isometric view.
2. The paint action must not target the adjacent tile up-left, nor any other neighboring tile, when the player is visibly standing on a different rendered tile.
3. The tile-selection rule used for `Space` painting must align with the client's rendered isometric tile placement, so the visible paint result matches the player's apparent standing tile rather than a projection-misaligned world cell.
4. The alignment fix must work consistently regardless of where the player is in the world, including negative coordinates and map-edge positions that are otherwise valid standing positions.
5. The change must preserve the current paint flow after tile selection: pressing `Space` still produces one paint request, paints exactly one tile, and updates the same shared painted-tile state seen by all connected players.
6. The change must not alter player movement, camera follow, HUD controls, zoom behavior, remote-player interpolation, shake behavior, or any other gameplay/input behavior unrelated to choosing the correct painted tile.

## Out of scope

- Adding new paint mechanics such as erase, decay, radius paint, ownership rules, or persistence changes.
- Adding a visible tile preview, hover highlight, or new HUD/tutorial UI.
- Changing the existing shared paint replication or shake rules except as needed to keep them working with the corrected tile target.
- Reworking the isometric renderer, camera model, or movement system beyond the minimum needed to make paint targeting match the rendered standing tile.

## Acceptance

1. In a live session, when a player stands on a rendered tile and presses `Space`, that exact tile under the player's feet changes color rather than the tile offset up-left.
2. Repeating the same check in different parts of the map yields the same visual rule: the tile under the player's on-screen standing position is the one that changes color.
3. Near world edges, pressing `Space` still paints the visually occupied tile and does not spill to a neighboring tile solely because of the player's position on screen.
4. Other connected players still see the same corrected painted tile, and late joiners still receive the correct painted-tile state.
5. Movement, camera follow, `Space` one-shot behavior, and the existing shake behavior otherwise continue to work as before.
