# Spec — issue #97: Horse animations

## Goal
Add true walk animations for the player horse while preserving the current correct isometric diagonal facings.

## Context
The client already renders players with a generated horse character skin when available, chooses among the four isometric diagonal facings `north-east`, `south-east`, `south-west`, and `north-west`, and falls back to a presentation-only trot when no walk frames exist ([docs/project-map/client.md](../project-map/client.md)). The agent workflow and graphics contract currently document that ordinal isometric character facings are correct for this game, but also note that the current ordinal asset path ships static, which is the gap this issue is asking to close without regressing back to cardinal-looking horse art ([docs/project-map/agents.md](../project-map/agents.md), [docs/vision.md](../vision.md)).

## Requirements
1. The shipped player horse asset must remain an isometric four-facing set whose visual directions read as `north-east`, `south-east`, `south-west`, and `north-west`; the primary in-game horse presentation must not revert to straight cardinal side/front/back views.
2. When a player is moving, the horse shown for that player's current facing must use true walk-animation frames for that same ordinal facing rather than the current presentation-only trot effect.
3. When a player stops moving, the horse must return to a non-walking idle frame for the last facing used, without continuing to loop walk motion.
4. Supporting ordinal walk animation may extend the current horse asset-generation, manifest, or renderer contract, but it must preserve the existing horse asset name, renderer-owned grounding, name labels, depth sorting, and procedural player fallback when the horse asset is unavailable.
5. The horse art used for this change must not include a baked ground shadow; grounding remains the renderer's responsibility.
6. The relevant docs must record the preserved horse-facing contract and the walk-animation contract for this isometric character surface so future horse or character requests do not lose the correct diagonal directions.
7. This change must not alter movement speed, movement controls, collision, paint targeting, ult behavior, jump behavior, networking, or server simulation.

## Asset Generation
- type: character
- name: horse
- prompt: sturdy brown riding horse with a readable saddle
- size: 64
- directions: 4
- facings: ordinal

## Out of scope
- Switching the horse back to cardinal-facing character art to get animation more easily.
- New horse variants, rider variants, recolors, selection UI, or non-horse character work.
- Reworking floor tiles, HUD art, camera behavior, or non-character world presentation.
- Gameplay, balance, protocol, or persistence changes unrelated to horse presentation.

## Acceptance
- A reviewer can inspect the generated horse asset and confirm it still reads as `north-east`, `south-east`, `south-west`, and `north-west` in the isometric world.
- Joining the game still shows local and remote players as horses, and moving in each supported direction shows a matching walk cycle instead of only a procedural trot effect.
- Releasing movement leaves the horse on an idle frame for the last facing used.
- The horse still sits correctly on the tile with no baked under-body shadow and no doubled-shadow hover.
- Removing or breaking the horse asset still leaves the game playable through the existing procedural fallback.
- The relevant docs clearly state that isometric horse characters keep ordinal facings and that walk animation for this surface must preserve those same directions.
