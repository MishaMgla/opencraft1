package world

import (
	"sort"
	"testing"
)

func sortedIDs(ids []uint32) []uint32 {
	out := append([]uint32(nil), ids...)
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func equalIDs(a, b []uint32) bool {
	a, b = sortedIDs(a), sortedIDs(b)
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestCellOfClampsOutOfBounds(t *testing.T) {
	tests := []struct {
		x, y           int16
		wantCX, wantCY int
	}{
		{0, 0, 0, 0},
		{CellSize - 1, CellSize - 1, 0, 0},
		{CellSize, CellSize, 1, 1},
		{WorldSize - 1, WorldSize - 1, GridDim - 1, GridDim - 1},
		{-1, -1, 0, 0},                          // negative clamps to first cell
		{WorldSize + 1000, WorldSize, GridDim - 1, GridDim - 1}, // past edge clamps to last cell
	}
	for _, tt := range tests {
		cx, cy := cellOf(tt.x, tt.y)
		if cx != tt.wantCX || cy != tt.wantCY {
			t.Errorf("cellOf(%d,%d) = (%d,%d), want (%d,%d)",
				tt.x, tt.y, cx, cy, tt.wantCX, tt.wantCY)
		}
	}
}

func TestInsertAndRemove(t *testing.T) {
	g := NewGrid()
	g.Insert(1, 100, 100)
	if got := g.Neighbors(100, 100); !equalIDs(got, []uint32{1}) {
		t.Fatalf("after insert, neighbors = %v, want [1]", got)
	}
	g.Remove(1, 100, 100)
	if got := g.Neighbors(100, 100); len(got) != 0 {
		t.Fatalf("after remove, neighbors = %v, want empty", got)
	}
}

// Move within the same cell must be a no-op (the membership set is unchanged);
// Move across cells must relocate membership so the entity stops appearing in
// the old area of interest.
func TestMoveSameCellIsNoOp(t *testing.T) {
	g := NewGrid()
	g.Insert(1, 10, 10)
	g.Move(1, 10, 10, 20, 20) // both in cell (0,0)
	if got := g.Neighbors(10, 10); !equalIDs(got, []uint32{1}) {
		t.Fatalf("same-cell move dropped the entity: %v", got)
	}
}

func TestMoveAcrossCells(t *testing.T) {
	g := NewGrid()
	g.Insert(1, 10, 10) // cell (0,0)
	// Move far enough that the old and new 3x3 areas of interest do not overlap.
	farX, farY := int16(CellSize*8), int16(CellSize*8) // cell (8,8)
	g.Move(1, 10, 10, farX, farY)

	if got := g.Neighbors(10, 10); len(got) != 0 {
		t.Fatalf("entity still visible in old area: %v", got)
	}
	if got := g.Neighbors(farX, farY); !equalIDs(got, []uint32{1}) {
		t.Fatalf("entity not visible in new area: %v", got)
	}
}

// Neighbors returns the 3x3 block of cells. An interior point sees all 9 cells;
// a corner sees only the 4 in-bounds cells. This bounded fan-out is the whole
// point of interest management (PRD G3).
func TestNeighborsInterior(t *testing.T) {
	g := NewGrid()
	center := int16(CellSize*8 + CellSize/2) // middle of cell (8,8)
	// One entity in each of the 9 surrounding cells.
	var ids []uint32
	id := uint32(1)
	for dx := -1; dx <= 1; dx++ {
		for dy := -1; dy <= 1; dy++ {
			x := center + int16(dx*CellSize)
			y := center + int16(dy*CellSize)
			g.Insert(id, x, y)
			ids = append(ids, id)
			id++
		}
	}
	// And one far away that must NOT appear.
	g.Insert(99, 10, 10)

	got := g.Neighbors(center, center)
	if !equalIDs(got, ids) {
		t.Fatalf("interior neighbors = %v, want the 9 surrounding ids %v", sortedIDs(got), ids)
	}
}

func TestNeighborsCornerClipsToBounds(t *testing.T) {
	g := NewGrid()
	// Place entities in the four cells of the bottom-left corner: (0,0),(1,0),(0,1),(1,1).
	g.Insert(1, 10, 10)                 // (0,0)
	g.Insert(2, CellSize+10, 10)        // (1,0)
	g.Insert(3, 10, CellSize+10)        // (0,1)
	g.Insert(4, CellSize+10, CellSize+10) // (1,1)
	// And one outside the corner's 3x3 reach.
	g.Insert(5, CellSize*4, CellSize*4)

	got := g.Neighbors(10, 10) // querying cell (0,0): in-bounds block is the 4 corner cells
	if !equalIDs(got, []uint32{1, 2, 3, 4}) {
		t.Fatalf("corner neighbors = %v, want [1 2 3 4]", sortedIDs(got))
	}
}

// Two entities standing on the same spot are both reported.
func TestNeighborsCoLocated(t *testing.T) {
	g := NewGrid()
	g.Insert(1, 500, 500)
	g.Insert(2, 500, 500)
	if got := g.Neighbors(500, 500); !equalIDs(got, []uint32{1, 2}) {
		t.Fatalf("co-located neighbors = %v, want [1 2]", sortedIDs(got))
	}
}
