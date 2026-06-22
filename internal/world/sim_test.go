package world

import (
	"context"
	"encoding/binary"
	"sync"
	"testing"
	"time"

	"opencraft1/internal/wire"
)

// fakeStore is an in-memory world.Store for driving the persistence paths. It is
// concurrency-safe because Save/SavePaint run on goroutines the sim spawns while
// the test reads from its own goroutine.
type fakeStore struct {
	mu      sync.Mutex
	preload []SavedTile // returned by LoadPaints (startup replay)
	paints  []SavedTile // captured by SavePaint
}

func (f *fakeStore) Load(context.Context, string) (SavedPlayer, bool, error) {
	return SavedPlayer{}, false, nil
}
func (f *fakeStore) Save(context.Context, SavedPlayer) error { return nil }
func (f *fakeStore) SavePaint(_ context.Context, t SavedTile) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.paints = append(f.paints, t)
	return nil
}
func (f *fakeStore) LoadPaints(context.Context) ([]SavedTile, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.preload, nil
}

func (f *fakeStore) savedPaints() []SavedTile {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]SavedTile(nil), f.paints...)
}

func startSimWithStore(t *testing.T, store Store) *Sim {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	s := NewSim(store)
	go s.Run(ctx)
	return s
}

func TestClamp(t *testing.T) {
	tests := []struct{ in, want int16 }{
		{-1, 0},
		{0, 0},
		{100, 100},
		{WorldSize - 1, WorldSize - 1},
		{WorldSize, WorldSize - 1},
		{WorldSize + 5000, WorldSize - 1},
	}
	for _, tt := range tests {
		if got := clamp(tt.in); got != tt.want {
			t.Errorf("clamp(%d) = %d, want %d", tt.in, got, tt.want)
		}
	}
}

func TestDiff(t *testing.T) {
	got := diff([]uint32{1, 2, 3, 4}, []uint32{2, 4})
	want := []uint32{1, 3} // a \ b, preserving order of a
	if len(got) != len(want) {
		t.Fatalf("diff = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("diff = %v, want %v", got, want)
		}
	}
	if d := diff([]uint32{1, 2}, []uint32{1, 2}); len(d) != 0 {
		t.Fatalf("diff of equal sets = %v, want empty", d)
	}
	if d := diff(nil, []uint32{1}); len(d) != 0 {
		t.Fatalf("diff of empty a = %v, want empty", d)
	}
}

func TestColorForIsDeterministic(t *testing.T) {
	for id := uint32(0); id < 20; id++ {
		got := colorFor(id)
		want := palette[int(id)%len(palette)]
		if got != want {
			t.Errorf("colorFor(%d) = %#x, want %#x", id, got, want)
		}
	}
}

// --- integration: drive the real Sim goroutine through its public API ---

func startSim(t *testing.T) *Sim {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	s := NewSim(nil)
	go s.Run(ctx)
	return s
}

// clientJoin joins the way the real server connection does: it delivers the
// reliable initial-state frames first, then lets the ongoing stream flow —
// both observable on out. Tests can therefore keep treating out as the full
// ordered sequence of frames the client receives. The out channels here are
// generously buffered, so feeding the (small) initial burst never blocks.
func clientJoin(s *Sim, name string, out chan []byte) uint32 {
	id, initial := s.Join(name, out)
	for _, b := range initial {
		out <- b
	}
	return id
}

func frameID(b []byte) uint32 { return binary.LittleEndian.Uint32(b[1:]) }

func frameInt16(b []byte, off int) int16 { return int16(binary.LittleEndian.Uint16(b[off:])) }

// waitFor reads frames from out until pred is satisfied or the deadline passes.
// Snapshots tick in continuously, so callers filter by message tag.
func waitFor(t *testing.T, out chan []byte, pred func(b []byte) bool) bool {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case b := <-out:
			if pred(b) {
				return true
			}
		case <-deadline:
			return false
		}
	}
}

func tagIs(tag byte, id uint32) func([]byte) bool {
	return func(b []byte) bool { return len(b) >= 5 && b[0] == tag && frameID(b) == id }
}

func paintIs(x, y int16, color, ownerID uint32) func([]byte) bool {
	return func(b []byte) bool {
		return len(b) == 13 &&
			b[0] == wire.SPaint &&
			frameInt16(b, 1) == x &&
			frameInt16(b, 3) == y &&
			binary.LittleEndian.Uint32(b[5:]) == color &&
			binary.LittleEndian.Uint32(b[9:]) == ownerID
	}
}

func pongIs(t uint32) func([]byte) bool {
	return func(b []byte) bool {
		return len(b) == 5 && b[0] == wire.SPong && binary.LittleEndian.Uint32(b[1:]) == t
	}
}

// drain empties whatever is currently buffered so a later waitFor only sees new
// events.
func drain(out chan []byte) {
	for {
		select {
		case <-out:
		default:
			return
		}
	}
}

func countShakesUntilPong(t *testing.T, out chan []byte, playerID uint32, pongToken uint32) int {
	t.Helper()
	deadline := time.After(2 * time.Second)
	shakes := 0
	for {
		select {
		case b := <-out:
			if tagIs(wire.SShake, playerID)(b) {
				shakes++
			}
			if pongIs(pongToken)(b) {
				return shakes
			}
		case <-deadline:
			t.Fatalf("timed out waiting for pong %d", pongToken)
		}
	}
}

// On join, the newcomer and every player already in its area of interest must
// exchange Enter events (FR2/FR6). Players spawn at world center, so two joiners
// start co-located and mutually visible.
func TestJoinExchangesEnterEvents(t *testing.T) {
	s := startSim(t)

	outA := make(chan []byte, 256)
	idA := clientJoin(s, "A", outA)

	outB := make(chan []byte, 256)
	idB := clientJoin(s, "B", outB)

	// A (already in-world) must be told B entered.
	if !waitFor(t, outA, tagIs(wire.SEnter, idB)) {
		t.Fatal("player A never received Enter for B")
	}
	// B must receive its Welcome and an Enter for A.
	if !waitFor(t, outB, func(b []byte) bool { return b[0] == wire.SWelcome }) {
		t.Fatal("player B never received Welcome")
	}
	if !waitFor(t, outB, tagIs(wire.SEnter, idA)) {
		t.Fatal("player B never received Enter for A")
	}
}

// Disconnect removes the player and notifies nearby clients (FR8).
func TestLeaveNotifiesNeighbors(t *testing.T) {
	s := startSim(t)

	outA := make(chan []byte, 256)
	clientJoin(s, "A", outA)
	outB := make(chan []byte, 256)
	idB := clientJoin(s, "B", outB)

	waitFor(t, outA, tagIs(wire.SEnter, idB))
	drain(outA)

	s.Leave(idB)
	if !waitFor(t, outA, tagIs(wire.SLeave, idB)) {
		t.Fatal("A never received Leave for departed player B")
	}
}

// Every player receives a snapshot each tick (FR6). After two players join,
// snapshots should include both entities.
func TestSnapshotIncludesVisiblePlayers(t *testing.T) {
	s := startSim(t)

	outA := make(chan []byte, 256)
	idA := clientJoin(s, "A", outA)
	outB := make(chan []byte, 256)
	idB := clientJoin(s, "B", outB)
	_ = idB

	found := waitFor(t, outA, func(b []byte) bool {
		if b[0] != wire.SSnapshot {
			return false
		}
		count := int(binary.LittleEndian.Uint16(b[5:]))
		ids := map[uint32]bool{}
		off := 7
		for i := 0; i < count; i++ {
			ids[binary.LittleEndian.Uint32(b[off:])] = true
			off += 8
		}
		return ids[idA] && ids[idB]
	})
	if !found {
		t.Fatal("snapshot never contained both co-located players")
	}
}

func TestPaintBroadcastsAndReplaysSharedTileState(t *testing.T) {
	s := startSim(t)

	outA := make(chan []byte, 256)
	idA := clientJoin(s, "A", outA)
	outB := make(chan []byte, 256)
	clientJoin(s, "B", outB)
	drain(outA)
	drain(outB)

	s.Paint(idA)
	wantPaint := paintIs(2048, 2048, colorFor(idA), idA)
	if !waitFor(t, outA, wantPaint) {
		t.Fatal("painter never received shared paint update")
	}
	if !waitFor(t, outB, wantPaint) {
		t.Fatal("observer never received shared paint update")
	}

	outC := make(chan []byte, 256)
	clientJoin(s, "C", outC)
	if !waitFor(t, outC, wantPaint) {
		t.Fatal("late joiner never received existing painted tile")
	}
}

// Painting persists the tile through the Store so it survives an engine restart
// (FR: space-paint must outlive a reload). The write is async, so poll.
func TestPaintPersistsTileToStore(t *testing.T) {
	store := &fakeStore{}
	s := startSimWithStore(t, store)

	out := make(chan []byte, 256)
	id := clientJoin(s, "A", out)
	s.Paint(id)

	deadline := time.After(2 * time.Second)
	for {
		saved := store.savedPaints()
		if len(saved) > 0 {
			got := saved[0]
			if got.X != 2048 || got.Y != 2048 || got.Color != colorFor(id) || got.Owner != "A" {
				t.Fatalf("persisted tile = %+v, want {2048 2048 %#x A}", got, colorFor(id))
			}
			return
		}
		select {
		case <-deadline:
			t.Fatal("paint was never persisted to the store")
		case <-time.After(10 * time.Millisecond):
		}
	}
}

// On startup the sim replays persisted tiles, so a joiner immediately receives
// them just like a tile painted live before they connected.
func TestPaintedTilesRestoredFromStoreOnStartup(t *testing.T) {
	store := &fakeStore{preload: []SavedTile{{X: 2048, Y: 2048, Color: 0x123456, Owner: "ghost"}}}
	s := startSimWithStore(t, store)

	out := make(chan []byte, 256)
	clientJoin(s, "A", out)

	// ownerID 0: restored tiles have no live owner.
	if !waitFor(t, out, paintIs(2048, 2048, 0x123456, 0)) {
		t.Fatal("joiner never received the restored painted tile")
	}
}

func TestPaintedTileEntryEmitsExactlyOneShake(t *testing.T) {
	s := startSim(t)

	outA := make(chan []byte, 256)
	idA := clientJoin(s, "A", outA)
	outB := make(chan []byte, 256)
	idB := clientJoin(s, "B", outB)
	drain(outA)
	drain(outB)

	s.Paint(idA)
	if !waitFor(t, outB, paintIs(2048, 2048, colorFor(idA), idA)) {
		t.Fatal("observer never received paint before shake check")
	}
	drain(outA)
	drain(outB)

	s.Input(idB, 2176, 2048)
	s.Ping(idB, 1)
	if shakes := countShakesUntilPong(t, outB, idB, 1); shakes != 0 {
		t.Fatalf("moving off painted tile emitted %d shakes, want 0", shakes)
	}
	drain(outA)
	drain(outB)

	s.Input(idB, 2048, 2048)
	s.Ping(idB, 2)
	if shakes := countShakesUntilPong(t, outB, idB, 2); shakes != 1 {
		t.Fatalf("entering another player's painted tile emitted %d shakes, want 1", shakes)
	}
	if !waitFor(t, outA, tagIs(wire.SShake, idB)) {
		t.Fatal("other observer never received entering player's shake")
	}
	drain(outA)
	drain(outB)

	s.Input(idB, 2048, 2048)
	s.Ping(idB, 3)
	if shakes := countShakesUntilPong(t, outB, idB, 3); shakes != 0 {
		t.Fatalf("standing still on painted tile emitted %d extra shakes, want 0", shakes)
	}

	s.Input(idA, 2176, 2048)
	s.Ping(idA, 4)
	if shakes := countShakesUntilPong(t, outA, idA, 4); shakes != 0 {
		t.Fatalf("painter moving off own tile emitted %d shakes, want 0", shakes)
	}
	s.Input(idA, 2048, 2048)
	s.Ping(idA, 5)
	if shakes := countShakesUntilPong(t, outA, idA, 5); shakes != 0 {
		t.Fatalf("painter re-entering own painted tile emitted %d shakes, want 0", shakes)
	}
}

// Regression for issue #55 follow-up: once the persisted painted world grows
// past the connection's send buffer (64), the join burst — Welcome followed by
// one Paint per persisted tile — used to be streamed through the lossy
// drop-oldest channel before any writer drained it. The oldest frame (Welcome)
// was evicted, so the client rendered the flood of tiles but never learned its
// id, leaving input (including Space-to-paint) permanently dead. The joining
// player's initial state must be delivered reliably regardless of tile count.
func TestJoinDeliversWelcomeUnderTileFlood(t *testing.T) {
	var preload []SavedTile
	for i := 0; i < 200; i++ { // well past the 64-frame send buffer
		x := int16((i % 32) * int(PaintTileSize))
		y := int16((i / 32) * int(PaintTileSize))
		preload = append(preload, SavedTile{X: x, Y: y, Color: 0x010203, Owner: "ghost"})
	}
	store := &fakeStore{preload: preload}
	s := startSimWithStore(t, store)

	out := make(chan []byte, 64) // same capacity as the production server conn
	id, initial := s.Join("A", out)
	if id == 0 {
		t.Fatal("join returned id 0")
	}

	gotWelcome := false
	for _, b := range initial {
		if len(b) > 0 && b[0] == wire.SWelcome {
			gotWelcome = true
			break
		}
	}
	if !gotWelcome {
		t.Fatal("Welcome missing from initial join delivery — client never learns its id, paint stays dead")
	}
}
