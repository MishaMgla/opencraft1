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
