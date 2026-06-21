# Verify issue #43 paint + shake behavior

## Goal

Restore and verify the full `#43` paint-and-shake feature set so `Space` painting works again and the paired shake behavior is still correct.

## Context

Issue `#43` already defined the intended shared-world behavior for painting the current tile with `Space` and triggering a one-shot shake when another player enters that painted tile (`docs/specs/2026-06-21-issue-43-space-paint-shake.md`). The current client/server surface for that feature lives across the binary wire, the sim-owned painted-tile state, and the browser input/render path (`docs/project-map/server.md`, `docs/project-map/client.md`). Issue `#52` reports that the visible paint portion regressed: pressing `Space` no longer changes the tile color, and asks to verify the full `#43` functionality rather than only the single symptom.

## Requirements

1. Pressing `Space` during gameplay must once again recolor the world tile under the acting player to that player's color, matching the intended `#43` behavior.
2. The paint result must remain shared session state: other connected players must see the same recolored tile, and a player who joins afterward must receive the current painted-tile state for correct rendering.
3. The paired `#43` shake behavior must continue to work with the restored paint flow: when a player enters a tile painted by a different player, the entering avatar performs one short shake on entry, visible to relevant observers.
4. The shake behavior must still exclude the original painter standing on or re-entering their own painted tile, and it must not loop or retrigger continuously while a player remains stationary on the painted tile.
5. Add automated regression coverage for this feature set so a future break fails tests if either:
   a. a paint action no longer updates/broadcasts the shared painted-tile state, or
   b. entering another player's painted tile no longer emits exactly one shake event for that entry.
6. Verification for this issue must cover the full `#43` feature set together, not only the isolated client-side color change.

## Out of scope

- Changing the `#43` feature design beyond restoring its specified behavior.
- Adding new paint mechanics such as erase, decay, radius paint, ownership rules, or persistence across server restarts.
- Redesigning unrelated HUD, movement, camera, or networking behavior.

## Acceptance

1. In a live two-player session, when player A presses `Space`, the tile under player A changes to player A's color for both player A and player B.
2. If a new player joins after that paint action, the painted tile already appears with the correct color on join.
3. When player B steps onto player A's painted tile, player B's avatar performs one short shake visible to both players, and the shake does not continue while player B stands still there.
4. If player A stands on or re-enters their own painted tile, no shake is triggered solely because it is their own paint.
5. The repository's automated test coverage includes this regression path, and the relevant test commands pass after the fix.
