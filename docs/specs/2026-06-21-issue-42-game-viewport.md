# Game viewport HUD zoom controls

## Goal

Add subtle HUD zoom controls that let players scale the game viewport in fixed steps, and add a short HUD hint that `Space` changes the current cell color.

## Context

The current client uses plain DOM overlays in `web/index.html` for lightweight HUD chrome above the Pixi-rendered world, including the existing top-left HUD (`docs/project-map/client.md`). The product vision and MVP both allow additive UI polish on top of the existing browser-based isometric world without changing the underlying engine shape (`docs/vision.md`, `docs/prd/mvp.md`). Issue #42 asks for minimal `+` and `-` HUD controls near the existing top-left HUD text, with smooth step zoom and a short `Space` key explanation.

## Requirements

1. The game viewport must expose two visible HUD controls labeled `+` and `-` for zooming the in-game view.
2. The `+` and `-` controls must live next to the existing top-left HUD text as part of the same HUD overlay, not in another corner and not inside the Pixi scene itself.
3. The controls must use step-based zoom rather than three fixed presets: each activation changes the viewport zoom by `10%`.
4. Repeated zoom-in actions must cap at `150%` of the default viewport scale, and repeated zoom-out actions must cap at `50%` of the default viewport scale.
5. The zoom change must affect the in-game viewport scale only; it must not rely on browser page zoom and must not alter unrelated page layout outside the game HUD.
6. The control styling must stay minimal and subtle, matching the lightweight HUD direction rather than introducing a large panel, modal, or heavy chrome treatment.
7. The existing top-left HUD must also include a short explanatory hint that pressing `Space` changes the current cell color.
8. The new `Space` hint must be concise, always visible during gameplay, and placed so it reads as part of the existing HUD rather than a separate tutorial overlay.
9. Adding the zoom controls and `Space` hint must not change movement controls, networking behavior, tile-paint rules, or other gameplay systems beyond the viewport scale adjustment itself.

## Out of scope

- Keyboard zoom shortcuts, mouse-wheel zoom, pinch zoom, or gesture support.
- Redesigning the rest of the HUD or name-entry overlay.
- Changing server behavior, wire protocol, or world-state rules.
- Adding longer onboarding, tooltips, or a dedicated controls help modal.

## Acceptance

1. During gameplay, the top-left HUD shows subtle `+` and `-` zoom controls alongside the existing HUD text plus a short `Space` hint.
2. Clicking `+` increases the in-game viewport scale by `10%` per click until it reaches `150%`, after which further zoom-in attempts do not increase it more.
3. Clicking `-` decreases the in-game viewport scale by `10%` per click until it reaches `50%`, after which further zoom-out attempts do not decrease it more.
4. The zoom controls change only the game viewport presentation; they do not trigger browser page zoom or disrupt the rest of the HUD/layout.
5. Movement, painting with `Space`, camera follow, and multiplayer behavior otherwise continue to work as before.
