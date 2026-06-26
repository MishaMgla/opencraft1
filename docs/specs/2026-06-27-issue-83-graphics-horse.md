# Spec — issue #83: Graphics. Horse

## Goal
Replace the current player token presentation with horse-based character visuals so every connected player appears as a horse, with a clear walk animation while moving.

## Context
The current client renders players as simple procedural tokens in the shared isometric world, with generated assets loaded through `web/assets/manifest.json` when a spec includes an `## Asset Generation` block ([docs/project-map/client.md](../project-map/client.md)). The product vision still favors lightweight, additive visuals over a full art-pipeline rewrite, so this change should swap only the player representation and preserve existing movement, paint, ult, HUD, and world-tile behavior ([docs/vision.md](../vision.md), [docs/prd/mvp.md](../prd/mvp.md)).

## Requirements
1. The client must render every player, local and remote, with the same generated horse character asset instead of the current procedural player token, while preserving existing name labels, depth sorting, and shadow/grounding behavior.
2. The horse asset must support the four cardinal facings already supported by the asset pipeline, and the renderer must choose the facing that best matches each player's latest movement direction.
3. When a player is moving, their horse must display a visible walk animation; when the player is stationary, the horse must return to an idle pose without continuing the walk loop.
4. The walk animation must be presentation-only. It must not change movement speed, collision, paint targeting, ult behavior, jump behavior, networking, or server simulation.
5. If the horse asset is unavailable or fails to load, the client must continue to function by falling back to the existing procedural player rendering.

## Asset Generation
- type: character
- name: horse
- prompt: sturdy brown riding horse with readable saddle silhouette, pixel art, bold dark outline, flat shading, no background, top-down view
- size: 64
- directions: 4

## Out of scope
- New horse-specific gameplay, abilities, sounds, UI, or role changes.
- Reworking floor tiles, HUD chrome, painted-cell visuals, or the broader retro-symbolic world art direction.
- Per-role, per-player, or per-team horse variants.
- Mid-session avatar customization or a character-selection flow.

## Acceptance
- After the asset is generated and wired, joining the game shows the local player and all remote players as horses rather than geometric tokens.
- Walking north, south, east, and west causes the horse to face the matching direction.
- Holding movement input makes the horse visibly animate while moving, and releasing input returns it to idle.
- Painting, ult activation, jump, labels, roster, and multiplayer visibility behave the same as before.
- Removing or breaking the horse asset still leaves the game playable through the existing fallback renderer.
