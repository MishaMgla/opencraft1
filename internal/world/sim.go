package world

import (
	"context"
	"log"
	"strconv"
	"strings"
	"time"

	"opencraft1/internal/wire"
)

const TickHz = 15
const PaintTileSize int16 = 128
const UltChargeNeeded byte = 12
const TrailUltTiles = 8
const SpawnCoord int16 = 2048

// Landmarks — fixed solid buildings (the soviet-eclectic set). Footprints
// extend east (+X) and northeast (-Y) from the southwest tile center. Movement,
// paint, fire, bombs and critters treat every landmark tile as blocked. The
// client mirrors this table in web/src/temple.ts — keep them in sync.
const templeSouthwestX = SpawnCoord
const templeSouthwestY = SpawnCoord - 2*PaintTileSize

type landmarkRect struct {
	swX, swY int16 // southwest tile center
	w, h     int16 // size in tiles: w east (+X), h northeast (-Y)
}

var landmarks = []landmarkRect{
	{templeSouthwestX, templeSouthwestY, 2, 2}, // panelka-deity (the old temple spot)
}

// Fire — a forest-fire cellular automaton over the painted map. Lava ignites
// flammable neighbours; fire crawls one ring per fireTickEvery ticks, each
// burning tile turns to temporary ash after burnTicks fire-steps, and ash clears
// back to the base world cell after ashTicks sim ticks. See
// docs/superpowers/specs/2026-07-09-fire-living-materials-design.md.
const fireTickEvery uint32 = 8 // run a fire step every N sim ticks (~2/sec at 15Hz)
const burnTicks = 3            // fire steps a tile stays alight before becoming ash
const ashTicks = TickHz        // sim ticks ash remains visible (~1s)

const (
	colorLava    uint32 = 0xE6194B // ignition source (never burns itself)
	colorGrass   uint32 = 0x3CB44B // flammable
	colorFlowers uint32 = 0xF032E6 // flammable
	ashColor     uint32 = 0x3A4757 // burned-out; inert, renders as the client's neutral diamond
)

func isLava(c uint32) bool      { return c == colorLava }
func isFlammable(c uint32) bool { return c == colorGrass || c == colorFlowers }

// Bombs — a Bomberman-like layer. A dropped bomb fuses, then explodes in a +
// cross that destroys terrain (reusing the fire automaton). Player elimination
// and walls land in later increments. See
// docs/superpowers/specs/2026-07-09-bombs-pvp-elimination-design.md.
const bombFuseTicks = 38 // ~2.5s at 15Hz
const bombRange = 2      // tiles per arm
const maxBombsPerPlayer = 2
const respawnTicks = 60 // ~4s dead before respawn (Increment 2)

// Chat — global, ephemeral live chat. Text is trimmed, capped, and rate-limited
// per player before broadcast; nothing is persisted or replayed on join.
const chatMaxRunes = 200        // hard cap on a broadcast chat line
const chatMinTicks = TickHz / 2 // min ticks between a player's accepted lines (~0.5s)

type bomb struct {
	ownerID uint32
	fuse    int
}

func neighbors4(k tileKey) [4]tileKey {
	return [4]tileKey{
		{k.x + PaintTileSize, k.y}, {k.x - PaintTileSize, k.y},
		{k.x, k.y + PaintTileSize}, {k.x, k.y - PaintTileSize},
	}
}

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
	character     string
	color         uint32
	role          byte
	out           chan []byte
	lastPaintTile tileKey
	ultCharge     byte
	ultReady      bool
	trailLeft     int
	trailTiles    map[tileKey]struct{}
	alive         bool
	kills         byte
	respawnLeft   int    // ticks until respawn while dead (0 = alive)
	chatted       bool   // has the player sent at least one accepted chat line
	lastChatTick  uint32 // tick of the player's last accepted chat line (rate limit)
	heldCritterID uint32
	snap          chan []byte // latest-only slot for self-superseding snapshots (SCritters)
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
// off the sim goroutine (in Join); paint writes run through an ordered async
// queue. A nil store disables persistence.
type Sim struct {
	cmds         chan any
	store        Store
	emptyPreview bool          // construction-only; legacy NewSim behavior stays unchanged
	done         chan struct{} // closed when Run returns (after the shutdown flush)
	paintOps     chan SavedTile
}

type cmdJoin struct {
	name      string
	role      byte
	character string
	out       chan []byte
	snap      chan []byte
	saved     *SavedPlayer // nil = brand-new player: spawn at center, derive color
	reply     chan joinResult
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
type cmdJump struct{ id uint32 }
type cmdBomb struct{ id uint32 }
type cmdChat struct {
	id   uint32
	text string
}
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

// NewSim creates a sim. Pass a Store to persist player positions across
// restarts, or nil to disable persistence (local dev, tests).
func NewSim(store Store) *Sim {
	return &Sim{cmds: make(chan any, 1024), store: store, done: make(chan struct{}), paintOps: make(chan SavedTile, 8192)}
}

// NewEmptyPreview reuses movement, presence and chat without legacy mechanics
// or persistence. It deliberately cannot receive a production Store.
func NewEmptyPreview() *Sim {
	s := NewSim(nil)
	s.emptyPreview = true
	return s
}

// Done is closed once Run has returned, i.e. after the synchronous shutdown
// player flush and queued paint writes complete. Callers wait on it before
// closing the Store / exiting so the final persist isn't cut short.
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
	return s.JoinWithProfile(name, role, "", out, make(chan []byte, 1))
}

func (s *Sim) JoinWithProfile(name string, role byte, character string, out chan []byte, snap chan []byte) (uint32, [][]byte) {
	return s.joinProfile(name, role, character, nil, out, snap)
}

// JoinPreview restores a server-authenticated profile without name-keyed I/O.
// It cannot be used to inject saved state into the legacy world.
func (s *Sim) JoinPreview(name, character string, saved *SavedPlayer, out, snap chan []byte) (uint32, [][]byte) {
	if !s.emptyPreview {
		panic("JoinPreview requires NewEmptyPreview")
	}
	return s.joinProfile(name, wire.RolePulse, character, saved, out, snap)
}

func (s *Sim) joinProfile(name string, role byte, character string, saved *SavedPlayer, out chan []byte, snap chan []byte) (uint32, [][]byte) {
	if s.emptyPreview {
		prefix := "shape-"
		if strings.HasPrefix(character, "shape2-") {
			prefix = "shape2-"
		}
		seed, err := strconv.ParseUint(strings.TrimPrefix(character, prefix), 16, 32)
		if err != nil {
			seed = 1
			prefix = "shape-"
		}
		character = prefix + strconv.FormatUint(seed, 16)
	} else {
		character = validCharacter(character)
	}
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
	s.cmds <- cmdJoin{name: name, role: validRole(role), character: character, out: out, snap: snap, saved: saved, reply: reply}
	r := <-reply
	return r.id, r.initial
}

func (s *Sim) Input(id uint32, x, y int16) { s.cmds <- cmdInput{id, x, y} }
func (s *Sim) Leave(id uint32)             { s.cmds <- cmdLeave{id} }
func (s *Sim) Ping(id uint32, t uint32)    { s.cmds <- cmdPing{id, t} }
func (s *Sim) Paint(id uint32)             { s.cmds <- cmdPaint{id} }
func (s *Sim) Ult(id uint32)               { s.cmds <- cmdUlt{id} }
func (s *Sim) Jump(id uint32)              { s.cmds <- cmdJump{id} }
func (s *Sim) Bomb(id uint32)              { s.cmds <- cmdBomb{id} }
func (s *Sim) Chat(id uint32, text string) { s.cmds <- cmdChat{id, text} }
func (s *Sim) Grab(id, critterID uint32)   { s.cmds <- cmdGrab{id, critterID} }
func (s *Sim) Hold(id uint32, x, y int16)  { s.cmds <- cmdHold{id, x, y} }
func (s *Sim) Drop(id uint32, x, y int16)  { s.cmds <- cmdDrop{id, x, y} }

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

// isTempleTile reports whether a tile sits inside ANY fixed landmark (the name
// survives from the single-temple era; every call site means "blocked by a
// landmark").
func isTempleTile(key tileKey) bool {
	for _, l := range landmarks {
		if key.x >= l.swX && key.x < l.swX+l.w*PaintTileSize &&
			key.y <= l.swY && key.y > l.swY-l.h*PaintTileSize {
			return true
		}
	}
	return false
}

// templeBlocksMovement rejects both ordinary entry and a malicious position
// jump across any landmark. Tile snapping makes each blocked point rectangle
// inclusive at its northwest edges and one unit short of the next tile center
// at its southeast edges.
func templeBlocksMovement(fromX, fromY, toX, toY int16) bool {
	for _, l := range landmarks {
		minX := float64(l.swX - PaintTileSize/2)
		maxX := float64(l.swX + l.w*PaintTileSize - PaintTileSize/2 - 1)
		minY := float64(l.swY - l.h*PaintTileSize + PaintTileSize/2)
		maxY := float64(l.swY + PaintTileSize/2 - 1)
		if segmentHitsRect(float64(fromX), float64(fromY), float64(toX), float64(toY), minX, maxX, minY, maxY) {
			return true
		}
	}
	return false
}

// segmentHitsRect is a Liang-Barsky segment/axis-aligned-rect intersection.
func segmentHitsRect(fx, fy, tx, ty, minX, maxX, minY, maxY float64) bool {
	tMin, tMax := 0.0, 1.0
	clip := func(position, delta, low, high float64) bool {
		if delta == 0 {
			return position >= low && position <= high
		}
		t1 := (low - position) / delta
		t2 := (high - position) / delta
		if t1 > t2 {
			t1, t2 = t2, t1
		}
		if t1 > tMin {
			tMin = t1
		}
		if t2 < tMax {
			tMax = t2
		}
		return tMin <= tMax
	}
	dx := tx - fx
	dy := ty - fy
	return clip(fx, dx, minX, maxX) && clip(fy, dy, minY, maxY)
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

func validCharacter(character string) string {
	switch character {
	case "horse-poison", "pigeon-poison", "pinniped-poison", "jesus-poison":
		return character
	case "horse-pro", "pigeon-man-pro", "pinniped-man-pro", "jesus-pro":
		return character
	default:
		return "horse-poison"
	}
}

func playerState(p *player) []byte {
	charge := p.ultCharge
	if p.ultReady {
		charge = UltChargeNeeded
	}
	return wire.EncodePlayer(p.id, p.role, charge, p.ultReady, p.kills, p.name, p.character)
}

func broadcastPlayerState(players map[uint32]*player, p *player) {
	frame := playerState(p)
	for _, o := range players {
		send(o, frame)
	}
}

func validPaintTile(key tileKey) bool {
	return key.x >= 0 && key.y >= 0 && int(key.x) <= WorldSize && int(key.y) <= WorldSize && !isTempleTile(key)
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

// startPaintStoreWorker serializes paint upserts/deletes in the same order the
// sim accepted them. That keeps a burn clear followed by a repaint from deleting
// the newer paint if the database is slow.
func (s *Sim) startPaintStoreWorker() chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		if s.store == nil {
			for range s.paintOps {
			}
			return
		}
		for t := range s.paintOps {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			if err := s.store.SavePaint(ctx, t); err != nil {
				log.Printf("store save paint (%d,%d): %v", t.X, t.Y, err)
			}
			cancel()
		}
	}()
	return done
}

// savePaint persists one painted-tile upsert/delete asynchronously. Values are
// detached before entering the ordered persistence queue, so the worker never
// touches sim-owned maps.
func (s *Sim) savePaint(t SavedTile) {
	if s.store == nil {
		return
	}
	s.paintOps <- t
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
		if isTempleTile(key) {
			continue
		}
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

func (s *Sim) paint(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, ashTimers map[tileKey]int, p *player, key tileKey, charge bool) bool {
	if !validPaintTile(key) {
		return false
	}
	existing, exists := painted[key]
	if !tileChanged(existing, exists, p) {
		return false
	}
	delete(burning, key)
	delete(ashTimers, key)
	tile := paintedTile{x: key.x, y: key.y, color: p.color, ownerID: p.id}
	painted[key] = tile
	for _, o := range players {
		send(o, wire.EncodePaint(tile.x, tile.y, tile.color, tile.ownerID))
	}
	s.savePaint(SavedTile{X: tile.x, Y: tile.y, Color: tile.color, Owner: p.name})
	// Ignition: painting lava lights flammable neighbours; painting flammable
	// next to lava (or an already-burning tile) lights the new tile itself.
	if isLava(p.color) {
		for _, n := range neighbors4(key) {
			s.ignite(players, painted, burning, n)
		}
	} else if isFlammable(p.color) {
		for _, n := range neighbors4(key) {
			if _, on := burning[n]; on {
				s.ignite(players, painted, burning, key)
				break
			}
			if t, ok := painted[n]; ok && isLava(t.color) {
				s.ignite(players, painted, burning, key)
				break
			}
		}
	}
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

// ignite adds a flammable, not-yet-burning tile to the burning set and tells
// every client to show a flame there. Non-flammable/unpainted/already-burning
// tiles are ignored, so callers can fire it at any neighbour blindly.
func (s *Sim) ignite(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, key tileKey) {
	if isTempleTile(key) {
		return
	}
	if _, on := burning[key]; on {
		return
	}
	t, ok := painted[key]
	if !ok || !isFlammable(t.color) {
		return
	}
	burning[key] = burnTicks
	for _, o := range players {
		send(o, wire.EncodeFire(key.x, key.y))
	}
}

// fireStep advances the fire automaton one ring: burning tiles spread to their
// flammable neighbours, age, and turn to ash when spent. Cost is O(|burning|),
// and every tile burns exactly once before becoming inert ash, so a fire
// consumes a connected flammable region and self-terminates.
// ponytail: O(burning frontier) per fire step; index burning by grid cell only
// if the painted world ever gets huge.
func (s *Sim) fireStep(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, ashTimers map[tileKey]int) {
	if len(burning) == 0 {
		return
	}
	// Spread targets are computed from the CURRENT frontier and ignited only
	// after ageing, so a tile lit this step spreads on the NEXT step (one ring).
	var newly []tileKey
	for k := range burning {
		for _, n := range neighbors4(k) {
			if _, on := burning[n]; on {
				continue
			}
			if t, ok := painted[n]; ok && isFlammable(t.color) {
				newly = append(newly, n)
			}
		}
	}
	for k := range burning {
		burning[k]--
		if burning[k] <= 0 {
			delete(burning, k)
			current, ok := painted[k]
			if !ok || !isFlammable(current.color) {
				continue
			}
			ash := paintedTile{x: k.x, y: k.y, color: ashColor, ownerID: 0}
			painted[k] = ash
			ashTimers[k] = ashTicks
			for _, o := range players {
				send(o, wire.EncodePaint(ash.x, ash.y, ash.color, ash.ownerID))
			}
			s.savePaint(SavedTile{X: ash.x, Y: ash.y, Color: 0, Owner: ""})
		}
	}
	for _, n := range newly {
		s.ignite(players, painted, burning, n)
	}
}

func (s *Sim) ashStep(players map[uint32]*player, painted map[tileKey]paintedTile, ashTimers map[tileKey]int) {
	if len(ashTimers) == 0 {
		return
	}
	for k := range ashTimers {
		ashTimers[k]--
		if ashTimers[k] > 0 {
			continue
		}
		delete(ashTimers, k)
		if t, ok := painted[k]; ok && t.color == ashColor {
			delete(painted, k)
			for _, o := range players {
				send(o, wire.EncodePaint(k.x, k.y, 0, 0))
			}
		}
	}
}

// placeBomb drops a bomb on the player's current tile, subject to the one-per-
// tile and per-player-count caps, and tells everyone to render it.
func (s *Sim) placeBomb(players map[uint32]*player, bombs map[tileKey]*bomb, p *player) {
	key := paintTileFor(p.x, p.y)
	if isTempleTile(key) {
		return
	}
	if _, taken := bombs[key]; taken {
		return
	}
	live := 0
	for _, b := range bombs {
		if b.ownerID == p.id {
			live++
		}
	}
	if live >= maxBombsPerPlayer {
		return
	}
	bombs[key] = &bomb{ownerID: p.id, fuse: bombFuseTicks}
	for _, o := range players {
		send(o, wire.EncodeBomb(key.x, key.y, p.id))
	}
}

// koPlayer eliminates a live player: marks it dead, starts its respawn timer,
// announces the kill, and credits the killer (self-kills credit nobody).
func (s *Sim) koPlayer(players map[uint32]*player, victim *player, killerID uint32) {
	if !victim.alive {
		return
	}
	victim.alive = false
	victim.respawnLeft = respawnTicks
	for _, o := range players {
		send(o, wire.EncodeKO(victim.id, killerID))
	}
	if killerID != 0 && killerID != victim.id {
		if killer := players[killerID]; killer != nil {
			if killer.kills < 255 {
				killer.kills++
			}
			broadcastPlayerState(players, killer)
		}
	}
}

// blastTile applies one detonation cell: KOs any live player standing on it,
// chains a bomb sitting there, ignites flammable terrain, or destroys other
// painted terrain to ash. Empty ground is left to the client flash. (Increment 3
// adds indestructible walls here.)
func (s *Sim) blastTile(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, bombs map[tileKey]*bomb, t tileKey, ownerID uint32, queue *[]tileKey) {
	if isTempleTile(t) {
		return
	}
	for _, p := range players {
		if p.alive && paintTileFor(p.x, p.y) == t {
			s.koPlayer(players, p, ownerID)
		}
	}
	if _, ok := bombs[t]; ok {
		*queue = append(*queue, t) // chain reaction
	}
	existing, ok := painted[t]
	if !ok {
		return
	}
	if isFlammable(existing.color) {
		s.ignite(players, painted, burning, t)
		return
	}
	ash := paintedTile{x: t.x, y: t.y, color: ashColor, ownerID: 0}
	painted[t] = ash
	for _, o := range players {
		send(o, wire.EncodePaint(ash.x, ash.y, ash.color, ash.ownerID))
	}
	s.savePaint(SavedTile{X: ash.x, Y: ash.y, Color: ash.color, Owner: ""})
}

// detonateBombs explodes each seed bomb in a + cross (arms clipped at the world
// edge), broadcasting a blast per bomb and chaining any bomb caught in a blast.
// A bomb is removed before its blast runs, so chains cannot double-fire.
func (s *Sim) detonateBombs(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, bombs map[tileKey]*bomb, seeds []tileKey) {
	dirs := [4]tileKey{{PaintTileSize, 0}, {-PaintTileSize, 0}, {0, PaintTileSize}, {0, -PaintTileSize}}
	queue := seeds
	for len(queue) > 0 {
		center := queue[0]
		queue = queue[1:]
		b, ok := bombs[center]
		if !ok {
			continue // already detonated (chained earlier)
		}
		owner := b.ownerID
		delete(bombs, center)
		var arms [4]byte
		s.blastTile(players, painted, burning, bombs, center, owner, &queue)
		for i, d := range dirs {
			for step := int16(1); step <= bombRange; step++ {
				t := tileKey{x: center.x + d.x*step, y: center.y + d.y*step}
				if !validPaintTile(t) {
					break
				}
				arms[i] = byte(step)
				s.blastTile(players, painted, burning, bombs, t, owner, &queue)
			}
		}
		for _, o := range players {
			send(o, wire.EncodeBlast(center.x, center.y, arms[0], arms[1], arms[2], arms[3]))
		}
	}
}

func (s *Sim) paintPulse(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, ashTimers map[tileKey]int, p *player) {
	center := paintTileFor(p.x, p.y)
	for dx := -1; dx <= 1; dx++ {
		for dy := -1; dy <= 1; dy++ {
			key := tileKey{
				x: center.x + int16(dx)*PaintTileSize,
				y: center.y + int16(dy)*PaintTileSize,
			}
			s.paint(players, painted, burning, ashTimers, p, key, false)
		}
	}
}

func (s *Sim) paintCross(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, ashTimers map[tileKey]int, p *player) {
	center := paintTileFor(p.x, p.y)
	s.paint(players, painted, burning, ashTimers, p, center, false)
	directions := []tileKey{{x: 1}, {x: -1}, {y: 1}, {y: -1}}
	for _, d := range directions {
		for step := int16(1); step <= 2; step++ {
			key := tileKey{
				x: center.x + d.x*PaintTileSize*step,
				y: center.y + d.y*PaintTileSize*step,
			}
			s.paint(players, painted, burning, ashTimers, p, key, false)
		}
	}
}

func (s *Sim) activateUlt(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, ashTimers map[tileKey]int, p *player) {
	if !p.ultReady {
		return
	}
	p.ultReady = false
	p.ultCharge = 0
	p.trailLeft = 0
	p.trailTiles = nil

	switch p.role {
	case wire.RolePulse:
		s.paintPulse(players, painted, burning, ashTimers, p)
	case wire.RoleCross:
		s.paintCross(players, painted, burning, ashTimers, p)
	case wire.RoleTrail:
		p.trailLeft = TrailUltTiles
		p.trailTiles = map[tileKey]struct{}{}
	}
	broadcastPlayerState(players, p)
}

func (s *Sim) applyTrail(players map[uint32]*player, painted map[tileKey]paintedTile, burning map[tileKey]int, ashTimers map[tileKey]int, p *player, key tileKey) {
	if p.trailLeft <= 0 {
		return
	}
	if _, ok := p.trailTiles[key]; ok {
		return
	}
	p.trailTiles[key] = struct{}{}
	p.trailLeft--
	s.paint(players, painted, burning, ashTimers, p, key, false)
	if p.trailLeft == 0 {
		p.trailTiles = nil
	}
}

// Run is the simulation loop. Call in its own goroutine.
func (s *Sim) Run(ctx context.Context) {
	defer close(s.done)
	paintStoreDone := s.startPaintStoreWorker()
	defer func() {
		close(s.paintOps)
		<-paintStoreDone
	}()

	players := map[uint32]*player{}
	painted := map[tileKey]paintedTile{}
	burning := map[tileKey]int{} // tile -> fire-steps remaining (transient, never persisted)
	ashTimers := map[tileKey]int{}
	bombs := map[tileKey]*bomb{} // tile -> live bomb (transient, never persisted)
	cw := newCritterWorld(time.Now().UnixNano())
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
			if s.emptyPreview {
				switch c.(type) {
				case cmdJoin, cmdInput, cmdChat, cmdPing, cmdLeave:
				default:
					continue // fail closed even when a client sends a legacy action
				}
			}
			switch m := c.(type) {
			case cmdJoin:
				id := nextID
				nextID++
				px, py := SpawnCoord, SpawnCoord
				if s.emptyPreview {
					px += int16((id-1)%5) * 96
					py += int16(((id-1)/5)%5) * 96
				}
				color := colorFor(id)
				if m.saved != nil {
					px, py = clamp(m.saved.X), clamp(m.saved.Y)
					color = m.saved.Color
				}
				if !s.emptyPreview && isTempleTile(paintTileFor(px, py)) {
					px, py = SpawnCoord, SpawnCoord
				}
				p := &player{id: id, x: px, y: py, name: m.name, character: m.character, color: color, role: m.role, out: m.out, snap: m.snap, lastPaintTile: paintTileFor(px, py), alive: true}
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
				initial = append(initial, wire.EncodeCritters(critterSnapshot(cw)))
				initial = append(initial, playerState(p))
				for oid, o := range players {
					if oid == id {
						continue
					}
					initial = append(initial, wire.EncodeEnter(o.id, o.x, o.y, o.color, o.name, o.character))
					initial = append(initial, playerState(o))
					send(o, wire.EncodeEnter(p.id, p.x, p.y, p.color, p.name, p.character))
					send(o, playerState(p))
				}
				m.reply <- joinResult{id: id, initial: initial}

			case cmdInput:
				p := players[m.id]
				if p == nil || !p.alive {
					continue // dead players are frozen at their death spot until respawn
				}
				nx, ny := clamp(m.x), clamp(m.y)
				if !s.emptyPreview && templeBlocksMovement(p.x, p.y, nx, ny) {
					continue
				}
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
					s.applyTrail(players, painted, burning, ashTimers, p, tile)
				}

			case cmdPaint:
				p := players[m.id]
				if p == nil || !p.alive {
					continue
				}
				s.paint(players, painted, burning, ashTimers, p, paintTileFor(p.x, p.y), true)

			case cmdUlt:
				p := players[m.id]
				if p == nil || !p.alive {
					continue
				}
				s.activateUlt(players, painted, burning, ashTimers, p)

			case cmdJump:
				p := players[m.id]
				if p == nil || !p.alive {
					continue
				}
				for _, o := range players {
					send(o, wire.EncodeJump(p.id))
				}

			case cmdBomb:
				p := players[m.id]
				if p == nil || !p.alive {
					continue
				}
				s.placeBomb(players, bombs, p)

			case cmdChat:
				// Ephemeral: validate, rate-limit, broadcast; never persisted.
				// Dead players may still chat (ghosts stay present).
				p := players[m.id]
				if p == nil {
					continue
				}
				text := strings.TrimSpace(m.text)
				if text == "" {
					continue
				}
				if r := []rune(text); len(r) > chatMaxRunes {
					text = string(r[:chatMaxRunes])
				}
				if p.chatted && tick-p.lastChatTick < chatMinTicks {
					continue // too soon since this player's last line
				}
				p.chatted = true
				p.lastChatTick = tick
				frame := wire.EncodeChat(p.name, text)
				for _, o := range players {
					send(o, frame)
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
				grid.Remove(m.id, p.x, p.y)
				delete(players, m.id)
				for _, o := range players {
					send(o, wire.EncodeLeave(m.id))
				}
				s.save(p)

			case cmdGrab:
				s.grabCritter(players, cw, players[m.id], m.critterID)

			case cmdHold:
				s.holdCritter(players, players[m.id], cw, m.x, m.y)

			case cmdDrop:
				s.dropCritterCmd(players, painted, burning, cw, players[m.id], m.x, m.y)
			}

		case <-ticker.C:
			tick++
			s.ashStep(players, painted, ashTimers)
			if len(bombs) > 0 {
				var seeds []tileKey
				for k, b := range bombs {
					b.fuse--
					if b.fuse <= 0 {
						seeds = append(seeds, k)
					}
				}
				if len(seeds) > 0 {
					s.detonateBombs(players, painted, burning, bombs, seeds)
				}
			}
			if tick%fireTickEvery == 0 {
				s.fireStep(players, painted, burning, ashTimers)
			}
			for _, p := range players {
				if p.alive {
					continue
				}
				p.respawnLeft--
				if p.respawnLeft <= 0 {
					ox, oy := p.x, p.y
					p.alive = true
					p.x, p.y = SpawnCoord, SpawnCoord
					p.lastPaintTile = paintTileFor(p.x, p.y)
					grid.Move(p.id, ox, oy, p.x, p.y)
					for _, o := range players {
						send(o, wire.EncodeRespawn(p.id, p.x, p.y))
					}
				}
			}
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
