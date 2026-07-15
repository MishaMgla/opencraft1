package world

import (
	"math"
	"math/rand"

	"opencraft1/internal/wire"
)

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
const flowerConvertChance = 300   // ~1 conversion per critter per ~80s of settled wandering

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

// critterSnapshot detaches current critter state into wire form.
func critterSnapshot(cw *critterWorld) []wire.Critter {
	out := make([]wire.Critter, 0, len(cw.critters))
	for _, c := range cw.critters {
		out = append(out, wire.Critter{ID: c.id, Kind: c.kind, X: c.x, Y: c.y, State: c.state, HolderID: c.holderID})
	}
	return out
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
// or 0. First match wins — critters aren't picky. excludeID (0 = exclude nobody)
// skips that player id during the scan for deterministic attachment logic.
func nearestLivePlayer(players map[uint32]*player, c *critter, excludeID uint32) uint32 {
	r2 := critterFollowRadius * critterFollowRadius
	for id, p := range players {
		if id == excludeID || !p.alive || dist2(c.x, c.y, p.x, p.y) > r2 {
			continue
		}
		return id
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
			if pid := nearestLivePlayer(players, c, 0); pid != 0 {
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
		if pid := nearestLivePlayer(players, c, holderID); pid != 0 {
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
