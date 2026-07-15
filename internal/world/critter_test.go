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
