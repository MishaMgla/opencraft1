# design — opencraft MVP engine

- **date:** 2026-06-11
- **status:** approved for planning
- **product context:** [`../../vision.md`](../../vision.md) · [`../../prd/mvp.md`](../../prd/mvp.md)

technical design for the MVP: a single shared isometric world where many players move and see each other in real time. companion to the PRD — the PRD says _what_ and _why_, this says _how_.

## 1. decisions (locked)

| axis | choice | why |
|---|---|---|
| backend language | **Go** | strong concurrency story (goroutines + channels) for a tick loop + many connections in one process. |
| architecture | **single-process authoritative-relay tick server + grid interest management** | serious enough to validate "thousands in one world", small enough to ship as one binary. shards later without a client change. |
| transport | **websocket** (binary frames) | universal browser support. abstracted so webtransport/webrtc can slot in later for udp-style latency. |
| serialization | **custom compact binary** wire format, quantized positions | size is the priority; we control every byte. no JSON on the hot path. protobuf is the fallback only if message evolution gets painful. |
| movement authority | **client-authoritative position, server bounds-validation + relay** | no stakes yet; skips prediction/reconciliation complexity. server-authoritative sim is the named hardening layer for later. |
| client renderer | **pixijs v8** (webgl/webgpu) | gpu-batched 2D; isometric via `zIndex` depth sort. never the ceiling. DOM for HUD/UI overlay. |
| view | **isometric** | the baldur's-gate/diablo camera, drawn symbolically. a pure client-render concern — see §6. |

rejected: broadcast-everything (no interest mgmt — ~100-200 ceiling, dead end); sharded-multi-process-from-day-one (real horizontal scale but heavy infra for a movement demo — this is what the design _grows into_, not where it starts).

## 2. system overview

```
browser client (pixijs + DOM HUD)
      │  websocket, binary frames
      ▼
┌─────────────────────────── Go process ───────────────────────────┐
│  static file server  ──serves──▶ client assets                    │
│                                                                   │
│  per-connection goroutine (×N)        simulation goroutine (×1)   │
│    read  → decode → inbound chan ───▶  owns ALL world state       │
│    write ← per-client outbound chan ◀─ 15 Hz fixed tick:          │
│                                          apply input, update grid, │
│                                          build per-client AoI deltas│
└───────────────────────────────────────────────────────────────────┘
```

single source of truth = the simulation goroutine. no shared-state locks: I/O goroutines and the sim communicate only through channels.

## 3. server components

each is a unit with one purpose, a clear interface, and testable in isolation.

### 3.1 connection handler (goroutine per socket)
- **does:** owns one websocket. reads binary frames, decodes to typed input events, pushes them onto the sim's inbound channel. drains its own bounded outbound channel and writes frames.
- **interface:** in = websocket; out = `inbound chan<- inputEvent`, `outbound <-chan frame`.
- **backpressure:** outbound channel is bounded; when full, drop the oldest snapshot (movement is loss-tolerant). a slow client never blocks the sim.

### 3.2 simulation core (single goroutine)
- **does:** owns the world map (id → entity{pos, vel, name, color}). on each 15 Hz tick: drain inbound inputs, integrate/clamp positions, update the spatial grid, and for every connected client compute its area-of-interest delta, enqueue a snapshot frame to that client's outbound channel.
- **interface:** in = inbound input channel + connect/disconnect signals; out = per-client outbound channels.
- **note:** holds no sockets and does no I/O — pure state + timing. directly unit-testable by feeding inputs and asserting outputs.

### 3.3 spatial grid (interest management)
- **does:** partitions the world into uniform square cells (e.g. 256 world-units). maps cell → set of entity ids and entity → cell. answers "entities visible to player P" = union of P's cell + 8 neighbors. detects neighborhood crossings to produce enter/leave events.
- **interface:** `insert/move/remove(id, pos)`, `neighbors(pos) -> []id`, `crossed(id, oldPos, newPos) -> (entered, left)`.
- **why uniform grid:** simplest structure that delivers O(1)-ish neighborhood queries and shards cleanly later (cells → processes).

### 3.4 static file server
- **does:** serves the pixijs client bundle + index.html. same process, separate http handler from the websocket upgrade endpoint.

## 4. client components

### 4.1 net layer
- websocket with `binaryType = 'arraybuffer'`. encode input / decode snapshots with `DataView`, mirroring the Go wire format byte-for-byte. dequantizes int16 positions back to world units.

### 4.2 input
- samples WASD/arrow state each frame, integrates the **local** player's position locally (immediate response), and sends movement to the server at a bounded rate (~15-30 Hz, rate-limited).

### 4.3 renderer (pixijs v8)
- `await app.init({ preference: 'webgl', antialias, resizeTo: window })`; append `app.canvas`.
- a world `Container` with `sortableChildren = true`; each entity's `zIndex` = its world depth (see §6) so tokens overlap correctly.
- ground = isometric diamond tiles; each player = a simple shape (`Graphics`/`Sprite`) + a name `Text` label + a soft shadow.
- **local** player rendered from its authoritative local position; **remote** players **interpolated** between their last two snapshot positions in the ticker to hide tick granularity. camera follows the local player.
- enter event → add a display object; leave event → remove it.

### 4.4 HUD (DOM)
- name-entry screen and minimal in-world HUD are plain DOM positioned over the canvas. pixijs draws the world; DOM draws the chrome.

## 5. wire protocol (binary)

first byte = message type. multi-byte integers little-endian. positions quantized to **int16** (world units → fixed scale), ids as varint/uint32, strings as length-prefixed utf-8.

**client → server**
- `Hello { name }` — join with display name.
- `Input { seq:u16, x:i16, y:i16 }` — client-authoritative position (or `dx,dy` intent); `seq` for future reconciliation.
- `Ping { t }`.

**server → client**
- `Welcome { yourId, worldMinX,worldMinY,worldMaxX,worldMaxY }`.
- `Snapshot { tick:u32, count:u16, [ id, x:i16, y:i16 ]… }` — entities in the recipient's area of interest this tick.
- `Enter { id, x:i16, y:i16, color, name }` — an entity entered the neighborhood.
- `Leave { id }` — entity left neighborhood or disconnected.
- `Pong { t }`.

the message set is intentionally tiny and additive: chat, world-edits, and persisted fields are **new message types / new fields**, not changes to these. (this is the PRD's "seam quality" goal.)

## 6. isometric projection (client-only)

the server is projection-agnostic — it works entirely in flat world coordinates `(wx, wy)`. isometric is purely a render-time transform:

```
screenX = (wx - wy) * TILE_W/2
screenY = (wx + wy) * TILE_H/2
depth (zIndex) = wx + wy
```

consequence: **choosing isometric vs top-down touches nothing in the engine, protocol, or server.** it is a client renderer detail and can change without server impact.

## 7. error handling & resilience

- malformed/short frame → drop that frame, log, keep the connection alive.
- out-of-bounds position → server clamps to world bounds (FR5).
- disconnect (clean or dropped) → sim removes the entity, emits `Leave` to nearby clients.
- backpressure → bounded per-client outbound buffer drops oldest snapshots; never blocks the sim (§3.1).
- the sim goroutine is the only writer of world state → no data races by construction.

## 8. testing

> per repo rule, automated tests are added only when explicitly requested. this section is the _intended_ test surface for when test work is greenlit — not a license to write tests unprompted.

- **unit (Go):** grid subscription/neighborhood math; AoI enter/leave delta computation; wire encode↔decode round-trips (incl. position quantization error bounds); bounds clamping.
- **load harness (Go, headless):** spawn N synthetic websocket clients doing random walks; measure server CPU and per-client outbound bandwidth as a function of N and neighborhood density; this is how the PRD's headline scale metric (G3) is validated and the sustained-concurrency number is found.
- **manual:** two+ browser tabs, confirm presence, movement smoothness, enter/leave correctness.

## 9. build sequence

mirrors the PRD milestones: **m1** transport+render+protocol with one moving token → **m2** multi-client presence with naive broadcast + interpolation → **m3** swap broadcast for grid interest management → **m4** load harness + tuning (tick rate, cell size, quantization scale). interest management lands at m3 so m1-m2 stay maximally simple.

## 10. deferred (named seams, not built now)

webtransport/webrtc transport • binary delta compression beyond quantization • server-authoritative simulation + client prediction/reconciliation • accounts/persistence (entity model is built to accept a stable identity + saved fields) • multi-process sharding of the grid behind a gateway • chat / world-edit message types.
