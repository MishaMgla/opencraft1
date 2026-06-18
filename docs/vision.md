# opencraft1 — product vision

> north-star description. the "why" and the long shape. the MVP scope lives in [`prd/mvp.md`](prd/mvp.md); the engine design lives in [`superpowers/specs/2026-06-11-opencraft1-mvp-engine-design.md`](superpowers/specs/2026-06-11-opencraft1-mvp-engine-design.md).

## one line

a multiplayer, browser-native world that many people inhabit at once — minimal and symbolic to look at, serious underneath.

## what it is

opencraft1 is a persistent, shared 2D world rendered in the browser with an isometric view (think the camera of baldur's gate / diablo, drawn as simple symbolic shapes rather than detailed art). players join, appear in the world, and move around the same territory in real time, seeing each other as they go.

the deliberate bet: **build a scalable real-time engine first, decide what the world is _for_ second.** the fiction is intentionally undecided. the first thing we prove is that a single shared world can hold a large, growing number of players moving smoothly. purpose — building, crafting, survival, social, territory — is layered on later, once the substrate is real.

## who it is for

- **players:** anyone with a browser. zero install, no download, low-friction entry (pick a name and you are in the world).
- **us, as builders:** an engine we can extend. each later capability (chat, persistence, world interaction) is an additive layer on a transport + simulation + interest-management core, not a rewrite.

## design principles

- **lightweight client.** symbolic graphics — colored isometric tiles and simple player tokens with name labels. no heavy art pipeline. rendered with [pixijs](https://pixijs.com) (webgl/webgpu) so the renderer never becomes the ceiling.
- **scale is a first-class feature, not an afterthought.** one shared world with spatial interest management from day one — each client only ever receives and renders its neighborhood, so total population can grow far past what any one client draws.
- **bytes matter.** a compact binary wire protocol from the start; bandwidth is the dominant cost of "many players in one world."
- **server owns truth (eventually).** the MVP relays client-computed movement with light validation; server-authoritative simulation is the hardening step taken when gameplay gains stakes.
- **additive roadmap.** every milestone is a layer that does not force a rewrite of the ones below it.

## the long shape (post-MVP, non-committal)

a rough sense of direction, not a commitment — order and inclusion are open:

- **communicate:** text chat, emotes, simple identity (avatar shape/color, persistent name).
- **persist:** real accounts; saved position and profile. the MVP data model is built account-ready so this is additive.
- **interact with the world:** the first shared-world action — place / remove a tile or object others can see. this is the seed of the "craft" in opencraft1.
- **scale out:** shard the single world's spatial grid across processes behind a gateway, without changing the client.
- **harden:** server-authoritative movement with client prediction + reconciliation once there are stakes to cheat for.

## what success looks like

- a stranger opens a url and is moving in a shared world within seconds, no install.
- many players occupy one world at once and movement stays smooth, because each client's cost is bounded by its neighborhood, not the total population.
- adding the next capability is a new layer, not a teardown.

## explicit non-goals (for now)

detailed art, audio, mobile-native clients, a defined game genre, an economy, combat, or monetization. these are deferred until the engine thesis is proven and the world's purpose is chosen.
