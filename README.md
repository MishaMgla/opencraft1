# openCraft

a multiplayer, browser-native shared world — minimal and symbolic to look at, a serious real-time engine underneath. players join, appear in a single shared isometric world, and move around the same territory in real time, seeing each other as they go.

the bet: **build the scalable real-time engine first, decide what the world is _for_ second.** the MVP proves that one shared world can hold many players moving smoothly; purpose (build / craft / social / survival) is layered on later.

## stack

- **backend:** Go — single-process fixed-tick simulation server with spatial interest management, over websockets, speaking a compact binary protocol.
- **client:** lightweight browser app — [pixijs](https://pixijs.com) (webgl/webgpu) isometric renderer + DOM HUD. symbolic graphics: diamond tiles and simple player tokens.

## start here

| you want | read |
|---|---|
| the product vision / north star | [`docs/vision.md`](docs/vision.md) |
| the MVP scope & requirements (PRD) | [`docs/prd/mvp.md`](docs/prd/mvp.md) |
| the MVP engine architecture | [`docs/superpowers/specs/2026-06-11-opencraft-mvp-engine-design.md`](docs/superpowers/specs/2026-06-11-opencraft-mvp-engine-design.md) |
| rules for working in this repo | [`AGENT_RULES.md`](AGENT_RULES.md) |
| repo navigation hub | [`docs/project-map/README.md`](docs/project-map/README.md) |

> status: pre-code. the product is defined; the `src/` tree does not exist yet. the MVP build sequence is in the engine design (m1 → m4).
