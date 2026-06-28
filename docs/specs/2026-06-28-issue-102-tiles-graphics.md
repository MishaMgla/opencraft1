# Spec — issue #102: Tiles graphics

## Goal
Replace plain paint-color tiles with distinct themed tile graphics for each of the current eight paint colors.

## Context
The game already lets players repaint tiles into shared color states, and the client renders the world as a symbolic isometric tile field with additive asset loading through `web/assets/manifest.json` and `web/src/assets.ts` ([docs/project-map/client.md](../project-map/client.md)). This request is an in-scope presentation upgrade that adds clearer world identity to painted terrain without changing the existing multiplayer paint mechanic or the lightweight browser-native direction in the product vision ([docs/vision.md](../vision.md)).

## Requirements
1. Every currently paintable tile color must render with its own distinct terrain-themed tile graphic rather than as a plain color-only tile.
2. The shipped color-to-theme mapping must be exactly: red = lava, green = grass, yellow = sand, blue = water, orange = copper, purple = crystal, cyan = ice, pink = flowers.
3. Repainting a tile into a different color must immediately swap that tile to the matching themed graphic for the new color, using the same existing paint state and multiplayer visibility rules.
4. The new tile graphics must remain readable as one cohesive set in the existing isometric world presentation and must preserve quick visual recognition of each paint color.
5. The change may add or register tile assets and update the client tile-rendering path to use them, but it must not change world size, tile coordinates, paint targeting, movement, ult behavior, networking, persistence, or any non-tile gameplay rules.
6. If a tile asset is missing or fails to load, the game must remain playable through a deterministic fallback presentation rather than breaking world rendering.

## Asset Generation
- type: tile
- name: lava-tile
- prompt: molten lava ground with bright red cracks
- size: 64

## Asset Generation
- type: tile
- name: grass-tile
- prompt: grassy ground with short green blades
- size: 64

## Asset Generation
- type: tile
- name: sand-tile
- prompt: sandy ground with soft yellow ripples
- size: 64

## Asset Generation
- type: tile
- name: water-tile
- prompt: shallow blue water surface with gentle wave shapes
- size: 64

## Asset Generation
- type: tile
- name: copper-tile
- prompt: copper metal ground with warm orange oxidation and plate seams
- size: 64

## Asset Generation
- type: tile
- name: crystal-tile
- prompt: purple crystal ground with clustered angular shards
- size: 64

## Asset Generation
- type: tile
- name: ice-tile
- prompt: pale cyan ice ground with frosty cracks
- size: 64

## Asset Generation
- type: tile
- name: flowers-tile
- prompt: pink flower-covered ground with dense blossoms
- size: 64

## Out of scope
- Adding new paint colors, changing the number of paintable tile states, or changing which gameplay actions produce them.
- Reworking unpainted base terrain, player sprites, HUD art, camera behavior, or broader world art direction beyond these eight painted tile states.
- Animated effects, audio, biome systems, terrain mechanics, or gameplay bonuses tied to tile themes.

## Acceptance
- A reviewer can inspect the asset set and confirm there are eight distinct tile graphics matching the locked mapping: lava, grass, sand, water, copper, crystal, ice, and flowers.
- In the running game, repainting a tile to each supported color visibly swaps that tile to the corresponding themed graphic for local and remote players under the existing shared paint behavior.
- The themed tiles still read clearly in the current isometric presentation and remain distinguishable by color at gameplay glance.
- Breaking or removing one or more tile assets does not make the world unusable; the tile surface falls back to a stable non-crashing presentation.
