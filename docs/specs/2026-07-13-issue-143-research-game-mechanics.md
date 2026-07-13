# Spec — issue #143: Permanent temple landmark

## Goal
Add one animated, fully solid 3×3 temple landmark northeast of spawn to make the shared world more navigable and interesting to move around.

## Context
Opencraft1 is an additive shared-world game where world interaction is layered onto the existing engine ([vision](../vision.md), [MVP](../prd/mvp.md)). The current client renders isometric terrain, fire, and bombs, while the simulation owns world rules and blast propagation ([client map](../project-map/client.md), [server map](../project-map/server.md)). This landmark adds a fixed obstacle without changing the existing paint, fire, bomb, or player-combat loops.

## Requirements

1. The world contains exactly one temple for the whole running map; it is not placeable, destructible, collectible, or randomly spawned.
2. The temple occupies one fixed 3×3 block of world tiles northeast of the current spawn. Its southwest-most blocked tile is two tile steps northeast of the spawn tile, leaving exactly one clear diagonal tile between the spawn tile and the temple.
3. All nine temple tiles are fully solid: players cannot enter them, paint requests targeting them have no effect, and fire cannot ignite or spread through them.
4. Bomb blast arms must stop before the first temple tile they encounter. The temple itself remains unchanged and no blast may reach tiles beyond it along that arm.
5. Collision and action blocking must be enforced by the simulation as well as respected by the client, so invalid movement or world-action requests cannot affect temple tiles.
6. Render the full 3×3 footprint as one temple illustration, centered and depth-sorted as a single landmark; do not assemble it from nine matching tile pieces.
7. The illustration uses a looping four-frame idle animation. The loop must visibly pulse and warp before settling, while retaining a readable temple silhouette and the same 3×3 blocked footprint in every frame.
8. Generate the four temple frames with nano-banana using the repository's established asset workflow. Register and preload the frames so the client uses them when available and retains a non-animated solid-landmark fallback if an asset cannot load.
9. The landmark must not alter the world bounds, spawn tile, paint palette, fire rules away from temple tiles, bomb range away from temple tiles, elimination/respawn rules, player controls, persistence, or multiplayer protocol compatibility except where needed to represent this fixed server-owned obstacle.

## Asset Generation
- type: tile
- name: temple-idle-0
- prompt: ancient temple with a heavy arched doorway and a warped roof
- size: 128

## Asset Generation
- type: tile
- name: temple-idle-1
- prompt: ancient temple with a heavy arched doorway and a roof swelling upward
- size: 128

## Asset Generation
- type: tile
- name: temple-idle-2
- prompt: ancient temple with a heavy arched doorway and walls bending outward
- size: 128

## Asset Generation
- type: tile
- name: temple-idle-3
- prompt: ancient temple with a heavy arched doorway and a roof settling into place
- size: 128

## Out of scope

- Additional buildings, temples, map landmarks, or player-built structures.
- Temple destruction, repair, capture, rewards, interiors, NPCs, quests, or loot.
- New player abilities, new controls, or changes to the existing paint, fire, bomb, or PvP rules beyond temple blocking.
- Random temple placement, persistence of player-made landmarks, or changes to world size or spawn placement.

## Acceptance

- A fresh and already-running map shows exactly one temple northeast of spawn; a player can traverse the one clear diagonal tile between spawn and the temple but cannot enter any of its nine tiles.
- The temple appears as one coherent 3×3 landmark, not nine repeated pieces, and its four-frame pulse visibly loops while remaining readable and stationary.
- Painting, fire, and bombs cannot change any temple tile; a bomb blast aimed at it stops at the outer edge and does not affect tiles on the far side.
- Attempts to move or send world-action requests into temple tiles do not change the authoritative world state.
- When temple art is unavailable, the landmark remains visible and fully solid through a deterministic fallback.
