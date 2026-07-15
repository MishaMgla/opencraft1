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
