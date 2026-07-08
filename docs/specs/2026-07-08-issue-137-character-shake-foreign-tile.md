# Character shake on foreign tile

## Goal

Stop triggering the avatar shake effect when a player steps onto a tile painted by another player.

## Context

The current shared-paint system treats painted tiles as multiplayer-visible world state and currently plays a one-shot shake when a player enters someone else's painted tile (`docs/project-map/server.md`, `docs/project-map/client.md`). Issue #137 narrows the change to that presentation behavior only: players should still be able to paint tiles, see other players' painted tiles, and use the existing ult and movement flows, but entering a foreign painted tile should no longer cause the character to shake.

## Requirements

1. Entering or standing on a tile painted by another player must not trigger the avatar shake effect for the entering player.
2. The no-shake rule must apply consistently regardless of how the foreign tile was created, including normal paint and ult-driven paint patterns that produce shared painted tiles.
3. Removing the foreign-tile shake must not change tile ownership, painted-tile persistence, tile color replication, ult charge rules, or any other shared paint state.
4. Removing the foreign-tile shake must not change movement, jump behavior, roster state, camera behavior, controls, or character rendering apart from the absence of that shake trigger.
5. No replacement effect, warning, or new gameplay consequence is introduced when a player enters another player's painted tile.

## Out of scope

- Changing how players paint tiles or how painted tiles are selected.
- Changing ult shapes, ult charging, or painted-tile persistence.
- Adding a different reaction, penalty, buff, or visual treatment for entering a foreign painted tile.
- Reworking unrelated animation, movement, HUD, or networking behavior.

## Acceptance

1. With two players connected, when one player enters a tile painted by the other, the entering player's character does not shake locally or for observers.
2. Shared painted tiles still appear for all connected players and still replay correctly for late joiners.
3. Normal paint and ult paint still use the existing rules and still do not alter movement, jump, or roster behavior.
4. A reviewer can confirm the shipped result removes only the foreign-tile shake behavior and leaves the rest of the shared-paint system intact.
