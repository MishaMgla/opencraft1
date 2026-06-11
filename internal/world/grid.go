package world

// World and grid geometry. Positions are int16 world units in [0, WorldSize-1].
const (
	WorldSize = 4096
	CellSize  = 256
	GridDim   = WorldSize / CellSize // 16
)

// Grid maps each cell to the set of entity ids currently inside it.
type Grid struct {
	cells [GridDim][GridDim]map[uint32]struct{}
}

func NewGrid() *Grid {
	g := &Grid{}
	for i := 0; i < GridDim; i++ {
		for j := 0; j < GridDim; j++ {
			g.cells[i][j] = map[uint32]struct{}{}
		}
	}
	return g
}

func cellOf(x, y int16) (int, int) {
	cx, cy := int(x)/CellSize, int(y)/CellSize
	if cx < 0 {
		cx = 0
	} else if cx >= GridDim {
		cx = GridDim - 1
	}
	if cy < 0 {
		cy = 0
	} else if cy >= GridDim {
		cy = GridDim - 1
	}
	return cx, cy
}

func (g *Grid) Insert(id uint32, x, y int16) {
	cx, cy := cellOf(x, y)
	g.cells[cx][cy][id] = struct{}{}
}

func (g *Grid) Remove(id uint32, x, y int16) {
	cx, cy := cellOf(x, y)
	delete(g.cells[cx][cy], id)
}

// Move relocates id from its old cell to its new cell (no-op if same cell).
func (g *Grid) Move(id uint32, ox, oy, nx, ny int16) {
	ocx, ocy := cellOf(ox, oy)
	ncx, ncy := cellOf(nx, ny)
	if ocx == ncx && ocy == ncy {
		return
	}
	delete(g.cells[ocx][ocy], id)
	g.cells[ncx][ncy][id] = struct{}{}
}

// Neighbors returns all entity ids in the 3x3 block of cells around (x, y),
// including the entity asking (callers skip self). This is the area of interest.
func (g *Grid) Neighbors(x, y int16) []uint32 {
	cx, cy := cellOf(x, y)
	var out []uint32
	for dx := -1; dx <= 1; dx++ {
		for dy := -1; dy <= 1; dy++ {
			nx, ny := cx+dx, cy+dy
			if nx < 0 || nx >= GridDim || ny < 0 || ny >= GridDim {
				continue
			}
			for id := range g.cells[nx][ny] {
				out = append(out, id)
			}
		}
	}
	return out
}
