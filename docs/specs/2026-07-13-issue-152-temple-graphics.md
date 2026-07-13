# Spec — issue #152: Temple graphics

## Goal

Replace the temple's blurry, generic animation frames with crisp, uncanny temple art that better expresses opencraft1's established AI-slop visual identity.

## Context

The client renders the fixed temple as one centered, depth-sorted 3×3 landmark from four preloaded `temple-idle-*` tile frames, with a deterministic architectural fallback if art is unavailable ([client map](../project-map/client.md)). The landmark's location, collision, and world-action blocking are already established; this issue is a presentation-only asset refresh ([issue #143 spec](2026-07-13-issue-143-research-game-mechanics.md)).

## Requirements

1. Regenerate and replace the existing `temple-idle-0` through `temple-idle-3` assets at 128px, retaining their current asset names, manifest registration, and four-frame idle-loop integration.
2. Every replacement frame must be sharp and readable at normal game zoom: no intentionally soft focus, smeared edges, or low-detail blur.
3. The temple must remain clearly recognizable as one coherent building while presenting a deliberately uncanny silhouette: an oversized face-like arched doorway, mismatched leaning columns, and a stack of off-kilter roof slabs.
4. The four frames must depict one continuous idle motion: the roof and columns subtly skew outward, reach a more distorted pose, then return toward the initial pose; the building must remain centered over the same 3×3 footprint in every frame.
5. Use the repository asset-generation workflow and its existing house visual treatment; asset prompts must describe only the temple subject and its distinctive structural features.
6. Do not change the temple's renderer sizing, placement, depth sorting, frame rate, collision, paint/fire/bomb blocking, world coordinates, fallback behavior, protocol, controls, or any other gameplay behavior.

## Asset Generation
- type: tile
- name: temple-idle-0
- prompt: ancient temple with a face-like arched doorway, mismatched leaning columns, and stacked crooked roof slabs
- size: 128

## Asset Generation
- type: tile
- name: temple-idle-1
- prompt: ancient temple with a face-like arched doorway, mismatched leaning columns, and roof slabs tilting outward
- size: 128

## Asset Generation
- type: tile
- name: temple-idle-2
- prompt: ancient temple with a face-like arched doorway, mismatched leaning columns, and roof slabs skewed far apart
- size: 128

## Asset Generation
- type: tile
- name: temple-idle-3
- prompt: ancient temple with a face-like arched doorway, mismatched leaning columns, and roof slabs settling crookedly together
- size: 128

## Out of scope

- New temples, landmarks, structures, temple interiors, or gameplay interactions.
- Changes to the temple's footprint, location, collision, persistence, or action blocking.
- Renderer, camera, UI, protocol, control, or world-rule changes.

## Acceptance

- The running game displays the same single 3×3 temple using all four refreshed frames in its existing idle loop.
- At ordinary gameplay zoom, the temple's doorway, columns, and roof edges are visibly crisp and it reads as one building rather than a blurry generic shape.
- The animation visibly reaches an uncanny, asymmetric warped pose and settles back without shifting the landmark from its fixed footprint.
- Temple collision and all existing paint, fire, and bomb protections behave exactly as before.
- If a temple frame cannot load, the existing stationary solid fallback remains visible.
