# Spec — issue #111: Cell tiles stitch

## Goal
Eliminate unintended visible stitch lines between adjacent rendered tiles so repeated terrain reads as seamless in play.

## Context
The client renders the shared world as isometric floor tiles with generated terrain overlays for painted cells, and tile presentation is a client-side visual surface separate from gameplay state, networking, and movement rules ([docs/project-map/client.md](../project-map/client.md)). The product vision favors lightweight symbolic graphics that stay readable while polishing the shared-world presentation, so fixing unintended seams between neighboring tiles is an in-scope visual refinement rather than a gameplay change ([docs/vision.md](../vision.md), [docs/prd/mvp.md](../prd/mvp.md)).

## Requirements
1. Adjacent copies of the same rendered tile terrain must not show an unintended visible seam, stitch line, gap, or fringe between them during normal in-game rendering.
2. The seam removal must cover the shipped painted-tile terrain set, including the reported water-to-water case, rather than fixing only a single color or one hard-coded example.
3. The implementation may adjust tile source art, texture sampling, sprite placement, or other client-side rendering details as needed to remove unintended seams, but it must preserve the current tile footprint, grid alignment, paint color mapping, and authoritative tile positions.
4. When two neighboring tiles are intentionally different terrains or colors, the boundary between them must remain readable; this issue does not require adding blend transitions or new edge-joining rules between different tile types.
5. The fallback tile/cell presentation used when a terrain asset is missing must remain stable and must not introduce new seams or gaps between adjacent fallback tiles.
6. Fixing the seams must not change movement, paint targeting, camera behavior, world bounds, persistence, or the networking/protocol model.

## Out of scope
- Creating new terrain art themes, transition tiles, autotiling logic, or biome blending between different tile types.
- Changing tile size, world scale, camera zoom rules, player sprites, HUD styling, or paint gameplay.
- Adding new paint colors, new world-interaction mechanics, or any server-side terrain model changes.

## Acceptance
- A reviewer can reproduce the previously visible same-tile seam case, including adjacent water tiles, and confirm the unintended line is no longer visible in the fixed build.
- Repeated adjacent tiles across the shipped painted terrain set render as continuous surfaces in normal play instead of showing stitch lines.
- Adjacent different terrain/color tiles remain readable as distinct neighbors without requiring new transition art.
- Missing-asset fallback tiles still render without broken gaps or new seam artifacts.
- Gameplay behavior is otherwise unchanged: players still move, paint, and view the world with the existing controls and bounds.
