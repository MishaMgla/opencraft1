# opencraft MVP Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the opencraft MVP — a single shared isometric world where many players join, move, and see each other move in real time.

**Architecture:** A single Go binary runs a fixed-15 Hz simulation goroutine that owns all world state, partitions players with a uniform spatial grid (area-of-interest), and pushes per-client binary snapshots over WebSocket. The browser client (PixiJS v8) renders an isometric view, computes its own movement (client-authoritative relay), and interpolates remote players. No JSON on the hot path — a custom little-endian binary protocol with int16 positions.

**Tech Stack:** Go 1.23 · `github.com/coder/websocket` · PixiJS v8 (ESM via CDN) · vanilla JS, no bundler.

**Source docs:** [`../../prd/mvp.md`](../../prd/mvp.md) · [`../specs/2026-06-11-opencraft-mvp-engine-design.md`](../specs/2026-06-11-opencraft-mvp-engine-design.md)

> **Testing note:** `AGENT_RULES.md` forbids unsolicited automated tests. This plan therefore verifies with **build + vet + run + observe**, not test-first. The unit/load-test surface from the design (wire round-trips, grid math, load harness) is deferred until explicitly greenlit — see the final task.

---

## File Structure

Each task owns a distinct file set with a fixed public interface, so tasks can be implemented in isolation. Dependencies only point "downward" (later tasks import earlier ones); no task needs to read another task's *internals*, only its interface (restated in each task).

```
go.mod                          # module "opencraft", go 1.23
cmd/server/main.go              # wiring: start sim goroutine + http server  (Task 1 stub → Task 5 full)
internal/wire/wire.go           # binary protocol: encoders + client decoder  (Task 2, pure)
internal/world/grid.go          # uniform spatial grid / area-of-interest      (Task 3, pure)
internal/world/sim.go           # authoritative tick loop, owns world state    (Task 4)
internal/server/server.go       # http mux: static files + /ws connection      (Task 5)
web/index.html                  # name-entry overlay + HUD + module entry       (Task 1 stub → Task 10 full)
web/src/iso.js                  # isometric projection (pure)                   (Task 6)
web/src/wire.js                 # binary protocol mirror (DataView)             (Task 7)
web/src/net.js                  # WebSocket connect/send/dispatch               (Task 8)
web/src/input.js                # keyboard → local movement integration         (Task 9)
web/src/render.js               # PixiJS app, tiles, tokens, camera             (Task 10)
web/src/main.js                 # orchestration: ticker, glue                   (Task 10)
docs/project-map/server.md      # leaf doc for the Go engine                    (Task 11)
docs/project-map/client.md      # leaf doc for the web client                   (Task 11)
```

### Shared constants (identical on both sides — copied verbatim where used)

- World is `4096 × 4096` integer units; positions are `int16` in `[0, 4095]`.
- Spatial grid: cell size `256` → `16 × 16` cells. AoI = a player's cell + 8 neighbors (3×3 block).
- Tick rate: `15` Hz.
- All multi-byte integers are **little-endian**.

### Wire protocol (single source of truth — Task 2 = Go, Task 7 = JS mirror)

Byte 0 = message type. `i16`/`u16`/`u32` little-endian.

**Client → Server**
| type | byte | layout after type byte |
|---|---|---|
| Hello | `0x01` | `nameLen:u8`, `name:utf8[nameLen]` |
| Input | `0x02` | `x:i16`, `y:i16` (absolute world position) |
| Ping  | `0x03` | `t:u32` |

**Server → Client**
| type | byte | layout after type byte |
|---|---|---|
| Welcome  | `0x81` | `id:u32`, `minX:i16`, `minY:i16`, `maxX:i16`, `maxY:i16` |
| Snapshot | `0x82` | `tick:u32`, `count:u16`, then `count ×` (`id:u32`, `x:i16`, `y:i16`) |
| Enter    | `0x83` | `id:u32`, `x:i16`, `y:i16`, `color:u32`, `nameLen:u8`, `name:utf8` |
| Leave    | `0x84` | `id:u32` |
| Pong     | `0x85` | `t:u32` |

> `Input` carries an absolute client-computed position. (The design mentioned a `seq` field for future reconciliation — deferred here per YAGNI; reconciliation is a post-MVP layer.)

---

## Task 1: Project scaffold + static file server

**Files:**
- Create: `go.mod`
- Create: `cmd/server/main.go`
- Create: `web/index.html`
- Modify: `AGENT_RULES.md` (fill `development commands` + `coding style` now that the stack landed)

- [ ] **Step 1: Create the Go module**

`go.mod`:
```
module opencraft

go 1.23
```

- [ ] **Step 2: Create a minimal server that serves `web/`**

`cmd/server/main.go`:
```go
package main

import (
	"log"
	"net/http"
)

func main() {
	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.Dir("web")))
	log.Println("listening on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 3: Create a placeholder client page**

`web/index.html`:
```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>opencraft</title></head>
<body><p>opencraft scaffold ok</p></body>
</html>
```

- [ ] **Step 4: Build and run, verify the page is served**

Run:
```bash
go build ./... && go run ./cmd/server &
sleep 1 && curl -s localhost:8080 && kill %1
```
Expected: prints the `opencraft scaffold ok` HTML, no build errors.

- [ ] **Step 5: Record the toolchain in `AGENT_RULES.md`**

Replace the `## coding style & naming` body (`_(pending stack)_ …`) with:
```markdown
- **backend:** Go 1.23. format with `gofmt`; vet with `go vet ./...`. package layout: `cmd/<binary>` for entrypoints, `internal/<pkg>` for engine packages. lower_snake file names, idiomatic Go exported/unexported naming.
- **client:** vanilla ES modules under `web/src/`, no bundler. PixiJS v8 imported from CDN. `camelCase` functions, one responsibility per module file.
```
Replace the `## development commands` `_(pending stack)_` line with:
```markdown
- `go build ./...` — compile everything.
- `go vet ./...` — static checks.
- `go run ./cmd/server` — run the game server on `:8080` (serves `web/` + the `/ws` endpoint).
- `node --check web/src/<file>.js` — syntax-check a client module (no bundler/test runner in MVP).
```

- [ ] **Step 6: Commit**
```bash
git add go.mod cmd/server/main.go web/index.html AGENT_RULES.md
git commit -m "feat: scaffold Go server serving static web client"
```

---

## Task 2: Binary wire protocol (Go)

**Files:**
- Create: `internal/wire/wire.go`

**Interface produced:** message-type consts; `type Ent{ID uint32; X,Y int16}`; encoders `EncodeWelcome/EncodeSnapshot/EncodeEnter/EncodeLeave/EncodePong`; decoder `ParseClient(b []byte)(ClientMsg, bool)` with `type ClientMsg{Type byte; Name string; X,Y int16; T uint32}`.

- [ ] **Step 1: Write the full wire package**

`internal/wire/wire.go`:
```go
// Package wire is the binary protocol shared by server and client.
// All multi-byte integers are little-endian. Positions are int16 world units.
package wire

import "encoding/binary"

// Message type tags (byte 0 of every frame).
const (
	CHello = 0x01 // client -> server
	CInput = 0x02
	CPing  = 0x03

	SWelcome  = 0x81 // server -> client
	SSnapshot = 0x82
	SEnter    = 0x83
	SLeave    = 0x84
	SPong     = 0x85
)

// Ent is a minimal entity record carried in snapshots.
type Ent struct {
	ID   uint32
	X, Y int16
}

func EncodeWelcome(id uint32, minX, minY, maxX, maxY int16) []byte {
	b := make([]byte, 1+4+8)
	b[0] = SWelcome
	binary.LittleEndian.PutUint32(b[1:], id)
	binary.LittleEndian.PutUint16(b[5:], uint16(minX))
	binary.LittleEndian.PutUint16(b[7:], uint16(minY))
	binary.LittleEndian.PutUint16(b[9:], uint16(maxX))
	binary.LittleEndian.PutUint16(b[11:], uint16(maxY))
	return b
}

func EncodeSnapshot(tick uint32, ents []Ent) []byte {
	b := make([]byte, 1+4+2+len(ents)*8)
	b[0] = SSnapshot
	binary.LittleEndian.PutUint32(b[1:], tick)
	binary.LittleEndian.PutUint16(b[5:], uint16(len(ents)))
	off := 7
	for _, e := range ents {
		binary.LittleEndian.PutUint32(b[off:], e.ID)
		binary.LittleEndian.PutUint16(b[off+4:], uint16(e.X))
		binary.LittleEndian.PutUint16(b[off+6:], uint16(e.Y))
		off += 8
	}
	return b
}

func EncodeEnter(id uint32, x, y int16, color uint32, name string) []byte {
	n := []byte(name)
	if len(n) > 255 {
		n = n[:255]
	}
	b := make([]byte, 1+4+2+2+4+1+len(n))
	b[0] = SEnter
	binary.LittleEndian.PutUint32(b[1:], id)
	binary.LittleEndian.PutUint16(b[5:], uint16(x))
	binary.LittleEndian.PutUint16(b[7:], uint16(y))
	binary.LittleEndian.PutUint32(b[9:], color)
	b[13] = byte(len(n))
	copy(b[14:], n)
	return b
}

func EncodeLeave(id uint32) []byte {
	b := make([]byte, 1+4)
	b[0] = SLeave
	binary.LittleEndian.PutUint32(b[1:], id)
	return b
}

func EncodePong(t uint32) []byte {
	b := make([]byte, 1+4)
	b[0] = SPong
	binary.LittleEndian.PutUint32(b[1:], t)
	return b
}

// ClientMsg is a decoded client->server frame. Only fields relevant to Type are set.
type ClientMsg struct {
	Type byte
	Name string // CHello
	X, Y int16  // CInput
	T    uint32 // CPing
}

// ParseClient decodes one client frame. Returns ok=false on malformed input.
func ParseClient(b []byte) (ClientMsg, bool) {
	if len(b) < 1 {
		return ClientMsg{}, false
	}
	switch b[0] {
	case CHello:
		if len(b) < 2 {
			return ClientMsg{}, false
		}
		nlen := int(b[1])
		if len(b) < 2+nlen {
			return ClientMsg{}, false
		}
		return ClientMsg{Type: CHello, Name: string(b[2 : 2+nlen])}, true
	case CInput:
		if len(b) < 5 {
			return ClientMsg{}, false
		}
		x := int16(binary.LittleEndian.Uint16(b[1:]))
		y := int16(binary.LittleEndian.Uint16(b[3:]))
		return ClientMsg{Type: CInput, X: x, Y: y}, true
	case CPing:
		if len(b) < 5 {
			return ClientMsg{}, false
		}
		return ClientMsg{Type: CPing, T: binary.LittleEndian.Uint32(b[1:])}, true
	}
	return ClientMsg{}, false
}
```

- [ ] **Step 2: Build and vet**

Run: `go build ./internal/wire && go vet ./internal/wire`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**
```bash
git add internal/wire/wire.go
git commit -m "feat: add binary wire protocol (encoders + client decoder)"
```

---

## Task 3: Spatial grid / area-of-interest (Go)

**Files:**
- Create: `internal/world/grid.go`

**Interface produced:** consts `WorldSize=4096`, `CellSize=256`, `GridDim=16`; `type Grid`; `NewGrid()`, `(*Grid).Insert/Remove/Move`, `(*Grid).Neighbors(x,y int16) []uint32`.

- [ ] **Step 1: Write the grid**

`internal/world/grid.go`:
```go
package world

// World and grid geometry. Positions are int16 world units in [0, WorldSize-1].
const (
	WorldSize = 4096
	CellSize  = 256
	GridDim   = WorldSize / CellSize // 16
)

// Grid maps each cell to the set of entity ids currently inside it.
type Grid struct {
	cells [GridDim][GridDim]map[uint32]struct{}
}

func NewGrid() *Grid {
	g := &Grid{}
	for i := 0; i < GridDim; i++ {
		for j := 0; j < GridDim; j++ {
			g.cells[i][j] = map[uint32]struct{}{}
		}
	}
	return g
}

func cellOf(x, y int16) (int, int) {
	cx, cy := int(x)/CellSize, int(y)/CellSize
	if cx < 0 {
		cx = 0
	} else if cx >= GridDim {
		cx = GridDim - 1
	}
	if cy < 0 {
		cy = 0
	} else if cy >= GridDim {
		cy = GridDim - 1
	}
	return cx, cy
}

func (g *Grid) Insert(id uint32, x, y int16) {
	cx, cy := cellOf(x, y)
	g.cells[cx][cy][id] = struct{}{}
}

func (g *Grid) Remove(id uint32, x, y int16) {
	cx, cy := cellOf(x, y)
	delete(g.cells[cx][cy], id)
}

// Move relocates id from its old cell to its new cell (no-op if same cell).
func (g *Grid) Move(id uint32, ox, oy, nx, ny int16) {
	ocx, ocy := cellOf(ox, oy)
	ncx, ncy := cellOf(nx, ny)
	if ocx == ncx && ocy == ncy {
		return
	}
	delete(g.cells[ocx][ocy], id)
	g.cells[ncx][ncy][id] = struct{}{}
}

// Neighbors returns all entity ids in the 3x3 block of cells around (x, y),
// including the entity asking (callers skip self). This is the area of interest.
func (g *Grid) Neighbors(x, y int16) []uint32 {
	cx, cy := cellOf(x, y)
	var out []uint32
	for dx := -1; dx <= 1; dx++ {
		for dy := -1; dy <= 1; dy++ {
			nx, ny := cx+dx, cy+dy
			if nx < 0 || nx >= GridDim || ny < 0 || ny >= GridDim {
				continue
			}
			for id := range g.cells[nx][ny] {
				out = append(out, id)
			}
		}
	}
	return out
}
```

- [ ] **Step 2: Build and vet**

Run: `go build ./internal/world && go vet ./internal/world`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**
```bash
git add internal/world/grid.go
git commit -m "feat: add uniform spatial grid for area-of-interest"
```

---

## Task 4: Simulation core (Go)

**Files:**
- Create: `internal/world/sim.go`

**Depends on (interfaces, already built):**
- `wire`: `Ent{ID uint32;X,Y int16}`, `EncodeWelcome(id uint32,minX,minY,maxX,maxY int16)[]byte`, `EncodeSnapshot(tick uint32,ents []Ent)[]byte`, `EncodeEnter(id uint32,x,y int16,color uint32,name string)[]byte`, `EncodeLeave(id uint32)[]byte`, `EncodePong(t uint32)[]byte`.
- `grid.go` (same package): `NewGrid()`, `Insert/Remove/Move`, `Neighbors`, const `WorldSize`.

**Interface produced:** `type Sim`; `NewSim()`, `(*Sim).Run(ctx)`, `(*Sim).Join(name string, out chan []byte) uint32`, `(*Sim).Input(id uint32, x,y int16)`, `(*Sim).Leave(id uint32)`.

- [ ] **Step 1: Write the simulation**

`internal/world/sim.go`:
```go
package world

import (
	"context"
	"time"

	"opencraft/internal/wire"
)

const TickHz = 15

var palette = []uint32{
	0xE6194B, 0x3CB44B, 0xFFE119, 0x4363D8,
	0xF58231, 0x911EB4, 0x46F0F0, 0xF032E6,
}

func colorFor(id uint32) uint32 { return palette[int(id)%len(palette)] }

func clamp(v int16) int16 {
	if v < 0 {
		return 0
	}
	if v > WorldSize-1 {
		return WorldSize - 1
	}
	return v
}

type player struct {
	id    uint32
	x, y  int16
	name  string
	color uint32
	out   chan []byte
}

// Sim owns all world state. It is the only goroutine that touches that state;
// all interaction happens through the cmds channel (no locks).
type Sim struct {
	cmds chan any
}

type cmdJoin struct {
	name  string
	out   chan []byte
	reply chan uint32
}
type cmdInput struct {
	id   uint32
	x, y int16
}
type cmdLeave struct{ id uint32 }
type cmdPing struct {
	id uint32
	t  uint32
}

func NewSim() *Sim { return &Sim{cmds: make(chan any, 1024)} }

// Join registers a new player and returns its assigned id. Blocks until the
// sim goroutine processes the join (fast). out receives encoded frames.
func (s *Sim) Join(name string, out chan []byte) uint32 {
	reply := make(chan uint32, 1)
	s.cmds <- cmdJoin{name: name, out: out, reply: reply}
	return <-reply
}

func (s *Sim) Input(id uint32, x, y int16) { s.cmds <- cmdInput{id, x, y} }
func (s *Sim) Leave(id uint32)             { s.cmds <- cmdLeave{id} }
func (s *Sim) Ping(id uint32, t uint32)    { s.cmds <- cmdPing{id, t} }

// send never blocks the sim: on a full buffer it drops the oldest frame.
func send(p *player, b []byte) {
	select {
	case p.out <- b:
	default:
		select {
		case <-p.out:
		default:
		}
		select {
		case p.out <- b:
		default:
		}
	}
}

func diff(a, b []uint32) []uint32 { // returns a \ b
	set := make(map[uint32]struct{}, len(b))
	for _, x := range b {
		set[x] = struct{}{}
	}
	var out []uint32
	for _, x := range a {
		if _, ok := set[x]; !ok {
			out = append(out, x)
		}
	}
	return out
}

// Run is the simulation loop. Call in its own goroutine.
func (s *Sim) Run(ctx context.Context) {
	players := map[uint32]*player{}
	grid := NewGrid()
	var nextID uint32 = 1
	var tick uint32

	ticker := time.NewTicker(time.Second / TickHz)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case c := <-s.cmds:
			switch m := c.(type) {
			case cmdJoin:
				id := nextID
				nextID++
				p := &player{id: id, x: WorldSize / 2, y: WorldSize / 2, name: m.name, color: colorFor(id), out: m.out}
				players[id] = p
				grid.Insert(id, p.x, p.y)
				send(p, wire.EncodeWelcome(id, 0, 0, WorldSize-1, WorldSize-1))
				for _, oid := range grid.Neighbors(p.x, p.y) {
					if oid == id {
						continue
					}
					o := players[oid]
					send(p, wire.EncodeEnter(o.id, o.x, o.y, o.color, o.name))
					send(o, wire.EncodeEnter(p.id, p.x, p.y, p.color, p.name))
				}
				m.reply <- id

			case cmdInput:
				p := players[m.id]
				if p == nil {
					continue
				}
				nx, ny := clamp(m.x), clamp(m.y)
				oldN := grid.Neighbors(p.x, p.y)
				grid.Move(p.id, p.x, p.y, nx, ny)
				p.x, p.y = nx, ny
				newN := grid.Neighbors(nx, ny)
				for _, oid := range diff(newN, oldN) {
					if oid == p.id {
						continue
					}
					o := players[oid]
					if o == nil {
						continue
					}
					send(p, wire.EncodeEnter(o.id, o.x, o.y, o.color, o.name))
					send(o, wire.EncodeEnter(p.id, p.x, p.y, p.color, p.name))
				}
				for _, oid := range diff(oldN, newN) {
					if oid == p.id {
						continue
					}
					o := players[oid]
					if o == nil {
						continue
					}
					send(p, wire.EncodeLeave(o.id))
					send(o, wire.EncodeLeave(p.id))
				}

			case cmdPing:
				if p := players[m.id]; p != nil {
					send(p, wire.EncodePong(m.t))
				}

			case cmdLeave:
				p := players[m.id]
				if p == nil {
					continue
				}
				for _, oid := range grid.Neighbors(p.x, p.y) {
					if oid == m.id {
						continue
					}
					if o := players[oid]; o != nil {
						send(o, wire.EncodeLeave(m.id))
					}
				}
				grid.Remove(m.id, p.x, p.y)
				delete(players, m.id)
			}

		case <-ticker.C:
			tick++
			for _, p := range players {
				ids := grid.Neighbors(p.x, p.y)
				ents := make([]wire.Ent, 0, len(ids))
				for _, oid := range ids {
					o := players[oid]
					ents = append(ents, wire.Ent{ID: o.id, X: o.x, Y: o.y})
				}
				send(p, wire.EncodeSnapshot(tick, ents))
			}
		}
	}
}
```

- [ ] **Step 2: Build and vet**

Run: `go build ./internal/world && go vet ./internal/world`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**
```bash
git add internal/world/sim.go
git commit -m "feat: add authoritative 15Hz simulation core with AoI snapshots"
```

---

## Task 5: WebSocket connection handler + server wiring (Go)

**Files:**
- Create: `internal/server/server.go`
- Modify: `cmd/server/main.go` (replace the Task 1 stub)

**Depends on:** `wire.ParseClient`, `wire.CHello/CInput/CPing`, `wire.EncodePong`; `world.Sim` with `Join/Input/Leave/Ping/Run`.

**Interface produced:** `server.New(sim *world.Sim) *Server`; `(*Server).Handler() http.Handler`.

- [ ] **Step 1: Add the WebSocket dependency**

Run: `go get github.com/coder/websocket@latest`
Expected: `go.mod`/`go.sum` updated with the dependency.

- [ ] **Step 2: Write the connection handler + mux**

`internal/server/server.go`:
```go
package server

import (
	"context"
	"log"
	"net/http"

	"github.com/coder/websocket"

	"opencraft/internal/wire"
	"opencraft/internal/world"
)

type Server struct {
	sim *world.Sim
}

func New(sim *world.Sim) *Server { return &Server{sim: sim} }

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWS)
	mux.Handle("/", http.FileServer(http.Dir("web")))
	return mux
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// MVP/local dev: allow any origin. Tighten with OriginPatterns for prod.
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("ws accept: %v", err)
		return
	}
	defer c.CloseNow()
	c.SetReadLimit(4096)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// First frame must be Hello.
	_, data, err := c.Read(ctx)
	if err != nil {
		return
	}
	msg, ok := wire.ParseClient(data)
	if !ok || msg.Type != wire.CHello {
		return
	}

	out := make(chan []byte, 64)
	id := s.sim.Join(msg.Name, out)
	defer s.sim.Leave(id)

	// Writer goroutine: drain out -> socket until the connection ends.
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
			}
		}
	}()

	// Reader loop.
	for {
		_, data, err := c.Read(ctx)
		if err != nil {
			return
		}
		m, ok := wire.ParseClient(data)
		if !ok {
			continue
		}
		switch m.Type {
		case wire.CInput:
			s.sim.Input(id, m.X, m.Y)
		case wire.CPing:
			s.sim.Ping(id, m.T)
		}
	}
}
```

- [ ] **Step 3: Rewrite `main.go` to wire sim + server with graceful shutdown**

`cmd/server/main.go` (replace entire file):
```go
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"

	"opencraft/internal/server"
	"opencraft/internal/world"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	sim := world.NewSim()
	go sim.Run(ctx)

	httpSrv := &http.Server{Addr: ":8080", Handler: server.New(sim).Handler()}
	go func() {
		log.Println("listening on :8080")
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")
	httpSrv.Close()
}
```

- [ ] **Step 4: Build, vet, and smoke-run**

Run:
```bash
go build ./... && go vet ./...
go run ./cmd/server &
sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" localhost:8080 && kill %1
```
Expected: build/vet clean; curl prints `200`. (The `/ws` endpoint is exercised end-to-end by the client in Task 11.)

- [ ] **Step 5: Commit**
```bash
git add go.mod go.sum internal/server/server.go cmd/server/main.go
git commit -m "feat: add websocket connection handler and wire up the server"
```

---

## Task 6: Isometric projection (client, pure)

**Files:**
- Create: `web/src/iso.js`

**Interface produced:** `KX`, `KY` constants; `worldToScreen(wx, wy) -> {x, y}`; `depth(wx, wy) -> number`.

- [ ] **Step 1: Write the projection module**

`web/src/iso.js`:
```js
// Isometric projection. The server is projection-agnostic (flat world units);
// this is the only place that knows the camera is isometric.

// Pixels per world unit along each screen axis. Classic 2:1 iso => KX = 2*KY.
export const KX = 0.5;
export const KY = 0.25;

// world (wx, wy) -> screen pixels, before camera offset.
export function worldToScreen(wx, wy) {
  return { x: (wx - wy) * KX, y: (wx + wy) * KY };
}

// Painter's-order depth: things further "south-east" in the world draw on top.
export function depth(wx, wy) {
  return wx + wy;
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check web/src/iso.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**
```bash
git add web/src/iso.js
git commit -m "feat: add isometric projection helpers (client)"
```

---

## Task 7: Binary wire protocol mirror (client, pure)

**Files:**
- Create: `web/src/wire.js`

**Interface produced:** `encodeHello(name) -> ArrayBuffer`; `encodeInput(x, y) -> ArrayBuffer`; `decodeServer(view: DataView) -> {type, ...}` where `type` is one of `'welcome'|'snapshot'|'enter'|'leave'|'pong'|'unknown'`. Must match Task 2 byte-for-byte.

- [ ] **Step 1: Write the client codec**

`web/src/wire.js`:
```js
// Binary protocol mirror of internal/wire/wire.go. Little-endian, int16 positions.

const C_HELLO = 0x01;
const C_INPUT = 0x02;

const S_WELCOME = 0x81;
const S_SNAPSHOT = 0x82;
const S_ENTER = 0x83;
const S_LEAVE = 0x84;
const S_PONG = 0x85;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeHello(name) {
  const n = enc.encode(name.slice(0, 255));
  const b = new Uint8Array(2 + n.length);
  b[0] = C_HELLO;
  b[1] = n.length;
  b.set(n, 2);
  return b.buffer;
}

export function encodeInput(x, y) {
  const b = new ArrayBuffer(5);
  const v = new DataView(b);
  v.setUint8(0, C_INPUT);
  v.setInt16(1, x, true);
  v.setInt16(3, y, true);
  return b;
}

// view is a DataView over the received ArrayBuffer.
export function decodeServer(view) {
  const t = view.getUint8(0);
  switch (t) {
    case S_WELCOME:
      return {
        type: 'welcome',
        id: view.getUint32(1, true),
        minX: view.getInt16(5, true),
        minY: view.getInt16(7, true),
        maxX: view.getInt16(9, true),
        maxY: view.getInt16(11, true),
      };
    case S_SNAPSHOT: {
      const tick = view.getUint32(1, true);
      const count = view.getUint16(5, true);
      const ents = [];
      let off = 7;
      for (let i = 0; i < count; i++) {
        ents.push({
          id: view.getUint32(off, true),
          x: view.getInt16(off + 4, true),
          y: view.getInt16(off + 6, true),
        });
        off += 8;
      }
      return { type: 'snapshot', tick, ents };
    }
    case S_ENTER: {
      const id = view.getUint32(1, true);
      const x = view.getInt16(5, true);
      const y = view.getInt16(7, true);
      const color = view.getUint32(9, true);
      const nlen = view.getUint8(13);
      const bytes = new Uint8Array(view.buffer, view.byteOffset + 14, nlen);
      return { type: 'enter', id, x, y, color, name: dec.decode(bytes) };
    }
    case S_LEAVE:
      return { type: 'leave', id: view.getUint32(1, true) };
    case S_PONG:
      return { type: 'pong', t: view.getUint32(1, true) };
  }
  return { type: 'unknown' };
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check web/src/wire.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**
```bash
git add web/src/wire.js
git commit -m "feat: add client-side binary wire codec mirroring the Go protocol"
```

---

## Task 8: Network layer (client)

**Files:**
- Create: `web/src/net.js`

**Depends on:** `wire.js` (`encodeHello`, `encodeInput`, `decodeServer`).

**Interface produced:** `connect(url, name, handlers) -> { sendInput(x, y), close() }`, where `handlers` is `{ welcome, snapshot, enter, leave, pong }` (each optional, keyed by `decodeServer` `type`).

- [ ] **Step 1: Write the net layer**

`web/src/net.js`:
```js
import { encodeHello, encodeInput, decodeServer } from './wire.js';

// Opens a WebSocket, sends Hello on open, and dispatches decoded server
// frames to handlers[msg.type]. Returns a small control object.
export function connect(url, name, handlers) {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => ws.send(encodeHello(name));
  ws.onmessage = (ev) => {
    const msg = decodeServer(new DataView(ev.data));
    const h = handlers[msg.type];
    if (h) h(msg);
  };
  ws.onclose = () => handlers.close && handlers.close();

  return {
    sendInput(x, y) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeInput(x, y));
    },
    close() {
      ws.close();
    },
  };
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check web/src/net.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**
```bash
git add web/src/net.js
git commit -m "feat: add client websocket net layer"
```

---

## Task 9: Input → local movement (client)

**Files:**
- Create: `web/src/input.js`

**Interface produced:** `createInput() -> { step(pos, speed, dt, bounds) -> boolean }`. `step` mutates `pos.{x,y}` in world units, clamps to `bounds.{minX,minY,maxX,maxY}`, and returns whether the player moved.

- [ ] **Step 1: Write the input module**

`web/src/input.js`:
```js
// Tracks held keys and integrates the local player's movement each frame.
// Movement is along world axes (appears diagonal under iso) — fine for MVP.

export function createInput() {
  const keys = Object.create(null);
  window.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
  window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  return {
    // pos: {x,y} world units (mutated). speed: units/sec. dt: seconds.
    step(pos, speed, dt, bounds) {
      let dx = 0;
      let dy = 0;
      if (keys['w'] || keys['arrowup']) dy -= 1;
      if (keys['s'] || keys['arrowdown']) dy += 1;
      if (keys['a'] || keys['arrowleft']) dx -= 1;
      if (keys['d'] || keys['arrowright']) dx += 1;
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        pos.x = clamp(pos.x + dx * speed * dt, bounds.minX, bounds.maxX);
        pos.y = clamp(pos.y + dy * speed * dt, bounds.minY, bounds.maxY);
        return true;
      }
      return false;
    },
  };
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check web/src/input.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**
```bash
git add web/src/input.js
git commit -m "feat: add client keyboard input + local movement integration"
```

---

## Task 10: PixiJS renderer + orchestration (client)

**Files:**
- Create: `web/src/render.js`
- Create: `web/src/main.js`
- Modify: `web/index.html` (replace the Task 1 stub)

**Depends on:** PixiJS v8 (CDN), `iso.js` (`worldToScreen`, `depth`, `KX`, `KY`), `net.js` (`connect`), `input.js` (`createInput`).

**Interface produced by `render.js`:** `createRenderer() -> { app, addToken(id,name,color,x,y) -> token, removeToken(token), placeToken(token), setLocal(x,y), centerCamera(x,y) }`, where a `token` is `{ container, rx, ry, tx, ty }`.

- [ ] **Step 1: Write the renderer**

`web/src/render.js`:
```js
import { Application, Container, Graphics, Text } from 'https://esm.sh/pixi.js@8';
import { worldToScreen, depth, KX, KY } from './iso.js';

const GROUND_STEP = 128; // world units between iso floor tiles

function makeToken(name, color) {
  const container = new Container();

  const shadow = new Graphics()
    .ellipse(0, 6, 12, 6)
    .fill({ color: 0x000000, alpha: 0.25 });
  const body = new Graphics().circle(0, 0, 10).fill({ color });
  const label = new Text({
    text: name,
    style: { fill: 0xffffff, fontSize: 12, fontFamily: 'system-ui' },
  });
  label.anchor.set(0.5, 1);
  label.y = -16;

  container.addChild(shadow, body, label);
  return container;
}

export async function createRenderer() {
  const app = new Application();
  await app.init({ background: '#11151c', resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);

  const world = new Container();
  world.sortableChildren = true;
  app.stage.addChild(world);

  // Static isometric floor.
  const ground = new Graphics();
  const hw = KX * GROUND_STEP;
  const hh = KY * GROUND_STEP;
  for (let wx = 0; wx <= 4096; wx += GROUND_STEP) {
    for (let wy = 0; wy <= 4096; wy += GROUND_STEP) {
      const c = worldToScreen(wx, wy);
      ground
        .moveTo(c.x, c.y - hh)
        .lineTo(c.x + hw, c.y)
        .lineTo(c.x, c.y + hh)
        .lineTo(c.x - hw, c.y)
        .lineTo(c.x, c.y - hh);
    }
  }
  ground.stroke({ color: 0x2a3340, width: 1 });
  ground.zIndex = -1_000_000;
  world.addChild(ground);

  // Local player token.
  const localContainer = makeToken('you', 0xffffff);
  world.addChild(localContainer);

  return {
    app,
    addToken(id, name, color, x, y) {
      const container = makeToken(name, color);
      world.addChild(container);
      const token = { container, rx: x, ry: y, tx: x, ty: y };
      this.placeToken(token);
      return token;
    },
    removeToken(token) {
      world.removeChild(token.container);
      token.container.destroy({ children: true });
    },
    placeToken(token) {
      const p = worldToScreen(token.rx, token.ry);
      token.container.x = p.x;
      token.container.y = p.y;
      token.container.zIndex = depth(token.rx, token.ry);
    },
    setLocal(x, y) {
      const p = worldToScreen(x, y);
      localContainer.x = p.x;
      localContainer.y = p.y;
      localContainer.zIndex = depth(x, y);
    },
    centerCamera(x, y) {
      const p = worldToScreen(x, y);
      world.x = app.screen.width / 2 - p.x;
      world.y = app.screen.height / 2 - p.y;
    },
  };
}
```

- [ ] **Step 2: Write the orchestration entry point**

`web/src/main.js`:
```js
import { connect } from './net.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';

const MOVE_SPEED = 600; // world units / second
const INPUT_HZ = 15;

document.getElementById('name-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('name').value.trim() || 'anon';
  document.getElementById('overlay').style.display = 'none';
  await start(name);
});

async function start(name) {
  const r = await createRenderer();
  const input = createInput();
  const hud = document.getElementById('hud');

  const me = { id: 0, x: 2048, y: 2048 };
  const bounds = { minX: 0, minY: 0, maxX: 4095, maxY: 4095 };
  const others = new Map();

  const net = connect(`ws://${location.host}/ws`, name, {
    welcome(m) {
      me.id = m.id;
      bounds.minX = m.minX;
      bounds.minY = m.minY;
      bounds.maxX = m.maxX;
      bounds.maxY = m.maxY;
    },
    enter(m) {
      if (m.id === me.id) return;
      others.set(m.id, r.addToken(m.id, m.name, m.color, m.x, m.y));
    },
    leave(m) {
      const o = others.get(m.id);
      if (o) {
        r.removeToken(o);
        others.delete(m.id);
      }
    },
    snapshot(m) {
      for (const e of m.ents) {
        if (e.id === me.id) continue;
        const o = others.get(e.id);
        if (o) {
          o.tx = e.x;
          o.ty = e.y;
        }
      }
    },
  });

  let last = performance.now();
  let acc = 0;
  r.app.ticker.add(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;

    input.step(me, MOVE_SPEED, dt, bounds);
    r.setLocal(me.x, me.y);

    for (const o of others.values()) {
      o.rx += (o.tx - o.rx) * 0.2; // smooth toward latest snapshot
      o.ry += (o.ty - o.ry) * 0.2;
      r.placeToken(o);
    }

    r.centerCamera(me.x, me.y);

    acc += dt;
    if (acc >= 1 / INPUT_HZ) {
      acc = 0;
      net.sendInput(Math.round(me.x), Math.round(me.y));
    }

    hud.textContent = `${name} · players nearby: ${others.size}`;
  });
}
```

- [ ] **Step 3: Replace `index.html` with the real client shell**

`web/index.html` (replace entire file):
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>opencraft</title>
  <style>
    html, body { margin: 0; height: 100%; background: #11151c; overflow: hidden; font-family: system-ui, sans-serif; }
    #overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #11151c; z-index: 10; }
    #name-form { display: flex; gap: 8px; }
    #name, button { font-size: 16px; padding: 8px 12px; border-radius: 6px; border: 1px solid #2a3340; }
    #name { background: #0c0f14; color: #cfe; }
    button { background: #3CB44B; color: #06210c; border: none; cursor: pointer; }
    #hud { position: fixed; top: 8px; left: 8px; color: #9fb6c4; z-index: 5; font: 14px system-ui; }
  </style>
</head>
<body>
  <div id="overlay">
    <form id="name-form">
      <input id="name" placeholder="your name" maxlength="16" autocomplete="off" autofocus />
      <button type="submit">enter world</button>
    </form>
  </div>
  <div id="hud"></div>
  <script type="module" src="./src/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Syntax-check the JS modules**

Run: `node --check web/src/render.js && node --check web/src/main.js`
Expected: no output, exit 0. (Node can't resolve the CDN import, but `--check` only parses syntax — it does not execute imports.)

- [ ] **Step 5: Commit**
```bash
git add web/src/render.js web/src/main.js web/index.html
git commit -m "feat: add pixijs isometric renderer and client orchestration"
```

---

## Task 11: End-to-end verification + leaf docs

**Files:**
- Create: `docs/project-map/server.md`
- Create: `docs/project-map/client.md`
- Modify: `docs/project-map/README.md` (tree, task→doc, changelog)
- Modify: `AGENT_RULES.md` (pointer table rows)

- [ ] **Step 1: Run the full system and verify multiplayer presence**

Run: `go run ./cmd/server`
Then in a browser, open **two** tabs at `http://localhost:8080`, enter a name in each.
Expected, manually verified:
1. Each tab renders the isometric floor with its own token centered.
2. Moving with WASD/arrows in one tab moves that token; the **other tab sees it move** smoothly (interpolated), and the HUD "players nearby" count is ≥ 1.
3. Closing one tab makes its token disappear from the other within a moment (Leave).
4. Browser devtools console shows no errors; Network tab shows the `/ws` connection sending/receiving **binary** frames (not text/JSON).

If any check fails, fix the responsible module (re-open its task) before continuing.

- [ ] **Step 2: Write the server leaf doc**

`docs/project-map/server.md`:
```markdown
# server (Go engine)

the authoritative real-time engine. one process, one binary.

## packages
- `cmd/server/main.go` — entrypoint. starts the sim goroutine and the http server (`:8080`), graceful shutdown on SIGINT.
- `internal/wire` — binary protocol. encoders (server→client) + `ParseClient` decoder (client→server). little-endian, int16 positions. **single source of truth for the wire format; `web/src/wire.js` must mirror it byte-for-byte.**
- `internal/world/grid.go` — uniform 16×16 spatial grid (cell 256). `Neighbors` returns the 3×3 area-of-interest.
- `internal/world/sim.go` — the only goroutine that touches world state. 15 Hz tick. owns players, drives join/input/leave/ping via a command channel, emits per-client AoI snapshots + enter/leave events. non-blocking `send` drops oldest frames under backpressure.
- `internal/server/server.go` — http mux: `/` static files (`web/`) + `/ws` upgrade. one reader loop + one writer goroutine per connection; first frame must be Hello.

## sharp edges
- movement is **client-authoritative** (server only clamps to bounds). no anti-cheat yet — by design.
- `InsecureSkipVerify` allows all WS origins for local dev; tighten before any public deploy.
- positions are int16; world is fixed 4096². changing `WorldSize`/`CellSize` must keep `WorldSize % CellSize == 0`.
```

- [ ] **Step 3: Write the client leaf doc**

`docs/project-map/client.md`:
```markdown
# client (web)

vanilla ES modules, no bundler. PixiJS v8 from CDN. renders an isometric view of the shared world.

## modules (`web/src/`)
- `iso.js` — isometric projection (`worldToScreen`, `depth`). the only place that knows the camera is iso; the server is projection-agnostic.
- `wire.js` — binary codec mirroring `internal/wire`. **must stay byte-for-byte in sync with the Go side.**
- `net.js` — WebSocket connect, send Hello/Input, dispatch decoded frames to handlers.
- `input.js` — keyboard state → local movement integration (client-authoritative).
- `render.js` — PixiJS app: static iso floor, player tokens (shape + shadow + label), depth-sorted by world position, camera follow.
- `main.js` — orchestration: name-entry → connect → per-frame loop (move, interpolate remotes, center camera, rate-limited input send).
- `index.html` — name-entry overlay + HUD + module entry.

## sharp edges
- remote players are smoothed toward the latest snapshot (`rx += (tx-rx)*0.2`); not time-based interpolation — good enough for MVP.
- input is sent at ~15 Hz as an absolute position; the render loop runs at display refresh.
- WASD moves along world axes, which look diagonal under iso (acceptable for MVP).
```

- [ ] **Step 4: Register the leaf docs**

In `docs/project-map/README.md`, add to the `tree` block under the existing entries:
```
  server.md              # Go engine (cmd + internal packages)
  client.md              # web client (web/ modules)
```
Add to the `task → doc` table:
```markdown
| Go engine (server, sim, wire, grid) | `server.md` |
| web client (render, net, input) | `client.md` |
```
Prepend to the `changelog`:
```markdown
- 2026-06-11: implement MVP engine — Go tick server (`cmd/server`, `internal/{wire,world,server}`) + pixijs isometric client (`web/`). add `server.md` / `client.md` leaf docs.
```

In `AGENT_RULES.md`, add to the project-map pointer table:
```markdown
| Go engine (server / sim / wire / grid) | `docs/project-map/server.md` |
| web client (render / net / input) | `docs/project-map/client.md` |
```

- [ ] **Step 5: Final build + vet, then commit**

Run: `go build ./... && go vet ./...`
Expected: clean.
```bash
git add docs/project-map/server.md docs/project-map/client.md docs/project-map/README.md AGENT_RULES.md
git commit -m "docs: add server/client leaf docs and register MVP engine in project-map"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** FR1–FR10 from the PRD each map to a task — FR1/FR2 (Task 5 join + Task 4 Welcome), FR3 (Task 10), FR4 (Task 9 + Task 10 send), FR5 (Task 4 clamp/grid), FR6 (Task 4 AoI + Task 3 grid), FR7 (Task 10 interpolation), FR8 (Task 4/5 Leave), FR9 (Tasks 2 & 7 binary), FR10 (Task 1/5 static server). Milestones m1–m3 are delivered; m4 (load harness) is the deferred test surface noted below.
- **Placeholders:** none — every code step is complete and runnable.
- **Type consistency:** `wire.Ent{ID,X,Y}`, `Sim.Join/Input/Leave/Ping`, `Grid.Neighbors`, renderer `token{container,rx,ry,tx,ty}`, and the `connect(url,name,handlers)` handler keys (`welcome/snapshot/enter/leave/pong`) are used identically across Tasks 4, 5, 8, 10. The Go encoders and JS `decodeServer` offsets match the protocol table byte-for-byte.

## Deferred (greenlight required — per AGENT_RULES no-unsolicited-tests)

When you want tests, the highest-value first additions are: Go unit tests for `wire` encode↔decode round-trips and `grid.Neighbors` membership; and the **load harness** (m4) — N headless WebSocket clients doing random walks, measuring server CPU and per-client bandwidth vs. population to validate the interest-management scale thesis (PRD G3).
