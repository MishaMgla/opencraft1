package world

import (
	"context"
	"log"
	"time"

	"opencraft/internal/wire"
)

const TickHz = 15

// flushEvery is how often the sim persists all online players, bounding how
// much position is lost if the engine dies without a graceful shutdown.
const flushEvery = 30 * time.Second

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
// all interaction happens through the cmds channel (no locks). store is read
// off the sim goroutine (in Join) and written from spawned goroutines, so DB
// I/O never blocks the tick loop. A nil store disables persistence.
type Sim struct {
	cmds  chan any
	store Store
	done  chan struct{} // closed when Run returns (after the shutdown flush)
}

type cmdJoin struct {
	name  string
	out   chan []byte
	saved *SavedPlayer // nil = brand-new player: spawn at center, derive color
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

// NewSim creates a sim. Pass a Store to persist player positions across
// restarts, or nil to disable persistence (local dev, tests).
func NewSim(store Store) *Sim {
	return &Sim{cmds: make(chan any, 1024), store: store, done: make(chan struct{})}
}

// Done is closed once Run has returned, i.e. after the synchronous shutdown
// flush completes. Callers wait on it before closing the Store / exiting so the
// final persist isn't cut short.
func (s *Sim) Done() <-chan struct{} { return s.done }

// Join registers a player and returns its assigned id. Blocks until the sim
// goroutine processes the join (fast). out receives encoded frames.
//
// The saved-position lookup happens here, on the caller's connection goroutine,
// NOT inside the sim — so a slow DB never stalls the tick loop. A load error is
// logged and treated as "new player" (spawn at center) so persistence trouble
// degrades gracefully instead of blocking joins.
func (s *Sim) Join(name string, out chan []byte) uint32 {
	var saved *SavedPlayer
	if s.store != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		sp, ok, err := s.store.Load(ctx, name)
		cancel()
		switch {
		case err != nil:
			log.Printf("store load %q: %v", name, err)
		case ok:
			saved = &sp
		}
	}
	reply := make(chan uint32, 1)
	s.cmds <- cmdJoin{name: name, out: out, saved: saved, reply: reply}
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

// save persists one player asynchronously. Values are copied into a local
// SavedPlayer before the goroutine starts, so it never touches the live *player
// the sim mutates — no lock, no race.
func (s *Sim) save(p *player) {
	if s.store == nil {
		return
	}
	sp := SavedPlayer{Name: p.name, X: p.x, Y: p.y, Color: p.color}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.store.Save(ctx, sp); err != nil {
			log.Printf("store save %q: %v", sp.Name, err)
		}
	}()
}

// snapshot copies every online player's state into a detached slice the sim no
// longer owns — safe to hand to a goroutine or block on.
func (s *Sim) snapshot(players map[uint32]*player) []SavedPlayer {
	out := make([]SavedPlayer, 0, len(players))
	for _, p := range players {
		out = append(out, SavedPlayer{Name: p.name, X: p.x, Y: p.y, Color: p.color})
	}
	return out
}

// flushAsync persists all online players off the sim goroutine (periodic flush).
func (s *Sim) flushAsync(players map[uint32]*player) {
	if s.store == nil || len(players) == 0 {
		return
	}
	batch := s.snapshot(players)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		for _, sp := range batch {
			if err := s.store.Save(ctx, sp); err != nil {
				log.Printf("store flush %q: %v", sp.Name, err)
			}
		}
	}()
}

// flushAll persists all online players synchronously (graceful shutdown).
func (s *Sim) flushAll(players map[uint32]*player) {
	if s.store == nil || len(players) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for _, sp := range s.snapshot(players) {
		if err := s.store.Save(ctx, sp); err != nil {
			log.Printf("store shutdown flush %q: %v", sp.Name, err)
		}
	}
}

// Run is the simulation loop. Call in its own goroutine.
func (s *Sim) Run(ctx context.Context) {
	defer close(s.done)

	players := map[uint32]*player{}
	grid := NewGrid()
	var nextID uint32 = 1
	var tick uint32

	ticker := time.NewTicker(time.Second / TickHz)
	defer ticker.Stop()

	flush := time.NewTicker(flushEvery)
	defer flush.Stop()

	for {
		select {
		case <-ctx.Done():
			// Graceful shutdown: persist everyone synchronously before exiting,
			// using a fresh context since ctx is already cancelled.
			s.flushAll(players)
			return

		case <-flush.C:
			s.flushAsync(players)

		case c := <-s.cmds:
			switch m := c.(type) {
			case cmdJoin:
				id := nextID
				nextID++
				px, py := int16(WorldSize/2), int16(WorldSize/2)
				color := colorFor(id)
				if m.saved != nil {
					px, py = clamp(m.saved.X), clamp(m.saved.Y)
					color = m.saved.Color
				}
				p := &player{id: id, x: px, y: py, name: m.name, color: color, out: m.out}
				players[id] = p
				grid.Insert(id, p.x, p.y)
				send(p, wire.EncodeWelcome(id, p.x, p.y, 0, 0, WorldSize-1, WorldSize-1))
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
				s.save(p)
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
