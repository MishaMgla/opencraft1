package world

import (
	"context"
	"encoding/binary"
	"testing"
	"time"

	"opencraft1/internal/wire"
)

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

func frameID(b []byte) uint32 { return binary.LittleEndian.Uint32(b[1:]) }

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

// On join, the newcomer and every player already in its area of interest must
// exchange Enter events (FR2/FR6). Players spawn at world center, so two joiners
// start co-located and mutually visible.
func TestJoinExchangesEnterEvents(t *testing.T) {
	s := startSim(t)

	outA := make(chan []byte, 256)
	idA := s.Join("A", outA)

	outB := make(chan []byte, 256)
	idB := s.Join("B", outB)

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
	s.Join("A", outA)
	outB := make(chan []byte, 256)
	idB := s.Join("B", outB)

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
	idA := s.Join("A", outA)
	outB := make(chan []byte, 256)
	idB := s.Join("B", outB)
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
