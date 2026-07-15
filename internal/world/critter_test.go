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

func TestDropDeterministicFollowExcludesDropper(t *testing.T) {
	// Prove that when both dropper and second player are within followRadius,
	// the critter deterministically follows the second player (not the dropper).
	// Run ~10 iterations with fresh maps to defeat map iteration order luck.
	for iter := 0; iter < 10; iter++ {
		s := NewSim(nil)
		painted := map[tileKey]paintedTile{}
		burning := map[tileKey]int{}
		cw := newCritterWorld(int64(iter))

		// dropper at (1000, 1000)
		dropper := &player{id: 5, x: 1000, y: 1000, alive: true, out: make(chan []byte, 64)}
		// second player at (1100, 1100), also within critterFollowRadius
		other := &player{id: 6, x: 1100, y: 1100, alive: true, out: make(chan []byte, 64)}
		players := map[uint32]*player{5: dropper, 6: other}

		// critter held by dropper, will be dropped
		c := &critter{id: 1, kind: 1, x: 1050, y: 1050, tx: 1050, ty: 1050, state: critterHeld, holderID: 5}
		cw.critters[1] = c
		dropper.heldCritterID = 1

		// drop the critter at (1050, 1050) — both players are nearby
		s.dropCritter(players, painted, burning, cw, c, 1050, 1050)

		// must have switched to follow mode with the OTHER player, not the dropper
		if c.state != critterFollow {
			t.Fatalf("iter %d: state=%d, want critterFollow", iter, c.state)
		}
		if c.followID != 6 {
			t.Fatalf("iter %d: followID=%d, want 6 (the other player, not dropper 5)", iter, c.followID)
		}
	}
}

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

