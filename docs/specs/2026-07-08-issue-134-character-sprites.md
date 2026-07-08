# Spec — issue #134: Character sprites

## Goal
Let each player choose one shipped character from the approved cast before entering the world, persist that choice like the saved username, and show the chosen animated character to all players.

## Context
The client already has a welcome/profile UI, browser-local saved username flow, and a one-time forced entry interruption pattern for returning users when required state is missing ([docs/project-map/client.md](../project-map/client.md)). The PM/Dev workflow already treats character graphics as spec-driven asset work, requires ordinal isometric facings for this game, and documents the current character-generation pipeline and the `create-character-pro` cast exploration the issue explicitly references ([docs/project-map/agents.md](../project-map/agents.md), [docs/character-generation-pipeline.md](../character-generation-pipeline.md), [docs/vision.md](../vision.md)).

## Requirements
1. The game must ship a selectable player-character cast matching the four winners shown in `moodboard/create-character-pro-cast.html`: Horse, Pigeon Man, Pinniped Man, and Jesus.
2. First-time players must choose both a username and one of those four characters on the welcome/profile entry surface before entering the world.
3. Returning players who already have a saved username but no saved character when this ships must be interrupted before entering and required to pick one of the shipped characters once; they must not auto-join until that choice is saved.
4. After a character is chosen, that choice must persist in the same browser-local profile surface as the saved username and must be editable later from the profile UI.
5. The chosen character must be sent as part of the player's join/presence state so all players see the same selected character for that player during the session; this is not a local-only cosmetic toggle.
6. Each shipped character must render with isometric ordinal facings (`north-east`, `south-east`, `south-west`, `north-west`) and must include matching walk-animation frames for those same facings while the player is moving.
7. When a player stops moving, their selected character must return to an idle frame for the last facing used; the renderer must not keep looping walk motion while stationary.
8. The character asset-generation path used for this feature must use the same PixelLab `create-character-pro` route used for `moodboard/create-character-pro-cast.html`, not the older character endpoint, and the relevant docs/tooling for issue-driven character requests must record that choice.
9. Character art for this cast must not include baked ground shadows; renderer-owned grounding, depth sorting, labels, and procedural fallback behavior must keep working if an asset is missing or unavailable.
10. This feature must not change movement speed, movement controls, paint/ult/jump behavior, world persistence outside the saved local profile data needed for character choice, or unrelated HUD/layout surfaces.

## Asset Generation
- type: character
- name: horse-pro
- prompt: sturdy brown riding horse with a readable saddle
- size: 64
- directions: 4
- facings: ordinal
- animation: walk

## Asset Generation
- type: character
- name: pigeon-man-pro
- prompt: humanoid pigeon-headed traveler in simple clothes
- size: 64
- directions: 4
- facings: ordinal
- animation: walk

## Asset Generation
- type: character
- name: pinniped-man-pro
- prompt: humanoid pinniped traveler with flippers and a rounded muzzle
- size: 64
- directions: 4
- facings: ordinal
- animation: walk

## Asset Generation
- type: character
- name: jesus-pro
- prompt: bearded robed man with long hair and sandals
- size: 64
- directions: 4
- facings: ordinal
- animation: walk

## Out of scope
- Adding custom character creation, free-text avatar prompts, uploaded avatars, or expanding the shipped cast beyond the four characters named above.
- Adding accounts, cloud sync, cross-device profile sync, inventory, stats, or gameplay effects tied to character choice.
- Reworking floor tiles, camera behavior, movement rules, combat/ults/jump systems, or unrelated welcome/profile UI copy beyond what is needed to support character choice.
- Changing the issue-driven asset workflow for non-character assets.

## Acceptance
- A reviewer can load the game as a new player and is required to choose one of the four shipped characters before entering.
- A reviewer with a pre-existing saved username but no saved character is blocked once on next visit until a character is chosen, then auto-joins normally on later visits with that saved character.
- After saving a character, reopening the profile UI shows the current selection and allows switching to another shipped option for future presentation.
- Local and remote players both render as the chosen cast member, and movement in game plays the matching ordinal walk animation while idle presentation stays non-walking.
- The generated assets and docs/tooling for this surface clearly reflect the `create-character-pro` path rather than the older character endpoint.
- If a character asset is unavailable, the game still remains playable through the existing fallback presentation rather than failing to join or render.
