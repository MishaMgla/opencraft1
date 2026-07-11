# Spec: remote character identity stays per-player (#141)

## Goal

Ensure each client renders every connected player with that player's own selected character, rather than reusing the viewer's character for remote players.

## Context

Issue #141 reports that when one player joins as the horse and another joins as Jesus, the first player sees both players as horses. The product already supports browser-local character selection, sends the selected character in `CHello`, and includes character choice in server presence state (`docs/project-map/server.md`, `docs/project-map/client.md`). This spec narrows the expected behavior for remote-player identity so multiplayer presence remains accurate within the shared-world experience described in `docs/vision.md` and `docs/prd/mvp.md`.

## Requirements

1. When a player joins, the server must preserve that connection's selected character as part of the authoritative presence state for that player.
2. Every client must render the local player with the local player's selected character and each remote player with that remote player's selected character from server presence data.
3. A newly joined client must receive enough join-time presence state to render already-connected players with their correct characters before or as those players first appear on screen.
4. When an additional player joins after the viewer is already connected, the viewer must render the newcomer with the newcomer's selected character immediately on first appearance, without requiring a reload or a later correction.
5. Character identity must remain per-player across normal movement, roster updates, and any other presence refreshes; a remote player's character must not change just because the viewer chose a different character.
6. If a player disconnects and rejoins with a different selected character, clients must treat that new connection as the new authoritative character for that player.
7. This change must not alter existing character-selection UX, the shipped cast list, movement behavior, paint behavior, or non-character presence fields.

## Out of scope

- Adding new characters, art, or character customization controls.
- Mid-session character switching without reconnecting.
- Account-linked or cross-device persistence of character selection.

## Acceptance

- Reproduce with two browsers or devices: player A joins as horse and player B joins as Jesus; player A sees horse for self and Jesus for player B, and player B sees Jesus for self and horse for player A.
- Repeat with the join order reversed and confirm each viewer still sees remote players with the remote players' own chosen characters.
- After one player disconnects and rejoins with a different character, the other client sees the rejoined player with the new character and no existing player's character changes incorrectly.
