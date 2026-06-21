# Brighter local player name label

## Goal

Make the local player's own name label render in a brighter white-toned color so it is easier to spot among nearby players.

## Context

The web client renders player tokens and their name labels in the Pixi scene (`docs/project-map/client.md`), and the product's lightweight symbolic presentation depends on those labels staying easy to read in the shared world (`docs/vision.md`, `docs/prd/mvp.md`). Issue #46 asks for a small client-side polish pass so the local player's own label stands out visually without changing gameplay or networking.

## Requirements

1. The client must render the local player's own name label in a visibly brighter, whiter color than the label color used for other players.
2. The brighter local-label treatment must apply only to the local player's name text above their avatar; remote player labels must keep their existing appearance.
3. The change must preserve the existing local player's displayed name text, label position, font sizing, and general rendering behavior except for the color/brightness adjustment needed to improve visibility.
4. The brighter local-label treatment must remain visible during normal play while the player moves, the camera follows, and other players enter or leave view.
5. The implementation must be client-only and cosmetic: it must not add configuration, network messages, server changes, gameplay behavior changes, or persistence.

## Out of scope

- Changing any remote player label colors or adding team/friend/role-based label styling.
- Adding outlines, icons, animations, or other new label effects beyond the local color/brightness tweak.
- Changing avatar colors, shadows, HUD content, camera behavior, or movement.
- Adding a user setting, accessibility toggle, or runtime theme/config control for label colors.

## Acceptance

1. Launching the game and joining as a player shows that player's own name label in a brighter white-toned color than other players' name labels.
2. With at least one other player visible, the local player's name is easier to distinguish at a glance because only the local label receives the brighter color treatment.
3. The brighter local label stays positioned and rendered as before during movement and camera follow.
4. No server, protocol, config, or gameplay changes are required for the tweak to work.
