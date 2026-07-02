# Spec — issue #107: Tiles/cells outline

## Goal
Remove the visible outline treatment from rendered world tiles/cells so the playfield reads as clean, lineless surfaces.

## Context
The client currently renders an isometric tiled world with symbolic floor diamonds and paint-overlay tile graphics, and the asset/rendering path already distinguishes presentation from gameplay state ([docs/project-map/client.md](../project-map/client.md)). This request is an in-scope visual polish change that should refine how tiles read on screen without changing the existing shared-world paint mechanic or the lightweight symbolic direction described in the product vision ([docs/vision.md](../vision.md)).

## Requirements
1. The visible tile/cell presentation in the shipped game must not draw an outline around the rendered tile surface.
2. The no-outline treatment must apply consistently to painted tile/cell states, not only to a subset of paint colors or asset-backed variants.
3. Removing the outline must preserve clear tile readability in the existing isometric camera, including when adjacent tiles use different paint colors.
4. The change may update tile assets, asset registration, or the client tile-rendering path as needed to remove the outline, but it must not change tile positions, tile size, paint color mapping, paint targeting, movement, camera bounds, networking, or persistence behavior.
5. If any tile asset is unavailable, the fallback tile/cell presentation used in-game must also remain outline-free and non-breaking.

## Out of scope
- Adding new tile art themes, new paint colors, or new terrain states.
- Changing player sprites, HUD styling, world dimensions, or any gameplay mechanics tied to painting or movement.
- Introducing animated tile effects, shadows, bevels, or any other new visual treatment beyond removing the outline.

## Acceptance
- A reviewer can run the game and confirm that rendered tiles/cells no longer show an outline in normal play.
- Painted tiles for every supported color render without an outline for both the local player and nearby remote players.
- The tile field remains readable under the current isometric view after the outline is removed.
- Missing or failed tile assets still fall back to a stable, outline-free tile/cell presentation instead of breaking rendering.
