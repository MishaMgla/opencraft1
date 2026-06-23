# Game field size

## Goal

Double the playable world bounds so the map is 2x wider and 2x taller than the current field.

## Context

The server currently owns and clamps movement against a fixed world size, and the client renders the shared isometric floor plus camera-followed player movement within those bounds (`docs/project-map/server.md`, `docs/project-map/client.md`). The product vision and MVP both treat the shared world itself as the core surface, so increasing the playable map size is an additive game-world change rather than a camera or UI redesign (`docs/vision.md`, `docs/prd/mvp.md`). In issue #72, the author clarified they want the playable world bounds enlarged, not the visible viewport.

## Requirements

1. The playable world must become 2x wider and 2x taller than its current size.
2. If the current world extent is `4096 x 4096`, the new world extent must be `8192 x 8192`.
3. Server-side movement clamping and any other authoritative world-bound checks must use the enlarged world extent so players can move across the full larger field but still cannot go outside it.
4. The client-rendered world floor and camera-followed traversal must cover the enlarged playable area rather than preserving the old edge limits.
5. Join/spawn behavior must remain valid inside the enlarged world bounds and must not place players outside the playable area.
6. Enlarging the world must not change the visible on-screen viewport size, HUD layout, movement controls, networking model, or interest-management behavior beyond what is necessary to respect the new map bounds.
7. Any constants or shared assumptions about world size that affect server/client agreement must be updated consistently so the larger bounds behave the same way in both surfaces.

## Out of scope

- Changing the visible viewport zoom or showing more of the same map at once.
- Redesigning the HUD, camera controls, or onboarding copy.
- Changing movement speed, tick rate, wire format, role mechanics, painting rules, or persistence behavior.
- Reworking the spatial-grid model beyond any minimal bound updates required for the larger world size.

## Acceptance

1. A player can traverse to positions that were previously outside the old field, demonstrating the map is now 2x wider and 2x taller.
2. Players are still blocked from moving beyond the new outer world edges.
3. The floor rendering and camera-followed play area visibly extend to the new larger bounds instead of stopping at the old limits.
4. Joining the game still places players inside the playable world, and normal movement works across the expanded map.
5. The visible viewport size and HUD remain otherwise unchanged.
