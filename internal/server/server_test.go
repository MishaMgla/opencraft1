package server

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"opencraft1/internal/wire"
	"opencraft1/internal/world"
)

// floodStore replays a large painted world at startup and nothing else.
type floodStore struct{ tiles []world.SavedTile }

func (floodStore) Load(context.Context, string) (world.SavedPlayer, bool, error) {
	return world.SavedPlayer{}, false, nil
}
func (floodStore) Save(context.Context, world.SavedPlayer) error    { return nil }
func (floodStore) SavePaint(context.Context, world.SavedTile) error { return nil }
func (f floodStore) LoadPaints(context.Context) ([]world.SavedTile, error) {
	return f.tiles, nil
}

// TestWelcomeSurvivesPersistedTileFlood is the end-to-end guard for the
// issue #55 follow-up regression: a real WebSocket client that joins a world
// whose persisted painted set far exceeds the connection's 64-frame send
// buffer must still receive its Welcome frame. Before the fix the join burst
// (Welcome + one Paint per tile) was streamed through the lossy drop-oldest
// channel before any writer drained it, so the oldest frame — Welcome — was
// evicted and the client never learned its id, leaving Space-to-paint dead.
func TestWelcomeSurvivesPersistedTileFlood(t *testing.T) {
	var tiles []world.SavedTile
	for i := 0; i < 200; i++ { // well past the 64-frame send buffer
		tiles = append(tiles, world.SavedTile{
			X:     int16((i % 32) * 128),
			Y:     int16((i / 32) * 128),
			Color: 0x010203,
			Owner: "ghost",
		})
	}

	sim := world.NewSim(floodStore{tiles: tiles})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go sim.Run(ctx)

	srv := httptest.NewServer(New(sim, BuildInfo{}).Handler())
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	connCtx, connCancel := context.WithTimeout(ctx, 5*time.Second)
	defer connCancel()
	c, _, err := websocket.Dial(connCtx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.CloseNow()

	hello := append([]byte{wire.CHello, byte(len("A"))}, []byte("A")...)
	if err := c.Write(connCtx, websocket.MessageBinary, hello); err != nil {
		t.Fatalf("write hello: %v", err)
	}

	for {
		_, data, err := c.Read(connCtx)
		if err != nil {
			t.Fatalf("never received Welcome under tile flood: %v", err)
		}
		if len(data) > 0 && data[0] == wire.SWelcome {
			return // success: client learned its id despite the flood
		}
	}
}
