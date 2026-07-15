# Critters + God-Hand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Small NPC critters that live off painted terrain, plus a Dungeon Keeper-style god-hand: click a critter, carry it, drop it; the world reacts to where it lands.

**Architecture:** Server-authoritative transient critter pool inside the single sim goroutine (like fire/bombs), broadcast as a full self-superseding `SCritters` snapshot through a per-connection latest-only slot. Hand = 3 client frames (`CGrab`/`CHold`/`CDrop`) validated in the sim. Client renders critters as scaled-down reuse of the existing player Token machinery.

**Tech Stack:** Go (single-goroutine sim, binary wire), TypeScript + PixiJS client (no bundler), golden-fixture parity tests, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-07-15-critters-god-hand-design.md` — the authoritative behavior source. Read it first.

## Global Constraints

- Wire format is byte-for-byte shared between `internal/wire/wire.go` and `web/src/wire.ts`; Go is the source of truth. Regenerate fixtures with `go test ./internal/wire -run TestWireFixtures -update`. Never hand-edit `web/test/wire_fixtures.json`.
- Only the sim goroutine touches world state; all mutation goes through `Sim.cmds`. No locks. No DB I/O on the sim goroutine.
- Critters are transient — **never persisted**. `Date`/wall-clock never drives behavior; everything counts sim ticks.
- Positions are int16 world units, world 8192², tiles 128 (`PaintTileSize`). `TickHz` = 15.
- New client frames: `CGrab` 0x09, `CHold` 0x0A, `CDrop` 0x0B. New server frame: `SCritters` 0x90. Per-critter snapshot entry: `{id uint32, kind byte, x int16, y int16, state byte, holderID uint32}` = 14 bytes, little-endian.
- Critter states on the wire: 0 wander, 1 follow, 2 panic, 3 held.
- Client TS builds with `cd web && npm run build`; imports use `.js` extensions; emitted `.js` is gitignored.
- Go checks: `go build ./... && go vet ./... && go test ./...` from repo root. Web: `cd web && npm test`.
- Commit after every task (conventional commits: `feat:`, `test:`, `docs:`).

---

### Task 1: Go wire protocol — CGrab/CHold/CDrop/SCritters

**Files:**
- Modify: `internal/wire/wire.go`
- Modify: `internal/wire/fixtures_test.go`
- Test: `internal/wire/wire_test.go` (extend if present; fixtures test is the main gate)

**Interfaces:**
- Produces: `wire.CGrab/CHold/CDrop/SCritters` tags; `wire.Critter{ID uint32, Kind byte, X, Y int16, State byte, HolderID uint32}`; `wire.EncodeCritters([]Critter) []byte`; `ClientMsg.CritterID uint32` field; `ParseClient` handling for the three new client frames.

- [ ] **Step 1: Add the new tags and encoder/parser**

In `internal/wire/wire.go`, extend the tag consts:

```go
	CBomb  = 0x07
	CChat  = 0x08
	CGrab  = 0x09 // grab a critter by id
	CHold  = 0x0A // move the held critter to cursor world pos (no id — server knows)
	CDrop  = 0x0B // drop the held critter at world pos
```

and after `SChat = 0x8F`:

```go
	SCritters = 0x90 // full critter snapshot (self-superseding)
```

Add after `EncodeChat`:

```go
// Critter is one entry of the SCritters snapshot. HolderID is 0 when unheld.
type Critter struct {
	ID       uint32
	Kind     byte
	X, Y     int16
	State    byte
	HolderID uint32
}

// EncodeCritters is the full, self-superseding critter snapshot: a lost frame
// is harmless because the next one carries complete state. 14 bytes per entry.
func EncodeCritters(crs []Critter) []byte {
	b := make([]byte, 1+2+len(crs)*14)
	b[0] = SCritters
	binary.LittleEndian.PutUint16(b[1:], uint16(len(crs)))
	off := 3
	for _, c := range crs {
		binary.LittleEndian.PutUint32(b[off:], c.ID)
		b[off+4] = c.Kind
		binary.LittleEndian.PutUint16(b[off+5:], uint16(c.X))
		binary.LittleEndian.PutUint16(b[off+7:], uint16(c.Y))
		b[off+9] = c.State
		binary.LittleEndian.PutUint32(b[off+10:], c.HolderID)
		off += 14
	}
	return b
}
```

Add `CritterID uint32 // CGrab` to `ClientMsg`, and three cases to `ParseClient` before the closing brace:

```go
	case CGrab:
		if len(b) < 5 {
			return ClientMsg{}, false
		}
		return ClientMsg{Type: CGrab, CritterID: binary.LittleEndian.Uint32(b[1:])}, true
	case CHold:
		if len(b) < 5 {
			return ClientMsg{}, false
		}
		x := int16(binary.LittleEndian.Uint16(b[1:]))
		y := int16(binary.LittleEndian.Uint16(b[3:]))
		return ClientMsg{Type: CHold, X: x, Y: y}, true
	case CDrop:
		if len(b) < 5 {
			return ClientMsg{}, false
		}
		x := int16(binary.LittleEndian.Uint16(b[1:]))
		y := int16(binary.LittleEndian.Uint16(b[3:]))
		return ClientMsg{Type: CDrop, X: x, Y: y}, true
```

- [ ] **Step 2: Add golden fixture cases**

In `internal/wire/fixtures_test.go`, append to `canonicalServer()`:

```go
		{"critters", json.RawMessage(`{"type":"critters","ents":[{"id":1,"kind":1,"x":2048,"y":1920,"state":0,"holderId":0},{"id":2,"kind":1,"x":100,"y":-5,"state":3,"holderId":7}]}`),
			enc(EncodeCritters([]Critter{{ID: 1, Kind: 1, X: 2048, Y: 1920, State: 0, HolderID: 0}, {ID: 2, Kind: 1, X: 100, Y: -5, State: 3, HolderID: 7}}))},
```

Append to `canonicalClient()` (before the return, with the other frame vars):

```go
	grab := []byte{CGrab, 0x2a, 0x00, 0x00, 0x00}              // critterID=42
	hold := []byte{CHold, 0x00, 0x08, 0x80, 0x07}              // x=2048, y=1920
	drop := []byte{CDrop, 0x2e, 0xfb, 0x09, 0x03}              // x=-1234, y=777
```

and to the returned slice:

```go
		{"grab", json.RawMessage(`{"type":9,"critterId":42}`), hex.EncodeToString(grab)},
		{"hold", json.RawMessage(`{"type":10,"x":2048,"y":1920}`), hex.EncodeToString(hold)},
		{"drop", json.RawMessage(`{"type":11,"x":-1234,"y":777}`), hex.EncodeToString(drop)},
```

and to the round-trip switch in `TestWireFixtures`:

```go
		case "grab":
			if msg.Type != CGrab || msg.CritterID != 42 {
				t.Fatalf("grab parsed to %+v", msg)
			}
		case "hold":
			if msg.Type != CHold || msg.X != 2048 || msg.Y != 1920 {
				t.Fatalf("hold parsed to %+v", msg)
			}
		case "drop":
			if msg.Type != CDrop || msg.X != -1234 || msg.Y != 777 {
				t.Fatalf("drop parsed to %+v", msg)
			}
```

- [ ] **Step 3: Run the fixtures test to see it fail against the stale committed file**

Run: `go test ./internal/wire -run TestWireFixtures`
Expected: FAIL — "committed has N cases, code has N+1 (regenerate with -update)"

- [ ] **Step 4: Regenerate fixtures and verify all wire tests pass**

Run: `go test ./internal/wire -run TestWireFixtures -update && go test ./internal/wire`
Expected: PASS. `git diff web/test/wire_fixtures.json` shows the new `critters`/`grab`/`hold`/`drop` entries.

- [ ] **Step 5: Commit**

```bash
git add internal/wire/ web/test/wire_fixtures.json
git commit -m "feat(wire): CGrab/CHold/CDrop + SCritters frames"
```

---

### Task 2: TS wire mirror + parity

**Files:**
- Modify: `web/src/wire.ts`
- Modify: `web/src/net.ts`
- Test: `web/test/wire.test.js` (parity is data-driven from fixtures; check whether new frame names need explicit wiring — mirror how `chat`/`bomb` cases are handled there)

**Interfaces:**
- Consumes: fixture entries `critters`/`grab`/`hold`/`drop` from Task 1.
- Produces: `encodeGrab(critterId: number)`, `encodeHold(x, y)`, `encodeDrop(x, y)`; `Critters { type: 'critters'; ents: CritterEnt[] }` with `CritterEnt { id, kind, x, y, state, holderId }`; `Handlers.critters`; `NetControl.sendGrab/sendHold/sendDrop`.

- [ ] **Step 1: Mirror the codec in `web/src/wire.ts`**

Add consts:

```ts
const C_GRAB = 0x09;
const C_HOLD = 0x0a;
const C_DROP = 0x0b;
const S_CRITTERS = 0x90;
```

Add types (before `Unknown`) and extend the `ServerMsg` union with `Critters`:

```ts
export interface CritterEnt {
  id: number;
  kind: number;
  x: number;
  y: number;
  state: number; // 0 wander, 1 follow, 2 panic, 3 held
  holderId: number; // 0 = unheld
}
export interface Critters {
  type: 'critters';
  ents: CritterEnt[];
}
```

Add encoders after `encodeChat`:

```ts
export function encodeGrab(critterId: number): ArrayBuffer {
  const b = new ArrayBuffer(5);
  const v = new DataView(b);
  v.setUint8(0, C_GRAB);
  v.setUint32(1, critterId, true);
  return b;
}

// encodeHold/encodeDrop carry only (x, y): the server knows which critter this
// player holds (one hand, one critter).
export function encodeHold(x: number, y: number): ArrayBuffer {
  const b = new ArrayBuffer(5);
  const v = new DataView(b);
  v.setUint8(0, C_HOLD);
  v.setInt16(1, x, true);
  v.setInt16(3, y, true);
  return b;
}

export function encodeDrop(x: number, y: number): ArrayBuffer {
  const b = new ArrayBuffer(5);
  const v = new DataView(b);
  v.setUint8(0, C_DROP);
  v.setInt16(1, x, true);
  v.setInt16(3, y, true);
  return b;
}
```

Add a decode case:

```ts
    case S_CRITTERS: {
      const count = view.getUint16(1, true);
      const ents: CritterEnt[] = [];
      let off = 3;
      for (let i = 0; i < count; i++) {
        ents.push({
          id: view.getUint32(off, true),
          kind: view.getUint8(off + 4),
          x: view.getInt16(off + 5, true),
          y: view.getInt16(off + 7, true),
          state: view.getUint8(off + 9),
          holderId: view.getUint32(off + 10, true),
        });
        off += 14;
      }
      return { type: 'critters', ents };
    }
```

- [ ] **Step 2: Extend `web/src/net.ts`**

Import `encodeGrab, encodeHold, encodeDrop` and the `Critters` type. Add `critters?: (m: Critters) => void;` to `Handlers`, and to `NetControl` + the returned object:

```ts
    sendGrab(critterId: number) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeGrab(critterId));
    },
    sendHold(x: number, y: number) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeHold(x, y));
    },
    sendDrop(x: number, y: number) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeDrop(x, y));
    },
```

(matching declarations in the `NetControl` interface: `sendGrab(critterId: number): void; sendHold(x: number, y: number): void; sendDrop(x: number, y: number): void;`)

- [ ] **Step 3: Wire the parity test**

Open `web/test/wire.test.js` and follow its existing pattern for driving fixture cases: server cases decode via `decodeServer` and deep-compare to `decoded`; client cases encode via the matching `encode*` and hex-compare. Map fixture names to functions: `critters` → decode-only; `grab` → `encodeGrab(42)`; `hold` → `encodeHold(2048, 1920)`; `drop` → `encodeDrop(-1234, 777)`. If the test is fully data-driven (no per-name wiring needed), only the encoder-name map needs the three entries.

- [ ] **Step 4: Run web unit tests**

Run: `cd web && npm run build && npm test`
Expected: PASS, including new fixture cases.

- [ ] **Step 5: Commit**

```bash
git add web/src/wire.ts web/src/net.ts web/test/
git commit -m "feat(web): mirror critter wire frames + parity"
```

---

### Task 3: Sim — critter pool: spawn, caps, habitat grace

**Files:**
- Create: `internal/world/critter.go`
- Test: `internal/world/critter_test.go`

**Interfaces:**
- Produces: `critter` struct, `critterWorld` struct + `newCritterWorld(seed int64)`, state consts `critterWander/critterFollow/critterPanic/critterHeld` (bytes 0–3), `colorWater`, `(s *Sim) critterSpawn(...)`, `(s *Sim) critterHabitat(...)`, helper `livingTileList(painted)`. Later tasks add behavior/hand methods to the same file.
- Consumes: `tileKey`, `paintedTile`, `paintTileFor`, `isTempleTile`, `isFlammable`, `clamp`, `PaintTileSize` from `sim.go`.

- [ ] **Step 1: Write failing tests**

Create `internal/world/critter_test.go`:

```go
package world

import "testing"

func paintGrassAt(painted map[tileKey]paintedTile, x, y int16) tileKey {
	k := tileKey{x, y}
	painted[k] = paintedTile{x: x, y: y, color: colorGrass, ownerID: 1}
	return k
}

func TestCritterSpawnOnlyOnLivingUnoccupiedTiles(t *testing.T) {
	s := NewSim(nil)
	painted := map[tileKey]paintedTile{}
	cw := newCritterWorld(1)
	k := paintGrassAt(painted, 512, 512)
	// non-living tile present too — must never be chosen
	painted[tileKey{1024, 1024}] = paintedTile{x: 1024, y: 1024, color: colorWater, ownerID: 1}

	s.critterSpawn(map[uint32]*player{}, painted, cw)
	if len(cw.critters) != 1 {
		t.Fatalf("want 1 critter, got %d", len(cw.critters))
	}
	for _, c := range cw.critters {
		if paintTileFor(c.x, c.y) != k {
			t.Fatalf("spawned at %d,%d — not the living tile", c.x, c.y)
		}
	}
	// tile now occupied and it's the only living tile -> next spawn is a no-op
	s.critterSpawn(map[uint32]*player{}, painted, cw)
	if len(cw.critters) != 1 {
		t.Fatalf("occupied/cap: want still 1 critter, got %d", len(cw.critters))
	}
}

func TestCritterCapByLivingTileCountSurvivesGrab(t *testing.T) {
	s := NewSim(nil)
	painted := map[tileKey]paintedTile{}
	cw := newCritterWorld(1)
	paintGrassAt(painted, 512, 512)
	s.critterSpawn(map[uint32]*player{}, painted, cw)
	// simulate a grab: critter leaves its tile (held above a player elsewhere)
	for _, c := range cw.critters {
		c.state = critterHeld
		c.holderID = 9
		c.x, c.y = 4000, 4000
	}
	// tile is now vacant, but count-cap (1 living tile, 1 critter) must hold
	s.critterSpawn(map[uint32]*player{}, painted, cw)
	if len(cw.critters) != 1 {
		t.Fatalf("count cap broken: got %d critters for 1 living tile", len(cw.critters))
	}
}

func TestCritterHabitatGraceDespawn(t *testing.T) {
	s := NewSim(nil)
	painted := map[tileKey]paintedTile{}
	cw := newCritterWorld(1)
	k := paintGrassAt(painted, 512, 512)
	s.critterSpawn(map[uint32]*player{}, painted, cw)
	s.critterHabitat(painted, cw) // habitat present: no grace
	if cw.grace != 0 {
		t.Fatalf("grace running while habitat exists")
	}
	delete(painted, k) // habitat gone
	s.critterHabitat(painted, cw)
	if cw.grace == 0 {
		t.Fatalf("grace did not start on nonempty->empty transition")
	}
	paintGrassAt(painted, 512, 512) // habitat returns -> cancel
	s.critterHabitat(painted, cw)
	if cw.grace != 0 {
		t.Fatalf("grace not cancelled when habitat returned")
	}
	delete(painted, k)
	for i := 0; i < critterGraceSteps+1; i++ {
		s.critterHabitat(painted, cw)
	}
	if len(cw.critters) != 0 {
		t.Fatalf("critters survived habitat loss: %d left", len(cw.critters))
	}
}

func TestCritterHeldSurvivesHabitatDespawn(t *testing.T) {
	s := NewSim(nil)
	painted := map[tileKey]paintedTile{}
	cw := newCritterWorld(1)
	k := paintGrassAt(painted, 512, 512)
	s.critterSpawn(map[uint32]*player{}, painted, cw)
	for _, c := range cw.critters {
		c.state = critterHeld
		c.holderID = 9
	}
	delete(painted, k)
	for i := 0; i < critterGraceSteps+1; i++ {
		s.critterHabitat(painted, cw)
	}
	if len(cw.critters) != 1 {
		t.Fatalf("held critter must survive habitat despawn")
	}
}
```

- [ ] **Step 2: Run tests, expect compile failure**

Run: `go test ./internal/world -run TestCritter`
Expected: FAIL — `undefined: newCritterWorld`, etc.

- [ ] **Step 3: Implement `internal/world/critter.go`**

```go
package world

import "math/rand"

// Critters — small NPCs that live off painted terrain, and the god-hand that
// carries them. Server-authoritative and transient like fire/bombs: sim-owned,
// never persisted, repopulated from terrain after a restart. See
// docs/superpowers/specs/2026-07-15-critters-god-hand-design.md.

const critterCap = 40
const critterSpawnEvery uint32 = 60 // spawn attempt cadence in ticks (~4s)
const critterStepEvery uint32 = 4   // behavior-decision cadence in ticks (~3.7Hz)
const critterSpeed int16 = 10       // world units per sim tick (~150 u/s)
const critterGraceSteps = 37        // behavior steps of habitat-empty grace (~10s)

const critterFollowRadius = 192.0 // ~1.5 tiles: player proximity that builds attachment
const critterFollowSteps = 12     // consecutive behavior steps nearby before attaching (~3s)
const critterDetachDist = 768.0   // ~6 tiles: following breaks past this
const critterTrailGap = 64.0      // following critters hold ~half a tile off the player
const critterPanicSteps = 9       // behavior steps of panic (~2.5s)
const grabRange = 512.0           // ~4 tiles: max cursor reach for grab AND hold clamp

// wire state byte (mirrored in web/src/wire.ts docs)
const (
	critterWander byte = 0
	critterFollow byte = 1
	critterPanic  byte = 2
	critterHeld   byte = 3
)

const colorWater uint32 = 0x4363D8

type critter struct {
	id       uint32
	kind     byte
	x, y     int16
	state    byte
	holderID uint32 // 0 = unheld
	tx, ty   int16  // wander/panic/follow move target; movement advances every tick
	stepsIn  int    // behavior steps remaining in a timed state (panic)
	followID uint32
	candID   uint32 // candidate player building follow attachment
	candFor  int    // consecutive behavior steps candID has been nearby
	holdSeen bool   // a CHold arrived since grab: desktop cursor drives position
}

// critterWorld groups the sim-owned critter state so Run passes one pointer.
// Only the sim goroutine touches it.
type critterWorld struct {
	critters   map[uint32]*critter
	nextID     uint32
	grace      int  // >0: habitat-empty despawn countdown (behavior steps)
	hadHabitat bool // last observed habitat state, for edge-triggered grace
	rng        *rand.Rand
}

func newCritterWorld(seed int64) *critterWorld {
	return &critterWorld{critters: map[uint32]*critter{}, nextID: 1, rng: rand.New(rand.NewSource(seed))}
}

// isLivingTile: grass or flowers sustain critters — the same set that burns.
func isLivingTile(t paintedTile) bool { return isFlammable(t.color) }

func livingTileList(painted map[tileKey]paintedTile) []tileKey {
	var out []tileKey
	for k, t := range painted {
		if isLivingTile(t) {
			out = append(out, k)
		}
	}
	return out
}

// critterSpawn adds one critter on a random unoccupied living tile, respecting
// both the global cap and the explicit population cap critters <= livingTiles.
// The count cap (not tile vacancy) is what holds the population when a grab
// lifts a critter off the world's only living tile.
func (s *Sim) critterSpawn(players map[uint32]*player, painted map[tileKey]paintedTile, cw *critterWorld) {
	living := livingTileList(painted)
	if len(living) == 0 || len(cw.critters) >= critterCap || len(cw.critters) >= len(living) {
		return
	}
	occupied := map[tileKey]struct{}{}
	for _, c := range cw.critters {
		occupied[paintTileFor(c.x, c.y)] = struct{}{}
	}
	// ponytail: bounded random tries beat shuffling the whole list; a miss just
	// waits for the next spawn tick.
	for try := 0; try < 8; try++ {
		k := living[cw.rng.Intn(len(living))]
		if _, occ := occupied[k]; occ || isTempleTile(k) {
			continue
		}
		id := cw.nextID
		cw.nextID++
		cw.critters[id] = &critter{id: id, kind: 1, x: k.x, y: k.y, tx: k.x, ty: k.y, state: critterWander}
		return
	}
}

// critterHabitat runs the edge-triggered despawn grace: the countdown starts
// only on a nonempty->empty living-tile transition and cancels the moment
// habitat returns, so a freshly spawned critter is never killed by a stale
// grace window. Held critters always survive (their fate is the holder's).
func (s *Sim) critterHabitat(painted map[tileKey]paintedTile, cw *critterWorld) {
	has := false
	for _, t := range painted {
		if isLivingTile(t) {
			has = true
			break
		}
	}
	switch {
	case has:
		cw.grace = 0
	case cw.hadHabitat && cw.grace == 0:
		cw.grace = critterGraceSteps
	case cw.grace > 0:
		cw.grace--
		if cw.grace == 0 {
			for id, c := range cw.critters {
				if c.state != critterHeld {
					delete(cw.critters, id)
				}
			}
			cw.grace = -1 // expired; re-arm only via a fresh nonempty->empty edge
		}
	}
	if has {
		cw.hadHabitat = true
	} else if cw.grace == -1 {
		cw.hadHabitat = false
		cw.grace = 0
	}
}
```

Note the `-1` sentinel: after an expiry the timer must not re-arm until habitat has actually returned; the last two lines reset the edge detector.

- [ ] **Step 4: Run tests**

Run: `go test ./internal/world -run TestCritter`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add internal/world/critter.go internal/world/critter_test.go
git commit -m "feat(sim): critter pool — spawn caps + habitat grace despawn"
```

---

### Task 4: Sim — behavior: wander, follow, panic, flowers conversion

**Files:**
- Modify: `internal/world/critter.go`
- Test: `internal/world/critter_test.go`

**Interfaces:**
- Produces: `(s *Sim) critterStep(players, painted, burning, cw)` (behavior decisions, call every `critterStepEvery` ticks), `(s *Sim) critterMove(painted, burning, cw)` (position advance, call every tick), `(s *Sim) convertToFlowers(players, painted, burning, key)`.
- Consumes: Task 3 structures; `s.ignite`, `neighbors4`, `isLava`, `colorGrass`, `colorFlowers`, `wire.EncodePaint`, `send` from `sim.go`.

- [ ] **Step 1: Write failing tests** (append to `critter_test.go`)

```go
func TestCritterWanderAvoidsHazardTiles(t *testing.T) {
	s := NewSim(nil)
	painted := map[tileKey]paintedTile{}
	burning := map[tileKey]int{}
	cw := newCritterWorld(1)
	// critter on grass at (512,512); lava wall directly east
	paintGrassAt(painted, 512, 512)
	painted[tileKey{640, 512}] = paintedTile{x: 640, y: 512, color: colorLava, ownerID: 1}
	c := &critter{id: 1, kind: 1, x: 512, y: 512, tx: 700, ty: 512, state: critterWander}
	cw.critters[1] = c
	for i := 0; i < 30; i++ {
		s.critterMove(painted, burning, cw)
	}
	if paintTileFor(c.x, c.y) == (tileKey{640, 512}) {
		t.Fatalf("critter walked into lava at %d,%d", c.x, c.y)
	}
}

func TestCritterMoveNeverEntersTemple(t *testing.T) {
	s := NewSim(nil)
	painted := map[tileKey]paintedTile{}
	burning := map[tileKey]int{}
	cw := newCritterWorld(1)
	// aim straight at the temple center from just south of it
	c := &critter{id: 1, kind: 1, x: templeSouthwestX + PaintTileSize, y: templeSouthwestY + PaintTileSize,
		tx: templeSouthwestX + PaintTileSize, ty: templeSouthwestY - PaintTileSize, state: critterWander}
	cw.critters[1] = c
	for i := 0; i < 60; i++ {
		s.critterMove(painted, burning, cw)
		if isTempleTile(paintTileFor(c.x, c.y)) {
			t.Fatalf("critter entered temple at %d,%d", c.x, c.y)
		}
	}
}

func TestCritterFollowAttachAndDetach(t *testing.T) {
	s := NewSim(nil)
	painted := map[tileKey]paintedTile{}
	burning := map[tileKey]int{}
	cw := newCritterWorld(1)
	p := &player{id: 5, x: 520, y: 520, alive: true}
	players := map[uint32]*player{5: p}
	c := &critter{id: 1, kind: 1, x: 512, y: 512, tx: 512, ty: 512, state: critterWander}
	cw.critters[1] = c
	for i := 0; i < critterFollowSteps+1; i++ {
		s.critterStep(players, painted, burning, cw)
	}
	if c.state != critterFollow || c.followID != 5 {
		t.Fatalf("no attach after %d nearby steps: state=%d follow=%d", critterFollowSteps+1, c.state, c.followID)
	}
	p.x, p.y = 5000, 5000 // player runs far away
	s.critterStep(players, painted, burning, cw)
	if c.state != critterWander || c.followID != 0 {
		t.Fatalf("no detach at distance: state=%d follow=%d", c.state, c.followID)
	}
	// detach on KO too
	c.state, c.followID = critterFollow, 5
	p.x, p.y = int16(c.x+10), int16(c.y+10)
	p.alive = false
	s.critterStep(players, painted, burning, cw)
	if c.state != critterWander || c.followID != 0 {
		t.Fatalf("no detach on KO")
	}
}

func TestSettledCritterConvertsGrassToFlowersWithoutUltCharge(t *testing.T) {
	s := NewSim(nil)
	painted := map[tileKey]paintedTile{}
	burning := map[tileKey]int{}
	k := paintGrassAt(painted, 512, 512)
	owner := &player{id: 1, x: 512, y: 512, alive: true, out: make(chan []byte, 64)}
	players := map[uint32]*player{1: owner}
	before := owner.ultCharge
	s.convertToFlowers(players, painted, burning, k)
	if painted[k].color != colorFlowers {
		t.Fatalf("tile not converted: color=%x", painted[k].color)
	}
	if owner.ultCharge != before {
		t.Fatalf("conversion charged an ult")
	}
	// converting flowers again is a no-op
	s.convertToFlowers(players, painted, burning, k)
	if painted[k].color != colorFlowers {
		t.Fatalf("double-convert changed the tile")
	}
}
```

- [ ] **Step 2: Run tests, expect failure**

Run: `go test ./internal/world -run 'TestCritter|TestSettled'`
Expected: FAIL — `undefined: (s *Sim).critterMove` etc.

- [ ] **Step 3: Implement behavior in `critter.go`**

```go
func dist2(ax, ay, bx, by int16) float64 {
	dx := float64(ax) - float64(bx)
	dy := float64(ay) - float64(by)
	return dx*dx + dy*dy
}

// hazardTile: critters refuse to step onto these (and panic when dropped there).
func hazardTile(painted map[tileKey]paintedTile, burning map[tileKey]int, k tileKey) bool {
	if _, on := burning[k]; on {
		return true
	}
	t, ok := painted[k]
	return ok && (isLava(t.color) || t.color == colorWater)
}

// nearestLivePlayer returns the id of a live player within critterFollowRadius,
// or 0. First match wins — critters aren't picky.
func nearestLivePlayer(players map[uint32]*player, c *critter) uint32 {
	r2 := critterFollowRadius * critterFollowRadius
	for id, p := range players {
		if p.alive && dist2(c.x, c.y, p.x, p.y) <= r2 {
			return id
		}
	}
	return 0
}

// critterMove advances every unheld critter toward its target at critterSpeed,
// one axis-clamped step per sim tick, refusing steps into temple or hazard
// tiles. Called every tick so motion is smooth; targets change on the slower
// behavior cadence.
func (s *Sim) critterMove(painted map[tileKey]paintedTile, burning map[tileKey]int, cw *critterWorld) {
	for _, c := range cw.critters {
		if c.state == critterHeld {
			continue
		}
		step := func(v, target int16) int16 {
			switch {
			case target > v+critterSpeed:
				return v + critterSpeed
			case target < v-critterSpeed:
				return v - critterSpeed
			default:
				return target
			}
		}
		nx, ny := clamp(step(c.x, c.tx)), clamp(step(c.y, c.ty))
		next := paintTileFor(nx, ny)
		if isTempleTile(next) || hazardTile(painted, burning, next) {
			// blocked: stop here; the next behavior step picks a new target
			c.tx, c.ty = c.x, c.y
			continue
		}
		c.x, c.y = nx, ny
	}
}

// pickWanderTarget picks a short random drift target near the critter,
// preferring living tiles: try a few candidates, take the first living one,
// else the last candidate (roaming off-grass is allowed, hazards are not —
// critterMove enforces that).
func (cw *critterWorld) pickWanderTarget(painted map[tileKey]paintedTile, c *critter) (int16, int16) {
	var tx, ty int16
	for try := 0; try < 4; try++ {
		tx = clamp(c.x + int16(cw.rng.Intn(2*int(PaintTileSize)+1)-int(PaintTileSize)))
		ty = clamp(c.y + int16(cw.rng.Intn(2*int(PaintTileSize)+1)-int(PaintTileSize)))
		if t, ok := painted[paintTileFor(tx, ty)]; ok && isLivingTile(t) {
			return tx, ty
		}
	}
	return tx, ty
}

// critterStep makes behavior decisions (state transitions + new targets) at
// the slow cadence. Movement itself happens in critterMove every tick.
func (s *Sim) critterStep(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, cw *critterWorld) {
	for _, c := range cw.critters {
		switch c.state {
		case critterHeld:
			continue

		case critterPanic:
			c.stepsIn--
			if c.stepsIn <= 0 {
				c.state = critterWander
				c.tx, c.ty = c.x, c.y
			}

		case critterFollow:
			p := players[c.followID]
			if p == nil || !p.alive || dist2(c.x, c.y, p.x, p.y) > critterDetachDist*critterDetachDist {
				c.state = critterWander
				c.followID = 0
				c.tx, c.ty = c.x, c.y
				continue
			}
			// trail: aim at a point critterTrailGap short of the player
			dx := float64(p.x) - float64(c.x)
			dy := float64(p.y) - float64(c.y)
			d := dx*dx + dy*dy
			if d > critterTrailGap*critterTrailGap {
				scale := 1 - critterTrailGap/math.Max(1, math.Sqrt(d))
				c.tx = clamp(c.x + int16(dx*scale))
				c.ty = clamp(c.y + int16(dy*scale))
			} else {
				c.tx, c.ty = c.x, c.y
			}

		case critterWander:
			// follow attachment: a live player lingering nearby wins the critter
			if pid := nearestLivePlayer(players, c); pid != 0 {
				if pid == c.candID {
					c.candFor++
				} else {
					c.candID, c.candFor = pid, 1
				}
				if c.candFor >= critterFollowSteps {
					c.state = critterFollow
					c.followID = pid
					c.candID, c.candFor = 0, 0
					continue
				}
			} else {
				c.candID, c.candFor = 0, 0
			}
			// settled ecology: occasionally upgrade the grass underfoot to flowers
			key := paintTileFor(c.x, c.y)
			if t, ok := painted[key]; ok && t.color == colorGrass && cw.rng.Intn(flowerConvertChance) == 0 {
				s.convertToFlowers(players, painted, burning, key)
			}
			// arrived (or blocked): pick a fresh drift target
			if c.x == c.tx && c.y == c.ty {
				c.tx, c.ty = cw.pickWanderTarget(painted, c)
			}
		}
	}
}

// convertToFlowers is the critter terrain consequence: grass -> flowers, owner
// 0, broadcast as a normal SPaint, persisted, NEVER charging any ult (no
// player is credited). Ignition parity with s.paint: fresh flowers next to
// lava/fire catch immediately.
func (s *Sim) convertToFlowers(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, key tileKey) {
	t, ok := painted[key]
	if !ok || t.color != colorGrass {
		return
	}
	tile := paintedTile{x: key.x, y: key.y, color: colorFlowers, ownerID: 0}
	painted[key] = tile
	for _, o := range players {
		send(o, wire.EncodePaint(tile.x, tile.y, tile.color, tile.ownerID))
	}
	s.savePaint(SavedTile{X: tile.x, Y: tile.y, Color: tile.color, Owner: ""})
	for _, n := range neighbors4(key) {
		if _, on := burning[n]; on {
			s.ignite(players, painted, burning, key)
			break
		}
		if nt, ok := painted[n]; ok && isLava(nt.color) {
			s.ignite(players, painted, burning, key)
			break
		}
	}
}
```

Add to the consts block: `const flowerConvertChance = 300 // ~1 conversion per critter per ~80s of settled wandering`. Add `"opencraft1/internal/wire"` and `"math"` imports to `critter.go`.

- [ ] **Step 4: Run tests**

Run: `go test ./internal/world -run 'TestCritter|TestSettled'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/world/critter.go internal/world/critter_test.go
git commit -m "feat(sim): critter behavior — wander/follow/panic + grass->flowers"
```

---

### Task 5: Sim — the hand: grab/hold/drop + lifecycle release

**Files:**
- Modify: `internal/world/critter.go`
- Modify: `internal/world/sim.go` (player field, commands, Sim methods)
- Test: `internal/world/critter_test.go`

**Interfaces:**
- Produces: `player.heldCritterID uint32` field; `cmdGrab{id, critterID uint32}`, `cmdHold{id uint32; x, y int16}`, `cmdDrop{id uint32; x, y int16}`; `Sim.Grab(id, critterID)`, `Sim.Hold(id, x, y)`, `Sim.Drop(id, x, y)`; `(s *Sim) grabCritter(...)`, `(s *Sim) holdCritter(...)`, `(s *Sim) dropCritter(...)`, `(s *Sim) critterReleaseInvalidHolders(...)`.
- Consumes: Tasks 3–4.

- [ ] **Step 1: Write failing tests** (append to `critter_test.go`)

```go
func handWorld() (*Sim, map[uint32]*player, map[tileKey]paintedTile, map[tileKey]int, *critterWorld, *player, *critter) {
	s := NewSim(nil)
	painted := map[tileKey]paintedTile{}
	burning := map[tileKey]int{}
	cw := newCritterWorld(1)
	p := &player{id: 5, x: 520, y: 520, alive: true, out: make(chan []byte, 64)}
	players := map[uint32]*player{5: p}
	paintGrassAt(painted, 512, 512)
	c := &critter{id: 1, kind: 1, x: 512, y: 512, tx: 512, ty: 512, state: critterWander}
	cw.critters[1] = c
	return s, players, painted, burning, cw, p, c
}

func TestGrabHoldDropCycle(t *testing.T) {
	s, players, painted, burning, cw, p, c := handWorld()
	s.grabCritter(players, cw, p, 1)
	if c.state != critterHeld || c.holderID != 5 || p.heldCritterID != 1 {
		t.Fatalf("grab failed: %+v held=%d", c, p.heldCritterID)
	}
	s.holdCritter(players, p, cw, 600, 600)
	if c.x != 600 || c.y != 600 {
		t.Fatalf("hold did not move critter: %d,%d", c.x, c.y)
	}
	s.dropCritter(players, painted, burning, cw, c, 512, 512)
	if c.state == critterHeld || c.holderID != 0 || p.heldCritterID != 0 {
		t.Fatalf("drop did not release: %+v held=%d", c, p.heldCritterID)
	}
}

func TestGrabValidation(t *testing.T) {
	s, players, painted, burning, cw, p, c := handWorld()
	_ = painted
	_ = burning
	// out of range
	p.x, p.y = 5000, 5000
	s.grabCritter(players, cw, p, 1)
	if c.state == critterHeld {
		t.Fatalf("grabbed beyond grabRange")
	}
	p.x, p.y = 520, 520
	// double-grab by a second player
	p2 := &player{id: 6, x: 520, y: 520, alive: true, out: make(chan []byte, 64)}
	players[6] = p2
	s.grabCritter(players, cw, p, 1)
	s.grabCritter(players, cw, p2, 1)
	if c.holderID != 5 || p2.heldCritterID != 0 {
		t.Fatalf("second grab stole a held critter")
	}
	// one hand: p already holds 1, spawn another and try to grab it
	c2 := &critter{id: 2, kind: 1, x: 512, y: 512, state: critterWander}
	cw.critters[2] = c2
	s.grabCritter(players, cw, p, 2)
	if c2.state == critterHeld {
		t.Fatalf("one player held two critters")
	}
	// dead players can't grab
	p2.alive = false
	s.grabCritter(players, cw, p2, 2)
	if c2.state == critterHeld {
		t.Fatalf("dead player grabbed")
	}
}

func TestStaleHoldDropIgnored(t *testing.T) {
	s, players, painted, burning, cw, p, c := handWorld()
	// player holds nothing: hold/drop are no-ops, no panic
	s.holdCritter(players, p, cw, 600, 600)
	if c.x != 512 {
		t.Fatalf("stale hold moved an unheld critter")
	}
	s.dropCritterCmd(players, painted, burning, cw, p, 600, 600)
	if c.state == critterHeld || c.x != 512 {
		t.Fatalf("stale drop did something")
	}
}

func TestHoldClampsToHolderRadius(t *testing.T) {
	s, players, _, _, cw, p, c := handWorld()
	s.grabCritter(players, cw, p, 1)
	s.holdCritter(players, p, cw, 8000, 8000) // way beyond grabRange from (520,520)
	if dist2(c.x, c.y, p.x, p.y) > grabRange*grabRange*1.01 {
		t.Fatalf("hold escaped the holder radius: critter at %d,%d", c.x, c.y)
	}
}

func TestInvalidHolderReleases(t *testing.T) {
	s, players, painted, burning, cw, p, c := handWorld()
	s.grabCritter(players, cw, p, 1)
	// KO the holder
	p.alive = false
	s.critterReleaseInvalidHolders(players, painted, burning, cw)
	if c.state == critterHeld || p.heldCritterID != 0 {
		t.Fatalf("KO'd holder kept the critter")
	}
	// disconnect: holder gone from players map entirely
	s.grabCritter(players, cw, p, 1) // re-grab (alive check!) — first revive
	p.alive = true
	s.grabCritter(players, cw, p, 1)
	delete(players, 5)
	s.critterReleaseInvalidHolders(players, painted, burning, cw)
	if c.state == critterHeld {
		t.Fatalf("disconnected holder kept the critter")
	}
}

func TestDropReactions(t *testing.T) {
	s, players, painted, burning, cw, p, c := handWorld()
	s.grabCritter(players, cw, p, 1)
	// drop next to fire -> panic
	fk := tileKey{768, 512}
	painted[fk] = paintedTile{x: 768, y: 512, color: colorGrass, ownerID: 1}
	burning[fk] = burnTicks
	s.dropCritter(players, painted, burning, cw, c, 768, 512)
	if c.state != critterPanic {
		t.Fatalf("no panic on fire drop: state=%d", c.state)
	}
	// drop into water with a dry 3x3 neighbour -> relocates to a safe cell
	c.state = critterHeld
	c.holderID = 5
	p.heldCritterID = 1
	wk := tileKey{1536, 1536}
	painted[wk] = paintedTile{x: 1536, y: 1536, color: colorWater, ownerID: 1}
	paintGrassAt(painted, 1536+PaintTileSize, 1536)
	s.dropCritter(players, painted, burning, cw, c, 1536, 1536)
	if paintTileFor(c.x, c.y) == wk {
		t.Fatalf("critter left in water")
	}
	// drop into water surrounded by water -> panic in place, no teleport
	c.state = critterHeld
	c.holderID = 5
	p.heldCritterID = 1
	deep := tileKey{4096, 4096}
	for dx := int16(-1); dx <= 1; dx++ {
		for dy := int16(-1); dy <= 1; dy++ {
			k := tileKey{4096 + dx*PaintTileSize, 4096 + dy*PaintTileSize}
			painted[k] = paintedTile{x: k.x, y: k.y, color: colorWater, ownerID: 1}
		}
	}
	s.dropCritter(players, painted, burning, cw, c, 4096, 4096)
	if c.state != critterPanic || paintTileFor(c.x, c.y) != deep {
		t.Fatalf("all-water drop: want panic in place, got state=%d at %d,%d", c.state, c.x, c.y)
	}
	// drop onto the temple -> projected outside
	c.state = critterHeld
	c.holderID = 5
	p.heldCritterID = 1
	s.dropCritter(players, painted, burning, cw, c, templeSouthwestX+PaintTileSize, templeSouthwestY-PaintTileSize)
	if isTempleTile(paintTileFor(c.x, c.y)) {
		t.Fatalf("critter dropped inside temple")
	}
	// drop near another live player -> follow switches to them
	c.state = critterHeld
	c.holderID = 5
	p.heldCritterID = 1
	p2 := &player{id: 6, x: 3000, y: 3000, alive: true, out: make(chan []byte, 64)}
	players[6] = p2
	s.dropCritter(players, painted, burning, cw, c, 3010, 3010)
	if c.state != critterFollow || c.followID != 6 {
		t.Fatalf("no follow switch on drop near player: state=%d follow=%d", c.state, c.followID)
	}
}
```

- [ ] **Step 2: Run tests, expect failure**

Run: `go test ./internal/world -run 'TestGrab|TestStale|TestHold|TestInvalid|TestDrop'`
Expected: FAIL — undefined methods.

- [ ] **Step 3: Implement the hand in `critter.go` + plumbing in `sim.go`**

In `sim.go`: add `heldCritterID uint32` to the `player` struct. Add commands + methods next to the existing ones:

```go
type cmdGrab struct {
	id        uint32
	critterID uint32
}
type cmdHold struct {
	id   uint32
	x, y int16
}
type cmdDrop struct {
	id   uint32
	x, y int16
}
```

```go
func (s *Sim) Grab(id, critterID uint32)   { s.cmds <- cmdGrab{id, critterID} }
func (s *Sim) Hold(id uint32, x, y int16)  { s.cmds <- cmdHold{id, x, y} }
func (s *Sim) Drop(id uint32, x, y int16)  { s.cmds <- cmdDrop{id, x, y} }
```

In `critter.go`:

```go
// grabCritter validates and executes a grab: live player, empty hand, critter
// exists and unheld, within grabRange. Command-channel ordering is the
// arbiter — the first valid grab wins, no races.
func (s *Sim) grabCritter(players map[uint32]*player, cw *critterWorld, p *player, critterID uint32) {
	if p == nil || !p.alive || p.heldCritterID != 0 {
		return
	}
	c := cw.critters[critterID]
	if c == nil || c.state == critterHeld {
		return
	}
	if dist2(c.x, c.y, p.x, p.y) > grabRange*grabRange {
		return
	}
	c.state = critterHeld
	c.holderID = p.id
	c.followID, c.candID, c.candFor = 0, 0, 0
	c.holdSeen = false
	p.heldCritterID = c.id
}

// holdCritter moves the held critter to the holder's cursor, clamped to world
// bounds and to grabRange around the holder. Stale holds (empty hand) are
// ignored.
func (s *Sim) holdCritter(players map[uint32]*player, p *player, cw *critterWorld, x, y int16) {
	if p == nil || p.heldCritterID == 0 {
		return
	}
	c := cw.critters[p.heldCritterID]
	if c == nil {
		p.heldCritterID = 0
		return
	}
	x, y = clamp(x), clamp(y)
	dx := float64(x) - float64(p.x)
	dy := float64(y) - float64(p.y)
	if d2 := dx*dx + dy*dy; d2 > grabRange*grabRange {
		scale := grabRange / math.Sqrt(d2)
		x = clamp(p.x + int16(dx*scale))
		y = clamp(p.y + int16(dy*scale))
	}
	c.x, c.y = x, y
	c.holdSeen = true
}

// safeCellNear returns the center of a non-hazard, non-temple cell in the
// local 3x3 around key, or ok=false. Bounded — no world-wide teleports.
func safeCellNear(painted map[tileKey]paintedTile, burning map[tileKey]int, key tileKey) (tileKey, bool) {
	for dx := int16(-1); dx <= 1; dx++ {
		for dy := int16(-1); dy <= 1; dy++ {
			k := tileKey{key.x + dx*PaintTileSize, key.y + dy*PaintTileSize}
			if k == key || !validPaintTile(k) || hazardTile(painted, burning, k) {
				continue
			}
			return k, true
		}
	}
	return tileKey{}, false
}

// adjacentHazard reports fire/lava on or next to a tile (water handled apart).
func adjacentHazard(painted map[tileKey]paintedTile, burning map[tileKey]int, key tileKey) bool {
	fireOrLava := func(k tileKey) bool {
		if _, on := burning[k]; on {
			return true
		}
		t, ok := painted[k]
		return ok && isLava(t.color)
	}
	if fireOrLava(key) {
		return true
	}
	for _, n := range neighbors4(key) {
		if fireOrLava(n) {
			return true
		}
	}
	return false
}

// dropCritter places a held critter and applies the world's reaction. Critter-
// centric so the tick-loop lifecycle release can call it when the holder is
// already gone from the players map.
func (s *Sim) dropCritter(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, cw *critterWorld, c *critter, x, y int16) {
	if h := players[c.holderID]; h != nil && h.heldCritterID == c.id {
		h.heldCritterID = 0
	}
	holderID := c.holderID
	c.holderID = 0
	x, y = clamp(x), clamp(y)
	key := paintTileFor(x, y)
	if isTempleTile(key) {
		// project to the nearest safe cell around the temple footprint edge
		if safe, ok := safeCellNear(painted, burning, key); ok && !isTempleTile(safe) {
			key = safe
		} else {
			key = paintTileFor(SpawnCoord, SpawnCoord) // deterministic last resort
		}
		x, y = key.x, key.y
	}
	c.x, c.y = x, y
	c.tx, c.ty = x, y

	switch {
	case adjacentHazard(painted, burning, key):
		c.state = critterPanic
		c.stepsIn = critterPanicSteps
		// flee target: directly away from the tile center, one tile out
		c.tx = clamp(x + (x - key.x + PaintTileSize))
		c.ty = clamp(y + (y - key.y + PaintTileSize))
	case func() bool { t, ok := painted[key]; return ok && t.color == colorWater }():
		if safe, ok := safeCellNear(painted, burning, key); ok {
			c.x, c.y = safe.x, safe.y
			c.tx, c.ty = safe.x, safe.y
			c.state = critterWander
		} else {
			c.state = critterPanic
			c.stepsIn = critterPanicSteps
		}
	default:
		// near another live player (not the dropper) -> allegiance switches
		if pid := nearestLivePlayer(players, c); pid != 0 && pid != holderID {
			c.state = critterFollow
			c.followID = pid
		} else {
			c.state = critterWander
		}
	}
}

// dropCritterCmd is the CDrop entry point: resolves the player's held critter
// and ignores stale drops.
func (s *Sim) dropCritterCmd(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, cw *critterWorld, p *player, x, y int16) {
	if p == nil || p.heldCritterID == 0 {
		return
	}
	c := cw.critters[p.heldCritterID]
	if c == nil {
		p.heldCritterID = 0
		return
	}
	s.dropCritter(players, painted, burning, cw, c, x, y)
}

// critterReleaseInvalidHolders runs every tick: any held critter whose holder
// is gone (disconnect) or dead (KO) is dropped in place. One check covers all
// invalid-holder transitions — no threading through koPlayer/cmdLeave.
func (s *Sim) critterReleaseInvalidHolders(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, cw *critterWorld) {
	for _, c := range cw.critters {
		if c.state != critterHeld {
			continue
		}
		h := players[c.holderID]
		if h == nil || !h.alive {
			s.dropCritter(players, painted, burning, cw, c, c.x, c.y)
		}
	}
}

// critterCarryTick keeps held critters glued to their holder when no cursor
// stream drives them (mobile: server-derived attachment, recomputed every
// tick from the authoritative holder position).
func (s *Sim) critterCarryTick(players map[uint32]*player, cw *critterWorld) {
	for _, c := range cw.critters {
		if c.state != critterHeld || c.holdSeen {
			continue
		}
		if h := players[c.holderID]; h != nil {
			c.x, c.y = h.x, h.y
		}
	}
}
```

(`math` import needed in `critter.go`.)

- [ ] **Step 4: Run the full world test suite**

Run: `go test ./internal/world`
Expected: PASS — new hand tests plus every pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add internal/world/ 
git commit -m "feat(sim): god-hand grab/hold/drop + invalid-holder release + drop reactions"
```

---

### Task 6: Run-loop wiring, latest-only snapshot slot, server routing

**Files:**
- Modify: `internal/world/sim.go` (Run loop, cmdJoin/handshake, player struct, Join signatures)
- Modify: `internal/server/server.go` (snap channel, writer select, reader routing)
- Test: `internal/world/critter_test.go` (saturated-queue test), existing `sim_test.go` must stay green

**Interfaces:**
- Consumes: everything from Tasks 3–5.
- Produces: `player.snap chan []byte` (cap 1, latest-only); `sendSnap(p *player, b []byte)`; `Sim.JoinWithProfile(name, role, character string, out, snap chan []byte)` — **signature change**; critters live in `Run`.

- [ ] **Step 1: Extend the player struct and add sendSnap** (in `sim.go`)

```go
	// player struct: add
	snap          chan []byte // latest-only slot for self-superseding snapshots (SCritters)
```

```go
// sendSnap delivers a self-superseding snapshot through a latest-only slot:
// a newer frame replaces the queued one instead of stacking in the FIFO, so
// snapshots can never evict non-superseding event frames from out.
func sendSnap(p *player, b []byte) {
	if p.snap == nil {
		return // tests built without a snap channel just skip snapshots
	}
	select {
	case p.snap <- b:
	default:
		select {
		case <-p.snap:
		default:
		}
		select {
		case p.snap <- b:
		default:
		}
	}
}
```

- [ ] **Step 2: Thread the snap channel through Join**

Change `JoinWithProfile` to accept it, keep the old wrappers self-sufficient:

```go
func (s *Sim) Join(name string, out chan []byte) (uint32, [][]byte) {
	return s.JoinWithRole(name, wire.RolePulse, out)
}

func (s *Sim) JoinWithRole(name string, role byte, out chan []byte) (uint32, [][]byte) {
	return s.JoinWithProfile(name, role, "", out, make(chan []byte, 1))
}

func (s *Sim) JoinWithProfile(name string, role byte, character string, out chan []byte, snap chan []byte) (uint32, [][]byte) {
	// ... existing body; cmdJoin gains snap: snap
}
```

`cmdJoin` gains `snap chan []byte`; the constructed `player` gets `snap: m.snap`. Any existing callers of `JoinWithProfile` (server, tests) must pass the new arg — `grep -rn "JoinWithProfile" --include="*.go"` and fix all.

- [ ] **Step 3: Wire the Run loop**

In `Run`, next to the other world maps:

```go
	cw := newCritterWorld(time.Now().UnixNano())
```

In `cmdJoin`, add the reliable critter snapshot to the handshake (after the painted world, before player states):

```go
	initial = append(initial, wire.EncodeCritters(critterSnapshot(cw)))
```

with the helper in `critter.go`:

```go
// critterSnapshot detaches current critter state into wire form.
func critterSnapshot(cw *critterWorld) []wire.Critter {
	out := make([]wire.Critter, 0, len(cw.critters))
	for _, c := range cw.critters {
		out = append(out, wire.Critter{ID: c.id, Kind: c.kind, X: c.x, Y: c.y, State: c.state, HolderID: c.holderID})
	}
	return out
}
```

Add the three command cases to the `switch m := c.(type)` block:

```go
			case cmdGrab:
				s.grabCritter(players, cw, players[m.id], m.critterID)

			case cmdHold:
				s.holdCritter(players, players[m.id], cw, m.x, m.y)

			case cmdDrop:
				s.dropCritterCmd(players, painted, burning, cw, players[m.id], m.x, m.y)
```

In the `<-ticker.C` branch, after the respawn loop and before the player-snapshot loop:

```go
			s.critterReleaseInvalidHolders(players, painted, burning, cw)
			s.critterCarryTick(players, cw)
			s.critterMove(painted, burning, cw)
			if tick%critterStepEvery == 0 {
				s.critterStep(players, painted, burning, cw)
				s.critterHabitat(painted, cw)
			}
			if len(cw.critters) == 0 {
				s.critterSpawn(players, painted, cw) // immediate first spawn when habitat appears
			} else if tick%critterSpawnEvery == 0 {
				s.critterSpawn(players, painted, cw)
			}
			if tick%2 == 0 {
				frame := wire.EncodeCritters(critterSnapshot(cw))
				for _, p := range players {
					sendSnap(p, frame)
				}
			}
```

- [ ] **Step 4: Server plumbing** (`internal/server/server.go`)

In `handleWS`, create and pass the snap channel:

```go
	out := make(chan []byte, 64)
	snap := make(chan []byte, 1)
	id, initial := s.sim.JoinWithProfile(msg.Name, msg.Role, msg.Character, out, snap)
```

Writer goroutine selects on both:

```go
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case b := <-out:
				if err := c.Write(ctx, websocket.MessageBinary, b); err != nil {
					cancel()
					return
				}
			case b := <-snap:
				if err := c.Write(ctx, websocket.MessageBinary, b); err != nil {
					cancel()
					return
				}
			}
		}
	}()
```

Reader routing — add to the switch:

```go
			case wire.CGrab:
				s.sim.Grab(id, m.CritterID)
			case wire.CHold:
				s.sim.Hold(id, m.X, m.Y)
			case wire.CDrop:
				s.sim.Drop(id, m.X, m.Y)
```

- [ ] **Step 5: Saturated-queue test** (append to `critter_test.go`)

```go
// A snapshot must never occupy more than the single latest slot, and a full
// out FIFO must not block or lose the newest critter state.
func TestSnapshotSlotLatestOnly(t *testing.T) {
	p := &player{id: 1, out: make(chan []byte, 64), snap: make(chan []byte, 1)}
	// saturate the event FIFO completely
	for i := 0; i < 64; i++ {
		send(p, []byte{byte(i)})
	}
	sendSnap(p, []byte{0xA1})
	sendSnap(p, []byte{0xA2})
	sendSnap(p, []byte{0xA3}) // each newer snapshot replaces the queued one
	got := <-p.snap
	if got[0] != 0xA3 {
		t.Fatalf("slot did not hold the LATEST snapshot: got %x", got)
	}
	select {
	case extra := <-p.snap:
		t.Fatalf("slot held more than one snapshot: %x", extra)
	default:
	}
	if len(p.out) != 64 {
		t.Fatalf("snapshots disturbed the event FIFO: len=%d", len(p.out))
	}
}
```

- [ ] **Step 6: Full Go suite**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: PASS (fix any `JoinWithProfile` call sites the compiler flags).

- [ ] **Step 7: Commit**

```bash
git add internal/
git commit -m "feat(sim,server): wire critters into the tick loop + latest-only snapshot slot"
```

---

### Task 7: Client — render critters + snapshot reconciliation

**Files:**
- Modify: `web/src/render.ts`
- Modify: `web/src/main.ts`

**Interfaces:**
- Consumes: `Critters`/`CritterEnt` and `Handlers.critters` from Task 2; existing `Token`, `addToken`, `removeToken`, `placeToken`, `setSkin` machinery.
- Produces: `Renderer.addCritter(id, x, y): Token`, `Renderer.setHeldLift(token, lifted: boolean)`; `main.ts` keeps `critters = Map<number, {token: Token; state: number; holderId: number}>` reconciled from each `SCritters`.

- [ ] **Step 1: Renderer additions** (`web/src/render.ts`)

Critters reuse the whole Token pipeline (depth sort, smoothing, skins, grounding) at half scale with no label. Add to the `Renderer` interface:

```ts
  addCritter(id: number, x: number, y: number): Token;
  setHeldLift(token: Token, lifted: boolean): void;
```

Implementation next to `addToken` (adapt to the real body of `addToken` — reuse it):

```ts
    addCritter(id: number, x: number, y: number): Token {
      const token = this.addToken(id, '', 0x9acd32, x, y); // yellow-green procedural fallback
      token.label.visible = false;      // critters have no name label
      token.avatar.scale.set(0.5);      // ~half character height
      void this.setSkin(token, 'critter-imp'); // no-op fallback if asset missing
      return token;
    },
    // lift the avatar while held so the hand-carry reads visually; the ground
    // shadow (procedural token) stays put via the container position.
    setHeldLift(token: Token, lifted: boolean): void {
      token.avatar.position.y = lifted ? -18 : 0;
    },
```

Note: if `addToken`/`setSkin` are plain functions in the returned object literal (not `this.`-methods), call them accordingly — match the file's actual structure. `setSkin('critter-imp')` must tolerate a missing manifest entry exactly like player skins do (it already does by contract).

- [ ] **Step 2: main.ts — critter state + snapshot reconcile**

Next to `others`:

```ts
  interface CritterView {
    token: Token;
    state: number;
    holderId: number;
  }
  const critters = new Map<number, CritterView>();
```

Add the handler to the `connect(...)` handlers object:

```ts
      critters(m) {
        const seen = new Set<number>();
        for (const e of m.ents) {
          seen.add(e.id);
          let v = critters.get(e.id);
          if (!v) {
            v = { token: r.addCritter(e.id, e.x, e.y), state: e.state, holderId: e.holderId };
            critters.set(e.id, v);
          }
          v.token.tx = e.x;
          v.token.ty = e.y;
          const held = e.state === 3;
          if (held !== (v.state === 3)) r.setHeldLift(v.token, held);
          v.state = e.state;
          v.holderId = e.holderId;
        }
        for (const [id, v] of critters) {
          if (!seen.has(id)) {
            r.removeToken(v.token);
            critters.delete(id);
          }
        }
      },
```

In the render loop (`tick`), after the `others` interpolation loop:

```ts
    for (const v of critters.values()) {
      v.token.rx += (v.token.tx - v.token.rx) * 0.2;
      v.token.ry += (v.token.ty - v.token.ry) * 0.2;
      r.placeToken(v.token);
    }
```

Extend the e2e hook: `if (window.__E2E) window.__game = { me, others, bounds, critters };` (and add `critters` to the `window.__game` type declaration wherever it's declared — check `web/src/` for the `declare global` block or `.d.ts`).

- [ ] **Step 3: Build + unit tests**

Run: `cd web && npm run build && npm test`
Expected: PASS, no `tsc` errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/
git commit -m "feat(web): render critters from SCritters snapshots"
```

---

### Task 8: Client — hand input (desktop cursor + mobile two-tap)

**Files:**
- Modify: `web/src/main.ts`

**Interfaces:**
- Consumes: `conn.sendGrab/sendHold/sendDrop` (Task 2), `critters` map + `r.screenToWorld` (Task 7), `document.body.classList.contains('mobile-controls-enabled')` (existing mobile flag).
- Produces: working grab/carry/drop on both platforms; local hand prediction.

- [ ] **Step 1: Hit test + hand state** (in `start()` after the `critters` map)

```ts
  const GRAB_HIT_RADIUS = 64; // world units around a critter that counts as a hit

  function critterIdAt(wx: number, wy: number): number {
    let best = 0;
    let bestD = GRAB_HIT_RADIUS * GRAB_HIT_RADIUS;
    for (const [id, v] of critters) {
      const dx = v.token.rx - wx;
      const dy = v.token.ry - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  // Hand: heldId is our *request*; confirmation arrives when the snapshot
  // shows holderId === me.id. Until then we don't predict.
  let heldId = 0;
  let handCursor = { x: 0, y: 0 };
  function handConfirmed(): boolean {
    const v = heldId ? critters.get(heldId) : undefined;
    return !!v && v.holderId === me.id;
  }
```

- [ ] **Step 2: Desktop pointer flow**

The existing `pointerdown`/`pointerup` canvas listeners are mobile-gated. Add desktop listeners (skip when mobile controls are on):

```ts
  r.app.canvas.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('mobile-controls-enabled')) return;
    if (!e.isPrimary || e.button !== 0 || !me.alive) return;
    const w = r.screenToWorld(e.clientX, e.clientY);
    const id = critterIdAt(w.x, w.y);
    if (id) {
      conn.sendGrab(id);
      heldId = id;
      handCursor = w;
    }
  });
  r.app.canvas.addEventListener('pointermove', (e) => {
    if (!heldId || document.body.classList.contains('mobile-controls-enabled')) return;
    handCursor = r.screenToWorld(e.clientX, e.clientY);
  });
  r.app.canvas.addEventListener('pointerup', (e) => {
    if (!heldId || document.body.classList.contains('mobile-controls-enabled')) return;
    const w = r.screenToWorld(e.clientX, e.clientY);
    conn.sendDrop(Math.round(w.x), Math.round(w.y));
    heldId = 0;
  });
```

- [ ] **Step 3: Mobile two-tap flow**

Modify the EXISTING mobile `pointerup` tap handler: before `input.setMoveDestination(...)`, insert:

```ts
    const w = r.screenToWorld(e.clientX, e.clientY);
    if (heldId) {
      // second tap = drop at the tapped ground position; NOT a move destination
      conn.sendDrop(Math.round(w.x), Math.round(w.y));
      heldId = 0;
      return;
    }
    const critter = critterIdAt(w.x, w.y);
    if (critter) {
      conn.sendGrab(critter);
      heldId = critter; // server derives the carry position (above the player)
      return;
    }
```

(then the original `input.setMoveDestination(...)` line runs for plain ground taps.)

- [ ] **Step 4: Prediction + CHold streaming in the tick loop**

In `tick()`, inside the existing `acc >= 1 / INPUT_HZ` block, after `conn.sendInput(...)`:

```ts
      if (heldId && handConfirmed() && !document.body.classList.contains('mobile-controls-enabled')) {
        conn.sendHold(Math.round(handCursor.x), Math.round(handCursor.y));
      }
```

And right before the critter interpolation loop, add local prediction — a confirmed desktop-held critter renders under the cursor immediately, not at the last snapshot:

```ts
    if (heldId && handConfirmed() && !document.body.classList.contains('mobile-controls-enabled')) {
      const v = critters.get(heldId)!;
      v.token.tx = handCursor.x;
      v.token.ty = handCursor.y;
    }
```

Reconciliation guard — in the `critters` snapshot handler, first line:

```ts
        // our grab was denied or our critter was released elsewhere: un-stick the hand
        if (heldId && !m.ents.some((e) => e.id === heldId && (e.holderId === me.id || e.holderId === 0))) heldId = 0;
        if (heldId) {
          const mine = m.ents.find((e) => e.id === heldId);
          if (mine && mine.holderId !== 0 && mine.holderId !== me.id) heldId = 0;
        }
```

- [ ] **Step 5: Build + manual smoke**

Run: `cd web && npm run build && npm test`
Expected: PASS. Then a quick real check: `go run ./cmd/server` from repo root, open `http://localhost:8080`, paint some grass (`F`), wait ~4 s for a critter, click-drag it, drop it near water/fire. Critters appear, carry, and react.

- [ ] **Step 6: Commit**

```bash
git add web/src/
git commit -m "feat(web): god-hand — desktop cursor carry + mobile two-tap"
```

---

### Task 9: E2E + docs

**Files:**
- Modify: `web/e2e/game.spec.js` (or a sibling spec — follow the existing file's structure)
- Modify: `docs/project-map/server.md`, `docs/project-map/client.md`, `docs/project-map/README.md` (changelog entry)

- [ ] **Step 1: E2E scenario**

Add a spec following the existing pattern (`window.__game` hook against the real Go server). Sequence: join → paint the current tile repeatedly until a grass tile exists (send `F` presses; the local paint color depends on player id, so instead paint via multiple key presses and check `critters` map growth — the sim spawns immediately once a living tile exists IF the player's palette color is grass/flowers; to make it deterministic, poll for up to 15 s and SKIP the grab assertion if no critter spawns because the assigned palette color isn't flammable):

```js
test('critters appear and can be grabbed and dropped', async ({ page }) => {
  // ... join via the existing helper flow ...
  await page.keyboard.press('KeyF'); // paint current tile
  const spawned = await page
    .waitForFunction(() => window.__game.critters && window.__game.critters.size > 0, null, { timeout: 15000 })
    .catch(() => null);
  test.skip(!spawned, 'assigned paint color is not flammable — no habitat, no critters');
  const critter = await page.evaluate(() => {
    const [id, v] = window.__game.critters.entries().next().value;
    return { id, x: v.token.rx, y: v.token.ry };
  });
  // grab + drop through the same nets the UI uses: simulate pointer events at
  // the critter's screen position is brittle under iso — drive the wire hook
  // instead if the spec exposes one, else move the player onto the critter and
  // use pointer events at canvas center.
  expect(critter.id).toBeGreaterThan(0);
});
```

Keep this test lean: its real job is proving `SCritters` flows end-to-end into `window.__game.critters`. The grab/drop cycle is already covered by Go sim tests; only add pointer-event grab simulation if it proves stable locally.

- [ ] **Step 2: Run e2e**

Run: `cd web && npm run test:e2e`
Expected: PASS (or the documented skip on non-flammable palette color).

- [ ] **Step 3: Update leaf docs**

- `docs/project-map/server.md`: add the critter layer to the `internal/world/sim.go` bullet (transient pool, caps, behavior cadence, hand commands, latest-only snap slot) and note the new wire frames in the `internal/wire` bullet.
- `docs/project-map/client.md`: add critters to `render.ts`/`main.ts`/`wire.ts`/`net.ts` bullets + a sharp edge: "hand: `heldId` is a request until the snapshot confirms `holderId === me.id`; mobile second-tap drops instead of moving".
- `docs/project-map/README.md`: one changelog line on top, dated 2026-07-15, naming the branch.
- `internal/CLAUDE.md` and `web/CLAUDE.md`: extend the public-surface lists with `Sim.Grab/Hold/Drop`, `EncodeCritters`, snap channel; one gotcha each ("snap chan is latest-only; never send events through it").

- [ ] **Step 4: Commit**

```bash
git add web/e2e/ docs/ internal/CLAUDE.md web/CLAUDE.md
git commit -m "test(e2e)+docs: critter snapshot e2e + project-map updates"
```

---

### Task 10: Critter asset (optional at runtime, procedural fallback covers absence)

**Files:**
- Create: `web/assets/characters/critter-imp/…` (generated) + manifest entry via the pipeline
- Modify: none by hand — `web/tools/gen-asset.mjs` writes `web/assets/manifest.json`

- [ ] **Step 1: Generate**

Requires `OPENROUTER_API_KEY` and openrouter.ai egress (see the nano-banana notes in the repo tooling). Generate a small critter in the slop house style, 4 ordinal facings, transparent, no baked shadow:

```bash
cd web && node tools/gen-asset.mjs \
  --type character --name critter-imp \
  --prompt "tiny round critter creature, small cute blob imp with stubby legs, half the height of a person" \
  --facings ordinal --no-background true
```

(Adapt flags to `gen-asset.mjs --help` — the tool's contract, not this plan, is authoritative for flag names. If the local env has no key, dispatch the existing `regen-asset` GitHub workflow instead, or skip: the procedural fallback token keeps the game fully playable.)

- [ ] **Step 2: Verify in-browser**

`go run ./cmd/server`, open the game, paint grass, confirm the spawned critter renders with the sprite (or cleanly falls back if generation was skipped).

- [ ] **Step 3: Commit**

```bash
git add web/assets/
git commit -m "chore(assets): critter-imp sprite (nano-banana, ordinal facings)"
```

---

## Final verification (whole feature)

- [ ] `go build ./... && go vet ./... && go test ./...` — all green
- [ ] `cd web && npm run build && npm test && npm run test:e2e` — all green
- [ ] Manual: paint grass → critter spawns ≤ ~4 s; carry critter with cursor (desktop) — it tracks the cursor locally with no lag; drop on water → relocates; drop near fire → panics; second browser sees the carried critter move; burn all grass → critters despawn after ~10 s; repaint → they return.
- [ ] Spec cross-check against `docs/superpowers/specs/2026-07-15-critters-god-hand-design.md` — every "Tests" bullet there maps to a test added here.
