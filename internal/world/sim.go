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
