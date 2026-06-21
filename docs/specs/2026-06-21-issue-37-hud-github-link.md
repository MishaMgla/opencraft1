# HUD github link

## Goal

Add a minimal fixed GitHub repository link to the game viewport so players can open the opencraft1 source page from the live client.

## Context

The current web client renders the game in `web/index.html` with plain DOM overlays positioned above the Pixi viewport, including the existing top-left HUD (`docs/project-map/client.md`). The MVP explicitly allows plain DOM HUD chrome over the symbolic world view (`docs/prd/mvp.md`), and issue #37 asks for a GitHub link anchored at the bottom-left of that viewport.

## Requirements

1. The web client must render a visible hyperlink to the opencraft1 repository at `https://github.com/MishaMgla/opencraft1/`.
2. The link must be positioned as a fixed overlay at the bottom-left corner of the game viewport, above the rendered world rather than inside the Pixi scene.
3. The link must remain anchored to the bottom-left corner while the camera moves, the player moves, or the browser viewport resizes.
4. The link must be readable and clickable without obscuring core gameplay elements; the implementation must keep the presentation minimal and low-chrome rather than introducing a new panel, modal, or expanded HUD section.
5. Activating the link must open the repository URL in the browser without altering game state, movement, networking, or the existing name-entry flow.
6. The change must not modify the existing top-left HUD content except as needed to coexist cleanly with the new bottom-left link.

## Out of scope

- Adding any other external links, social links, or footer navigation.
- Redesigning the existing HUD or name-entry overlay.
- Adding repository metadata such as stars, badges, or version text.
- Changing rendering, wire protocol, server behavior, or deployment configuration.

## Acceptance

1. Launching the client shows a GitHub link over the game viewport at the bottom-left corner.
2. The link text or anchor remains fixed in that corner during movement and after resizing the browser window.
3. Clicking the link opens `https://github.com/MishaMgla/opencraft1/`.
4. The existing name-entry overlay, top-left HUD, world rendering, and gameplay behavior continue to work as before.
