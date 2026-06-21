package wire

import (
	"bytes"
	"encoding/binary"
	"strings"
	"testing"
)

// ParseClient is the only decoder that lives in Go (the server decodes client
// frames; the JS client decodes server frames). Exercise every branch,
// including each truncation guard, since a short read here is attacker-reachable
// over the websocket.
func TestParseClient(t *testing.T) {
	tests := []struct {
		name string
		in   []byte
		want ClientMsg
		ok   bool
	}{
		{"empty", []byte{}, ClientMsg{}, false},
		{"unknown tag", []byte{0x7f}, ClientMsg{}, false},

		{"hello ok", append([]byte{CHello, 3}, []byte("Bob")...),
			ClientMsg{Type: CHello, Name: "Bob"}, true},
		{"hello empty name", []byte{CHello, 0}, ClientMsg{Type: CHello, Name: ""}, true},
		{"hello missing len byte", []byte{CHello}, ClientMsg{}, false},
		{"hello truncated name", []byte{CHello, 5, 'a', 'b'}, ClientMsg{}, false},

		{"input ok", []byte{CInput, 0x2e, 0xfb, 0x09, 0x03}, // x=-1234, y=777
			ClientMsg{Type: CInput, X: -1234, Y: 777}, true},
		{"input truncated", []byte{CInput, 0x01, 0x02, 0x03}, ClientMsg{}, false},

		{"ping ok", []byte{CPing, 0x40, 0xe2, 0x01, 0x00}, // t=123456
			ClientMsg{Type: CPing, T: 123456}, true},
		{"ping truncated", []byte{CPing, 0x01}, ClientMsg{}, false},

		{"paint ok", []byte{CPaint}, ClientMsg{Type: CPaint}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := ParseClient(tt.in)
			if ok != tt.ok {
				t.Fatalf("ok = %v, want %v", ok, tt.ok)
			}
			if ok && got != tt.want {
				t.Fatalf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}

// EncodeEnter must cap names at 255 bytes (the length prefix is a single byte)
// and never panic on an oversized name.
func TestEncodeEnterClampsName(t *testing.T) {
	long := strings.Repeat("x", 300)
	b := EncodeEnter(1, 0, 0, 0, long)
	if b[0] != SEnter {
		t.Fatalf("tag = %#x, want %#x", b[0], SEnter)
	}
	if got := int(b[13]); got != 255 {
		t.Fatalf("name length prefix = %d, want 255", got)
	}
	if len(b) != 14+255 {
		t.Fatalf("frame len = %d, want %d", len(b), 14+255)
	}
}

// Encoders set the right tag byte and exact frame length. Exact-byte layout is
// pinned by the cross-language golden fixtures (see fixtures_test.go).
func TestEncoderTagsAndLengths(t *testing.T) {
	if b := EncodeWelcome(1, 0, 0, 0, 0, 1, 1); b[0] != SWelcome || len(b) != 17 {
		t.Errorf("welcome: tag=%#x len=%d", b[0], len(b))
	}
	if b := EncodeSnapshot(0, []Ent{{1, 2, 3}, {4, 5, 6}}); b[0] != SSnapshot || len(b) != 7+2*8 {
		t.Errorf("snapshot: tag=%#x len=%d", b[0], len(b))
	}
	if b := EncodeLeave(1); b[0] != SLeave || len(b) != 5 {
		t.Errorf("leave: tag=%#x len=%d", b[0], len(b))
	}
	if b := EncodePong(9); b[0] != SPong || len(b) != 5 {
		t.Errorf("pong: tag=%#x len=%d", b[0], len(b))
	}
	if b := EncodePaint(1, 2, 3, 4); b[0] != SPaint || len(b) != 13 {
		t.Errorf("paint: tag=%#x len=%d", b[0], len(b))
	}
	if b := EncodeShake(1); b[0] != SShake || len(b) != 5 {
		t.Errorf("shake: tag=%#x len=%d", b[0], len(b))
	}
}

// Snapshot carries a uint16 entity count followed by that many 8-byte records;
// the count must match what was packed so the JS reader walks the right span.
func TestSnapshotCountMatchesEntities(t *testing.T) {
	ents := []Ent{{1, 10, 20}, {2, -5, 4095}, {3, 0, 0}}
	b := EncodeSnapshot(42, ents)
	if got := binary.LittleEndian.Uint16(b[5:]); int(got) != len(ents) {
		t.Fatalf("count field = %d, want %d", got, len(ents))
	}
	// The first record should decode back to the first entity.
	off := 7
	if id := binary.LittleEndian.Uint32(b[off:]); id != ents[0].ID {
		t.Fatalf("ent0 id = %d, want %d", id, ents[0].ID)
	}
	x := int16(binary.LittleEndian.Uint16(b[off+4:]))
	y := int16(binary.LittleEndian.Uint16(b[off+6:]))
	if x != ents[0].X || y != ents[0].Y {
		t.Fatalf("ent0 pos = (%d,%d), want (%d,%d)", x, y, ents[0].X, ents[0].Y)
	}
}

// A name with multi-byte UTF-8 must be framed by byte length, not rune count,
// or the JS reader's name slice and the next field will misalign.
func TestEncodeEnterUTF8ByteLength(t *testing.T) {
	b := EncodeEnter(1, 0, 0, 0, "Zoë") // ë is 2 bytes -> 4 bytes total
	if got := int(b[13]); got != 4 {
		t.Fatalf("name byte length = %d, want 4", got)
	}
	if !bytes.Equal(b[14:], []byte("Zoë")) {
		t.Fatalf("name bytes = %q", b[14:])
	}
}
