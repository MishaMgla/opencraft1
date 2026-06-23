// Package wire is the binary protocol shared by server and client.
// All multi-byte integers are little-endian. Positions are int16 world units.
package wire

import "encoding/binary"

// Message type tags (byte 0 of every frame).
const (
	CHello = 0x01 // client -> server
	CInput = 0x02
	CPing  = 0x03
	CPaint = 0x04
	CUlt   = 0x05
	CJump  = 0x06

	SWelcome  = 0x81 // server -> client
	SSnapshot = 0x82
	SEnter    = 0x83
	SLeave    = 0x84
	SPong     = 0x85
	SPaint    = 0x86
	SShake    = 0x87
	SPlayer   = 0x88
	SJump     = 0x89
)

const (
	RolePulse byte = 1
	RoleCross byte = 2
	RoleTrail byte = 3
)

// Ent is a minimal entity record carried in snapshots.
type Ent struct {
	ID   uint32
	X, Y int16
}

// EncodeWelcome carries the player's assigned id, their spawn position (x, y)
// — which is the restored position for a returning player, or world center for
// a new one — and the world bounds. The client must adopt x, y before it starts
// streaming input, else its first frames would overwrite the restored position.
func EncodeWelcome(id uint32, x, y, minX, minY, maxX, maxY int16) []byte {
	b := make([]byte, 1+4+2+2+8)
	b[0] = SWelcome
	binary.LittleEndian.PutUint32(b[1:], id)
	binary.LittleEndian.PutUint16(b[5:], uint16(x))
	binary.LittleEndian.PutUint16(b[7:], uint16(y))
	binary.LittleEndian.PutUint16(b[9:], uint16(minX))
	binary.LittleEndian.PutUint16(b[11:], uint16(minY))
	binary.LittleEndian.PutUint16(b[13:], uint16(maxX))
	binary.LittleEndian.PutUint16(b[15:], uint16(maxY))
	return b
}

func EncodeSnapshot(tick uint32, ents []Ent) []byte {
	b := make([]byte, 1+4+2+len(ents)*8)
	b[0] = SSnapshot
	binary.LittleEndian.PutUint32(b[1:], tick)
	binary.LittleEndian.PutUint16(b[5:], uint16(len(ents)))
	off := 7
	for _, e := range ents {
		binary.LittleEndian.PutUint32(b[off:], e.ID)
		binary.LittleEndian.PutUint16(b[off+4:], uint16(e.X))
		binary.LittleEndian.PutUint16(b[off+6:], uint16(e.Y))
		off += 8
	}
	return b
}

func EncodeEnter(id uint32, x, y int16, color uint32, name string) []byte {
	n := []byte(name)
	if len(n) > 255 {
		n = n[:255]
	}
	b := make([]byte, 1+4+2+2+4+1+len(n))
	b[0] = SEnter
	binary.LittleEndian.PutUint32(b[1:], id)
	binary.LittleEndian.PutUint16(b[5:], uint16(x))
	binary.LittleEndian.PutUint16(b[7:], uint16(y))
	binary.LittleEndian.PutUint32(b[9:], color)
	b[13] = byte(len(n))
	copy(b[14:], n)
	return b
}

func EncodeLeave(id uint32) []byte {
	b := make([]byte, 1+4)
	b[0] = SLeave
	binary.LittleEndian.PutUint32(b[1:], id)
	return b
}

func EncodePong(t uint32) []byte {
	b := make([]byte, 1+4)
	b[0] = SPong
	binary.LittleEndian.PutUint32(b[1:], t)
	return b
}

func EncodePaint(x, y int16, color, ownerID uint32) []byte {
	b := make([]byte, 1+2+2+4+4)
	b[0] = SPaint
	binary.LittleEndian.PutUint16(b[1:], uint16(x))
	binary.LittleEndian.PutUint16(b[3:], uint16(y))
	binary.LittleEndian.PutUint32(b[5:], color)
	binary.LittleEndian.PutUint32(b[9:], ownerID)
	return b
}

func EncodeShake(id uint32) []byte {
	b := make([]byte, 1+4)
	b[0] = SShake
	binary.LittleEndian.PutUint32(b[1:], id)
	return b
}

func EncodeJump(id uint32) []byte {
	b := make([]byte, 1+4)
	b[0] = SJump
	binary.LittleEndian.PutUint32(b[1:], id)
	return b
}

func EncodePlayer(id uint32, role byte, charge byte, ready bool, name string) []byte {
	n := []byte(name)
	if len(n) > 255 {
		n = n[:255]
	}
	b := make([]byte, 1+4+1+1+1+1+len(n))
	b[0] = SPlayer
	binary.LittleEndian.PutUint32(b[1:], id)
	b[5] = role
	b[6] = charge
	if ready {
		b[7] = 1
	}
	b[8] = byte(len(n))
	copy(b[9:], n)
	return b
}

// ClientMsg is a decoded client->server frame. Only fields relevant to Type are set.
type ClientMsg struct {
	Type byte
	Name string // CHello
	Role byte   // CHello
	X, Y int16  // CInput
	T    uint32 // CPing
}

// ParseClient decodes one client frame. Returns ok=false on malformed input.
func ParseClient(b []byte) (ClientMsg, bool) {
	if len(b) < 1 {
		return ClientMsg{}, false
	}
	switch b[0] {
	case CHello:
		if len(b) < 2 {
			return ClientMsg{}, false
		}
		nlen := int(b[1])
		if len(b) < 2+nlen {
			return ClientMsg{}, false
		}
		msg := ClientMsg{Type: CHello, Name: string(b[2 : 2+nlen])}
		if len(b) >= 2+nlen+1 {
			msg.Role = b[2+nlen]
		}
		return msg, true
	case CInput:
		if len(b) < 5 {
			return ClientMsg{}, false
		}
		x := int16(binary.LittleEndian.Uint16(b[1:]))
		y := int16(binary.LittleEndian.Uint16(b[3:]))
		return ClientMsg{Type: CInput, X: x, Y: y}, true
	case CPing:
		if len(b) < 5 {
			return ClientMsg{}, false
		}
		return ClientMsg{Type: CPing, T: binary.LittleEndian.Uint32(b[1:])}, true
	case CPaint:
		return ClientMsg{Type: CPaint}, true
	case CUlt:
		return ClientMsg{Type: CUlt}, true
	case CJump:
		return ClientMsg{Type: CJump}, true
	}
	return ClientMsg{}, false
}
