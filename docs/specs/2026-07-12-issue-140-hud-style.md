# Spec — issue #140: HUD style

## Goal
Restyle every player-facing UI surface in the established flat, sloppish house style, replacing the legacy retro-pixel chrome while preserving the current game experience.

## Context
The browser client’s UI is plain DOM over the Pixi world and currently covers startup/entry, role and character selection, the in-game HUD, controls help, roster, mobile actions, profile editing, and the repository link ([docs/project-map/client.md](../project-map/client.md)). The project’s selected visual identity is the dataset-poison AI-slop house style, with bold flat foreground/HUD treatment ([AGENT_RULES.md](../../AGENT_RULES.md)). The existing four-character cast and its ordinal sprite frames are already registered for player presentation ([docs/specs/2026-07-08-issue-134-character-sprites.md](2026-07-08-issue-134-character-sprites.md)).

## Requirements
1. Replace the legacy retro-pixel visual treatment across all existing DOM UI chrome with a cohesive flat, sloppish presentation that matches the project’s current house art direction; do not retain pixel-font, bitmap-border, pixelated-image, or limited retro palette styling as the UI’s defining look.
2. Apply the restyle to every current player-facing UI surface: startup loader, entry overlay, role picker, character picker, in-game HUD, player roster, controls-help button and panel, zoom controls, profile dialog, mobile action bar, and fixed repository link.
3. Preserve the existing information and interactions on those surfaces: joining, role choice, character choice, saved-profile editing, help toggling, zoom, roster state, desktop keyboard controls, and mobile tap/action controls must continue to work with their present behavior.
4. Keep the in-game interface compact and legible over the playfield on desktop and mobile. The restyle may refine spacing, grouping, panel size, and placement only where needed for that readability; it must not add a new hide/reveal, hover-only, or navigation flow.
5. In both the entry character picker and profile character picker, show a visible preview sprite for each of the four shipped choices: Horse, Pigeon Man, Pinniped Man, and Jesus. Each preview must use that character’s existing registered sprite art, and the selected state must remain clear without relying on the radio control alone.
6. Use the same four character options, browser-local selection persistence, and session presence behavior already defined for character selection; this work must not add characters, regenerate character assets, or change how a selected character is sent or rendered in the world.
7. Preserve accessibility affordances: controls remain keyboard and touch operable, visible labels and names remain available, and the existing dialog, form, and help semantics remain intact.

## Out of scope
- New gameplay mechanics, protocol/server changes, or changes to movement, painting, ult, jump, bomb, fire, elimination, or roster data.
- New character art, new HUD art assets, or changes to the asset-generation pipeline.
- A rewrite of the Pixi world renderer, terrain/character presentation in the playfield, or the existing character cast and its selection/persistence model.
- New onboarding content, account/profile backends, menus, inventory, or a new navigation system.

## Acceptance
- A reviewer can open the game on desktop and mobile-sized touch viewports and see every listed UI surface presented consistently in the flat, sloppish house style, with no legacy retro-pixel UI treatment remaining.
- A reviewer can join, edit the local profile, open/close help, use zoom, view roster updates, and use mobile actions exactly as before the restyle.
- Both character pickers display one recognizable existing sprite preview for each of Horse, Pigeon Man, Pinniped Man, and Jesus; choosing and saving an option still selects that same character in game.
- The HUD remains readable without materially obscuring the playable world, and all controls remain usable by keyboard and touch.
