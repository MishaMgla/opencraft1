# Player roster + role-bound non-combat ults

## Goal

Add an in-game player roster, let each joining player choose one of three roles with a different non-combat ult, and allow holding `Space` to keep painting while moving.

## Context

The current game already has shared movement, global player visibility, and a `Space`-triggered paint action that changes the tile under the player for everyone in the session (`docs/project-map/server.md`, `docs/project-map/client.md`, `docs/specs/2026-06-21-issue-43-space-paint-shake.md`, `docs/specs/2026-06-15-issue-8-nearby-player-visible.md`). The product vision explicitly allows additive world interaction and lightweight HUD layers on top of the existing browser-native world rather than a rewrite (`docs/vision.md`, `docs/prd/mvp.md`). Issue #59 asks for three concrete additions within that direction: a way to see the current players, a first version of non-combat ults that differ by player role and charge from painting tiles, and less repetitive paint input by letting players hold `Space`.

## Requirements

1. Before entering the world, a player must choose exactly one of three roles, and that role choice must remain fixed for that connected session.
2. The first version must ship with exactly these three roles and ult effects:
   1. `Pulse` role: when activated, paints the tile under the player plus every tile in a 3 x 3 square centered on that tile.
   2. `Cross` role: when activated, paints the tile under the player plus the two nearest tiles in each of the four cardinal world directions, for a total cross-shaped area of up to 9 tiles.
   3. `Trail` role: when activated, the next 8 distinct tiles the player enters are painted automatically to that player's color without requiring extra `Space` presses.
3. Every role's ult must be non-combat only: it may paint tiles, but it must not damage, displace, stun, hide, or otherwise affect other players directly.
4. A player's ult must become ready after that player successfully paints 12 tiles through normal painting; a tile counts only when that player's normal paint action changes the visible owner/color of that tile.
5. Tiles painted by an ult must not add ult charge, so ults cannot refill themselves.
6. Each player may hold only one ready ult charge at a time; once the ult is ready, additional qualifying paint actions do not bank a second charge.
7. Pressing `E` during gameplay must activate the local player's ready ult. If the ult is not ready, pressing `E` must do nothing visible other than any existing lightweight HUD state for "not ready".
8. Ult effects must update shared world state the same way normal paint does: all connected players must see the same painted result, and a newly joining player must also receive the resulting painted tiles on join.
9. The game HUD must show a visible player roster listing every currently connected player, not only nearby players.
10. Each roster row must show that player's display name, chosen role, and ult state as either `ready` or a numeric progress indicator toward the 12-tile charge.
11. The roster may stay always visible as a compact HUD panel; this first version must not require chat commands, slash commands, or a separate modal flow to inspect the player list.
12. Holding `Space` during gameplay must keep normal painting active while the key remains held: when the player enters a new tile, the game must attempt the same one-tile paint action that a manual `Space` press would perform on that tile.
13. Holding `Space` while standing still on the same tile must not repeatedly repaint that same tile or repeatedly add charge; the hold behavior is for continuous movement painting, not idle spamming.
14. Adding the roster, role choice, ults, and hold-to-paint must not change baseline movement controls, camera follow, join flow beyond the added role picker, or the existing non-ult paint rules outside the cases above.

## Out of scope

- Combat ults, explosions that kill nearby players, knockback, or any PvP damage system.
- More than three roles in this first version, role balancing UI, or per-role cosmetic avatars.
- Persistent progression, saved role choice across sessions, or account systems.
- Multiple stored ult charges, ult cooldown trees, item pickups, or scoreboards.
- Replacing the existing paint mechanic with mouse aiming, directional targeting, or a fully new control scheme.

## Acceptance

1. On the join screen, a new player must choose one of the three roles before entering, and after joining the roster shows that player's name and selected role.
2. With two or more players connected, the roster must show every connected player and update when a player joins or disconnects.
3. While a player holds `Space` and walks across several unpainted tiles, each newly entered tile paints in sequence without repeated tapping, but remaining on one tile does not keep repainting it.
4. After a player completes 12 qualifying normal tile paints, that player's roster entry shows the ult as ready.
5. When a ready `Pulse` ult is activated with `E`, all players see a painted 3 x 3 area centered on the acting player, and the acting player's ult state returns to not ready.
6. When a ready `Cross` ult is activated with `E`, all players see the defined cross-shaped painted area, and the acting player's ult state returns to not ready.
7. When a ready `Trail` ult is activated with `E`, the next 8 distinct tiles that player enters paint automatically, and after the eighth painted tile the Trail effect ends.
8. Ult-painted tiles are visible to players who were already connected and to players who join afterward in the same running server session.
9. No ult activation can kill, move, or otherwise directly affect another player's avatar.
