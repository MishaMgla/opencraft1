package world

import (
	"context"
	"log"
	"time"

	"opencraft1/internal/wire"
)

const TickHz = 15
const PaintTileSize int16 = 128
const UltChargeNeeded byte = 12
const TrailUltTiles = 8
const SpawnCoord int16 = 2048

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
	id            uint32
	x, y          int16
	name          string
	color         uint32
	role          byte
	out           chan []byte
	lastPaintTile tileKey
	ultCharge     byte
	ultReady      bool
	trailLeft     int
	trailTiles    map[tileKey]struct{}
}

type tileKey struct {
	x, y int16
}

type paintedTile struct {
	x, y    int16
	color   uint32
	ownerID uint32
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
	role  byte
	out   chan []byte
	saved *SavedPlayer // nil = brand-new player: spawn at center, derive color
	reply chan joinResult
}

// joinResult carries what the connection goroutine needs once a join is
// processed: the assigned id and the player's initial-state frames (Welcome,
// the painted world, and Enters for players already present). These frames are
// returned for reliable delivery on the connection goroutine rather than
// streamed through the lossy out channel — see Sim.Join.
type joinResult struct {
	id      uint32
	initial [][]byte
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
type cmdPaint struct{ id uint32 }
type cmdUlt struct{ id uint32 }

// NewSim creates a sim. Pass a Store to persist player positions across
// restarts, or nil to disable persistence (local dev, tests).
func NewSim(store Store) *Sim {
	return &Sim{cmds: make(chan any, 1024), store: store, done: make(chan struct{})}
}

// Done is closed once Run has returned, i.e. after the synchronous shutdown
// flush completes. Callers wait on it before closing the Store / exiting so the
// final persist isn't cut short.
func (s *Sim) Done() <-chan struct{} { return s.done }

// Join registers a player and returns its assigned id plus the ordered frames
// that make up its initial world state (Welcome, every painted tile, and an
// Enter for each player already present). Blocks until the sim goroutine
// processes the join (fast). out receives ongoing frames only.
//
// The initial frames are returned rather than pushed into out because out is a
// lossy drop-oldest channel (see send): a painted world larger than out's
// buffer would otherwise overflow the channel during the join burst — before
// any writer drained it — and evict the oldest frame, the Welcome. A client
// that never receives Welcome never learns its id and can neither move nor
// paint. The caller must write these frames to the socket before starting the
// lossy writer; blocking there stalls only that one connection, never the sim.
//
// The saved-position lookup happens here, on the caller's connection goroutine,
// NOT inside the sim — so a slow DB never stalls the tick loop. A load error is
// logged and treated as "new player" (spawn at center) so persistence trouble
// degrades gracefully instead of blocking joins.
func (s *Sim) Join(name string, out chan []byte) (uint32, [][]byte) {
	return s.JoinWithRole(name, wire.RolePulse, out)
}

func (s *Sim) JoinWithRole(name string, role byte, out chan []byte) (uint32, [][]byte) {
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
	reply := make(chan joinResult, 1)
	s.cmds <- cmdJoin{name: name, role: validRole(role), out: out, saved: saved, reply: reply}
	r := <-reply
	return r.id, r.initial
}

func (s *Sim) Input(id uint32, x, y int16) { s.cmds <- cmdInput{id, x, y} }
func (s *Sim) Leave(id uint32)             { s.cmds <- cmdLeave{id} }
func (s *Sim) Ping(id uint32, t uint32)    { s.cmds <- cmdPing{id, t} }
func (s *Sim) Paint(id uint32)             { s.cmds <- cmdPaint{id} }
func (s *Sim) Ult(id uint32)               { s.cmds <- cmdUlt{id} }

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

func paintTileFor(x, y int16) tileKey {
	return tileKey{
		x: paintTileCoord(x),
		y: paintTileCoord(y),
	}
}

func paintTileCoord(v int16) int16 {
	pos := int(clamp(v))
	size := int(PaintTileSize)
	return int16(((pos + size/2) / size) * size)
}

func validRole(role byte) byte {
	switch role {
	case wire.RolePulse, wire.RoleCross, wire.RoleTrail:
		return role
	default:
		return wire.RolePulse
	}
}

func playerState(p *player) []byte {
	charge := p.ultCharge
	if p.ultReady {
		charge = UltChargeNeeded
	}
	return wire.EncodePlayer(p.id, p.role, charge, p.ultReady, p.name)
}

func broadcastPlayerState(players map[uint32]*player, p *player) {
	frame := playerState(p)
	for _, o := range players {
		send(o, frame)
	}
}

func validPaintTile(key tileKey) bool {
	return key.x >= 0 && key.y >= 0 && int(key.x) <= WorldSize && int(key.y) <= WorldSize
}

func tileChanged(existing paintedTile, exists bool, p *player) bool {
	return !exists || existing.color != p.color || existing.ownerID != p.id
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

// savePaint persists one painted tile asynchronously, mirroring save(): the
// values are already a detached SavedTile, so the spawned goroutine never
// touches sim state — no lock, no race.
func (s *Sim) savePaint(t SavedTile) {
	if s.store == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.store.SavePaint(ctx, t); err != nil {
			log.Printf("store save paint (%d,%d): %v", t.X, t.Y, err)
		}
	}()
}

// loadPaints seeds painted from the store so the painted world survives
// restarts. It runs once at Run startup — before the tick loop and before any
// player is served — so the "no DB on the sim goroutine" rule, which exists to
// protect the live loop, is not in play. A load error degrades to an empty
// world rather than blocking startup. Restored tiles get ownerID 0: no live
// player ever has id 0, so a rejoining painter is treated like anyone else
// (entering the tile still shakes), which is the right call since runtime ids
// don't survive a restart anyway.
func (s *Sim) loadPaints(painted map[tileKey]paintedTile) {
	if s.store == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tiles, err := s.store.LoadPaints(ctx)
	if err != nil {
		log.Printf("store load paints: %v", err)
		return
	}
	for _, t := range tiles {
		key := tileKey{t.X, t.Y}
		painted[key] = paintedTile{x: t.X, y: t.Y, color: t.Color, ownerID: 0}
	}
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

func (s *Sim) paint(players map[uint32]*player, painted map[tileKey]paintedTile, p *player, key tileKey, charge bool) bool {
	if !validPaintTile(key) {
		return false
	}
	existing, exists := painted[key]
	if !tileChanged(existing, exists, p) {
		return false
	}
	tile := paintedTile{x: key.x, y: key.y, color: p.color, ownerID: p.id}
	painted[key] = tile
	for _, o := range players {
		send(o, wire.EncodePaint(tile.x, tile.y, tile.color, tile.ownerID))
	}
	s.savePaint(SavedTile{X: tile.x, Y: tile.y, Color: tile.color, Owner: p.name})
	if charge && !p.ultReady && p.ultCharge < UltChargeNeeded {
		p.ultCharge++
		if p.ultCharge >= UltChargeNeeded {
			p.ultCharge = UltChargeNeeded
			p.ultReady = true
		}
		broadcastPlayerState(players, p)
	}
	return true
}

func (s *Sim) paintPulse(players map[uint32]*player, painted map[tileKey]paintedTile, p *player) {
	center := paintTileFor(p.x, p.y)
	for dx := -1; dx <= 1; dx++ {
		for dy := -1; dy <= 1; dy++ {
			key := tileKey{
				x: center.x + int16(dx)*PaintTileSize,
				y: center.y + int16(dy)*PaintTileSize,
			}
			s.paint(players, painted, p, key, false)
		}
	}
}

func (s *Sim) paintCross(players map[uint32]*player, painted map[tileKey]paintedTile, p *player) {
	center := paintTileFor(p.x, p.y)
	s.paint(players, painted, p, center, false)
	directions := []tileKey{{x: 1}, {x: -1}, {y: 1}, {y: -1}}
	for _, d := range directions {
		for step := int16(1); step <= 2; step++ {
			key := tileKey{
				x: center.x + d.x*PaintTileSize*step,
				y: center.y + d.y*PaintTileSize*step,
			}
			s.paint(players, painted, p, key, false)
		}
	}
}

func (s *Sim) activateUlt(players map[uint32]*player, painted map[tileKey]paintedTile, p *player) {
	if !p.ultReady {
		return
	}
	p.ultReady = false
	p.ultCharge = 0
	p.trailLeft = 0
	p.trailTiles = nil

	switch p.role {
	case wire.RolePulse:
		s.paintPulse(players, painted, p)
	case wire.RoleCross:
		s.paintCross(players, painted, p)
	case wire.RoleTrail:
		p.trailLeft = TrailUltTiles
		p.trailTiles = map[tileKey]struct{}{}
	}
	broadcastPlayerState(players, p)
}

func (s *Sim) applyTrail(players map[uint32]*player, painted map[tileKey]paintedTile, p *player, key tileKey) {
	if p.trailLeft <= 0 {
		return
	}
	if _, ok := p.trailTiles[key]; ok {
		return
	}
	p.trailTiles[key] = struct{}{}
	p.trailLeft--
	s.paint(players, painted, p, key, false)
	if p.trailLeft == 0 {
		p.trailTiles = nil
	}
}

// Run is the simulation loop. Call in its own goroutine.
func (s *Sim) Run(ctx context.Context) {
	defer close(s.done)

	players := map[uint32]*player{}
	painted := map[tileKey]paintedTile{}
	s.loadPaints(painted)
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
				px, py := SpawnCoord, SpawnCoord
				color := colorFor(id)
				if m.saved != nil {
					px, py = clamp(m.saved.X), clamp(m.saved.Y)
					color = m.saved.Color
				}
				p := &player{id: id, x: px, y: py, name: m.name, color: color, role: m.role, out: m.out, lastPaintTile: paintTileFor(px, py)}
				players[id] = p
				grid.Insert(id, p.x, p.y)

				// Build the joining player's initial state for reliable
				// delivery by the connection goroutine. Streaming these through
				// p.out would expose them to drop-oldest backpressure, which
				// evicts the Welcome frame once the painted world outgrows the
				// channel buffer. Broadcasts to OTHER players stay on the lossy
				// path — they already hold a full world and missing one Enter is
				// harmless.
				initial := make([][]byte, 0, 1+len(painted)+len(players))
				initial = append(initial, wire.EncodeWelcome(id, p.x, p.y, 0, 0, WorldSize-1, WorldSize-1))
				for _, tile := range painted {
					initial = append(initial, wire.EncodePaint(tile.x, tile.y, tile.color, tile.ownerID))
				}
				initial = append(initial, playerState(p))
				for oid, o := range players {
					if oid == id {
						continue
					}
					initial = append(initial, wire.EncodeEnter(o.id, o.x, o.y, o.color, o.name))
					initial = append(initial, playerState(o))
					send(o, wire.EncodeEnter(p.id, p.x, p.y, p.color, p.name))
					send(o, playerState(p))
				}
				m.reply <- joinResult{id: id, initial: initial}

			case cmdInput:
				p := players[m.id]
				if p == nil {
					continue
				}
				nx, ny := clamp(m.x), clamp(m.y)
				grid.Move(p.id, p.x, p.y, nx, ny)
				p.x, p.y = nx, ny
				tile := paintTileFor(nx, ny)
				if tile != p.lastPaintTile {
					p.lastPaintTile = tile
					if paintedTile, ok := painted[tile]; ok && paintedTile.ownerID != p.id {
						for _, o := range players {
							send(o, wire.EncodeShake(p.id))
						}
					}
					s.applyTrail(players, painted, p, tile)
				}

			case cmdPaint:
				p := players[m.id]
				if p == nil {
					continue
				}
				s.paint(players, painted, p, paintTileFor(p.x, p.y), true)

			case cmdUlt:
				p := players[m.id]
				if p == nil {
					continue
				}
				s.activateUlt(players, painted, p)

			case cmdPing:
				if p := players[m.id]; p != nil {
					send(p, wire.EncodePong(m.t))
				}

			case cmdLeave:
				p := players[m.id]
				if p == nil {
					continue
				}
				grid.Remove(m.id, p.x, p.y)
				delete(players, m.id)
				for _, o := range players {
					send(o, wire.EncodeLeave(m.id))
				}
				s.save(p)
			}

		case <-ticker.C:
			tick++
			for _, p := range players {
				ents := make([]wire.Ent, 0, len(players))
				for _, o := range players {
					ents = append(ents, wire.Ent{ID: o.id, X: o.x, Y: o.y})
				}
				send(p, wire.EncodeSnapshot(tick, ents))
			}
		}
	}
}
