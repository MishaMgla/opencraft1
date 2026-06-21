# Space paint + shake

## Goal

Let a player paint the tile under them to their own color with `Space`, sync that painted tile to all players, and trigger a short shake on any other player who steps onto one of that player's painted tiles.

## Context

The current server simulation already owns shared player state and broadcasts snapshots to every client each tick, while the client renders floor tiles and remote players from those snapshots (`docs/project-map/server.md`, `docs/project-map/client.md`). The product vision explicitly leaves room for additive shared-world interaction after the movement/presence MVP, with place/remove tile interaction called out as the first seed of that layer (`docs/vision.md`, `docs/prd/mvp.md`). Issue #43 asks for a minimal first interaction: pressing `Space` paints the tile under the local player to that player's color so everyone can see it, and when another player steps onto that painted tile their avatar briefly shakes once on entry.

## Requirements

1. Pressing `Space` while connected in the game must target the world tile currently under the local player and request that it be painted to that player's current avatar color.
2. The server must treat painted tiles as shared world state and broadcast paint updates so every connected player sees the same tile color for the same world position.
3. A player who connects after tiles have already been painted must receive the current painted-tile state needed to render those painted tiles correctly on join; the paint state remains until another paint action overwrites that tile or the server process resets.
4. If multiple paint actions target the same tile, the most recent successful paint wins and becomes the visible color for all players.
5. The paint action must not change player position, movement controls, camera behavior, display names, or any tile other than the one currently under the acting player.
6. When a player steps onto a tile painted by a different player, that entering player's avatar must play one short shake effect once on entry to that tile.
7. The shake effect must not trigger for the player who originally painted the tile merely by standing on or re-entering their own painted tile.
8. The shake effect must trigger on entry, not continuously while standing still on the tile; remaining on the tile must not loop or restart the shake.
9. If a player walks off a qualifying painted tile and later steps onto it again, the shake may trigger again on that later re-entry.
10. The feature must work for all observers in the same running world session: the entering player sees their own avatar shake, and other connected players also see that avatar shake.

## Out of scope

- Any persistence of painted tiles across server restarts.
- Unpainting, erasing, decay timers, or paint limits.
- Painting areas larger than one tile or painting tiles at a distance.
- Triggering shake from proximity, overlap, or standing on an unpainted tile.
- Adding chat, scores, territory rules, or other gameplay systems on top of painted tiles.

## Acceptance

1. With two players connected, when player A presses `Space`, the tile directly under player A changes to player A's color for both players.
2. When a third player joins after that paint action, that same tile already appears in player A's color for the new player.
3. When player B steps onto player A's painted tile, player B's avatar performs one short shake effect visible to both player A and player B.
4. If player B remains standing on that tile, the shake does not continue looping.
5. If player B leaves the tile and steps back onto it later, the shake plays again on that new entry.
6. If player A stands on their own painted tile, player A's avatar does not shake solely because it is their own paint.
