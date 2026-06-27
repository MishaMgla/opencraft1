# Spec — issue #92: Sprite, graphics direction

## Goal
Correct the horse sprite direction set so it matches the game's isometric view, regenerate the shipped horse art to that contract, and document the rule for future asset requests.

## Context
The client already renders the world in an isometric view and uses generated horse character assets for player presentation when present, while preserving renderer-owned labels, depth sorting, and grounding behavior ([docs/project-map/client.md](../project-map/client.md)). The PM/Dev agent flow also treats graphics requests as spec-driven asset work, so the facing contract needs to be explicit in the docs the agents follow ([docs/project-map/agents.md](../project-map/agents.md), [docs/vision.md](../vision.md)).

## Requirements
1. The horse character asset used for players must be regenerated so its four facings read as isometric diagonal views, not straight cardinal side/front/back views.
2. The four required facings are `north-east`, `south-east`, `south-west`, and `north-west`, and the implementation must define and document how those four visual facings map onto the existing four-slot renderer/asset pipeline used by the client.
3. The client must continue to select a facing from player movement, but the chosen sprite shown for each movement direction must visually match the isometric world perspective rather than the current cardinal-looking horse set.
4. The regenerated horse art must not include a baked ground shadow underneath the horse sprite; grounding remains the renderer's responsibility so the character no longer reads as hovering because of doubled shadow treatment.
5. Existing player presentation behavior outside that art correction must stay intact: same horse asset name, same four-direction asset shape, same labels, same depth sorting, same movement/readability behavior, and the same fallback to procedural player tokens if the asset is unavailable.
6. The documentation that defines asset-generation and agent behavior for graphics requests must be updated so future character-sprite requests for the isometric game use the diagonal-facing convention instead of the old cardinal wording.

## Asset Generation
- type: character
- name: horse
- prompt: sturdy brown riding horse with a readable saddle
- size: 64
- directions: 4
- view: low top-down
- template: horse
- animation: walk

## Out of scope
- New gameplay, movement rules, collision, paint behavior, ult behavior, jump behavior, or networking changes.
- A broader rewrite of the asset pipeline beyond documenting and implementing the four-direction isometric-facing contract already used by the client.
- Additional horse variants, rider variants, recolors, or a character-selection flow.
- Reworking floor tiles, HUD art, or non-horse world assets.

## Acceptance
- A reviewer can compare the new horse asset against the old one and confirm the four views read as `north-east`, `south-east`, `south-west`, and `north-west` in the isometric world.
- Entering the game still shows local and remote players as horses, with facing selected from movement and walk animation still working while moving.
- The shipped horse sprite no longer contains its own under-body shadow, and the in-game result no longer reads as a doubled-shadow hover.
- The client remains playable if the horse asset is missing, through the existing procedural fallback.
- The relevant docs and agent prompts clearly state the diagonal-facing convention for future isometric character asset requests.
