# Game graphics

## Goal

Give opencraft1 a cohesive full-screen retro-symbolic visual style that renders sharply across the world, HUD, and entry/menu surfaces without changing gameplay.

## Context

The current client already renders an isometric symbolic world with simple floor tiles, player tokens, painted-cell overlays, DOM/Pixi HUD elements, and entry/profile overlays (`docs/project-map/client.md`). The product vision and MVP both explicitly favor lightweight symbolic presentation over a heavy art pipeline, so this issue is a presentation-polish pass on the existing game rather than a sprite-art rewrite (`docs/vision.md`, `docs/prd/mvp.md`). In issue #71, the author clarified three scope-shaping choices: target a full retro pass rather than a small crispness fix, cover the full presentation rather than only the world or HUD, and keep the redesign retro-symbolic rather than introducing bespoke pixel-art sprites.

## Requirements

1. The visual redesign must cover the full player-facing presentation: the in-world play surface, the persistent HUD, and the pre-entry / modal / menu-style overlays that a player sees before or during play.
2. The art direction must be retro-symbolic rather than sprite-driven: keep the game's current simple geometric language for floor tiles, painted cells, player tokens, and other core shapes instead of replacing them with bespoke character, terrain, or prop sprites.
3. The pass must make the presentation read as intentionally sharp at normal play zoom: floor edges, painted-cell boundaries, player tokens, shadows, connector lines if any, and all text must avoid the currently blurry or soft appearance called out in the issue.
4. The retro look must come from a coherent combination of sharp pixel treatment, a limited color palette, and pixel-appropriate typography applied consistently across all covered surfaces.
5. The world surface must be restyled in that direction, including at minimum the base floor tiles, the painted ownership state, the local and remote player tokens, their shadows, and movement readability against the ground.
6. The HUD surface must be restyled in the same direction, including the visible name/status area, paint hint, zoom controls, player roster, and any other always-visible gameplay chrome already present in the shipped client.
7. The non-world overlays must be restyled in the same direction, including the join flow and the in-session profile/edit modal, so the presentation no longer mixes retro-styled play space with default-looking forms or panels.
8. Text styling must be part of the spec, not incidental polish: the in-world labels, HUD labels, buttons, and entry/overlay copy must use a bitmap or otherwise clearly retro-compatible type treatment that stays readable at supported sizes.
9. The redesign must preserve gameplay behavior, information hierarchy, and control discoverability: players must still be able to identify themselves, other players, the paint state, the roster, the role/join flow, and the zoom controls without learning a new interaction model.
10. The pass must not rely on heavy post-processing effects that intentionally blur or obscure the game view. Any retro framing effects, if used at all, must remain secondary to crisp readability.
11. The pass must stay within the product's lightweight-client constraint: it must not require introducing a bespoke sprite-production pipeline or otherwise turning the project into a detailed-art content workflow.

## Out of scope

- New gameplay systems, movement changes, paint-rule changes, role/ult changes, or netcode changes.
- A bespoke sprite-art character/environment set.
- Audio, combat feedback redesign, or new screen flows beyond restyling the existing ones.
- A pure CRT/filter overlay approach that leaves the current underlying presentation mostly unchanged.

## Acceptance

1. On opening the game, the join/entry surface reads as part of the same retro-symbolic presentation as the in-game world rather than as mostly default UI chrome.
2. After entering the world, the floor tiles, painted cells, player tokens, and shadows all appear visibly sharper and more stylistically cohesive than the current blurred/minimal baseline.
3. The HUD elements already present in the game match that same visual system in palette, typography, framing, and sharpness rather than looking like a separate style layer.
4. In-world labels and UI text remain readable while clearly using a retro-compatible type treatment instead of the current soft/default-looking presentation.
5. A reviewer can compare the shipped result to the issue's requested direction and reasonably describe it as a full retro-symbolic presentation pass, not merely a crispness tweak and not a new sprite-art game.
6. Normal play still works the same way: players can join, move, paint, read the roster/HUD, and use the existing controls without any gameplay or flow regressions caused by the visual redesign.
