# PRD — opencraft1 MVP: shared-world movement + presence

- **status:** draft for build
- **date:** 2026-06-11
- **vision:** [`../vision.md`](../vision.md)
- **engine design (technical):** [`../superpowers/specs/2026-06-11-opencraft1-mvp-engine-design.md`](../superpowers/specs/2026-06-11-opencraft1-mvp-engine-design.md)

## 1. summary

the smallest possible vertical slice of opencraft1: a player opens a url, picks a name, and appears in a single shared isometric world where they can walk around and see other players moving in real time. no chat, no accounts, no world interaction.

the slice is deliberately tiny on _gameplay_ and deliberately serious on _engine_: it runs on a single shared world with spatial interest management, a fixed-tick server simulation, and a compact binary protocol — the architecture meant to carry thousands of concurrent players. the MVP exists to **prove that thesis**, not to be fun yet.

## 2. problem & goals

**problem.** we want a browser world that many people share at once, but we have not yet proven the engine that makes "many people, one world, smooth movement" hold. building gameplay before that substrate exists risks rework.

**goals.**

- G1. a new player goes from url to moving-in-the-world in seconds, no install, no login.
- G2. multiple players share one world and see each other move in real time.
- G3. per-client cost is bounded by the player's neighborhood (interest management), not total population — validated under synthetic load.
- G4. the data model and protocol leave clean seams for the post-MVP layers (chat, accounts, world interaction) with no rewrite.

**non-goals (MVP).** chat, accounts/persistence, world editing/crafting, combat, server-authoritative simulation, audio, mobile-native clients, art beyond symbolic shapes.

## 3. target users & platform

- **user:** anyone with a modern desktop browser (webgl2-capable; webgpu used opportunistically via pixijs).
- **entry:** a single public url. no account, no install.
- **session:** anonymous and ephemeral — a chosen display name, no saved state. (data model is built account-ready; persistence is a later layer.)

## 4. user experience

1. player opens the url. the client loads (lightweight: pixijs + a small bundle).
2. player types a display name and clicks "enter".
3. the isometric world renders: a tiled ground plane, the player's own token near center, and any nearby players already in view.
4. player moves with WASD / arrow keys. their token moves immediately (client-computed). the camera follows.
5. other players within view appear, move smoothly (interpolated), and disappear when they leave the neighborhood or disconnect.
6. closing the tab removes the player from the world for everyone nearby.

**look & feel.** symbolic isometric: diamond floor tiles, players as simple colored shapes with a name label and a subtle shadow for grounding. minimal HUD (own name; optionally a live player-count). UI chrome (name-entry, HUD) is plain DOM over the pixijs canvas.

## 5. functional requirements

| id | requirement |
|---|---|
| FR1 | client connects to the server over a websocket and sends a join message carrying the chosen display name. |
| FR2 | server assigns the player an id and a spawn position, and returns world bounds and the player's id. |
| FR3 | client renders the world isometrically with pixijs: tiled ground, own token, and visible remote players, depth-sorted by world position. |
| FR4 | client samples keyboard input and integrates the local player's movement locally, sending movement to the server at a bounded rate. |
| FR5 | server runs a fixed-tick simulation that applies movement, clamps positions to world bounds, and maintains a spatial index of all players. |
| FR6 | server sends each client, every tick, only the entities within that client's area of interest (its grid cell + neighbors), plus enter/leave events as players cross neighborhood boundaries. |
| FR7 | client interpolates remote players between received snapshots so motion is smooth despite the tick rate. |
| FR8 | on disconnect (close/drop), the server removes the player and emits a leave event to nearby clients. |
| FR9 | all client⇄server messages use a compact binary wire format with quantized positions (no JSON on the hot path). |
| FR10 | the server also serves the static client assets. |

## 6. success metrics

- **time-to-world:** url → moving in the world in under ~5 seconds on a typical desktop connection.
- **smoothness:** remote players render at a steady frame rate with no visible teleport/jitter under normal latency.
- **scale (the headline metric):** a synthetic load harness of N random-walking clients in one world demonstrates that **per-client outbound bandwidth and server CPU scale with neighborhood density, not with N.** target a concrete number on a single commodity box (e.g. low-thousands concurrent in one world) — exact figure set during the load-test milestone.
- **seam quality (qualitative):** adding a chat message type, or a persisted position, is an additive change to the message set / data model — confirmed by design review, not retrofit.

## 7. milestones

1. **m1 — walking skeleton:** one client, one server, websocket, binary join/welcome, a single moving token on an isometric tiled field. proves transport + render + protocol end to end.
2. **m2 — multiplayer presence:** multiple clients, server tick loop, broadcast of all positions (no interest management yet), remote-player interpolation, enter/leave on connect/disconnect.
3. **m3 — interest management:** spatial grid + per-client area-of-interest snapshots and enter/leave on neighborhood crossing. this is the milestone that makes scale real.
4. **m4 — load validation:** headless N-client load harness; measure CPU/bandwidth vs. population; record the concurrency number the architecture sustains on one box; tune tick rate / cell size / quantization.

## 8. risks & mitigations

- **bandwidth blow-up at scale** → interest management from m3 + quantized binary protocol; binary delta compression held in reserve as the first optimization.
- **client-authoritative movement is spoofable** → acceptable for a no-stakes sandbox MVP; server clamps to bounds; server-authoritative simulation is the explicit hardening layer when stakes arrive.
- **single-process ceiling** → single process is intended for MVP; the spatial grid is designed to shard across processes later behind a gateway with no client change.
- **slow clients stalling the server** → bounded per-client outbound buffers that drop stale snapshots; movement is loss-tolerant.

## 9. out of scope → roadmap

chat • emotes/identity • accounts & persistence • world interaction (place/remove tiles) • server-authoritative movement + prediction/reconciliation • binary delta compression • multi-process sharding + gateway • audio • mobile clients • any defined genre/economy/monetization. see [`../vision.md`](../vision.md) for the long shape.
