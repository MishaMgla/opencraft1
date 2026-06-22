package world

import "context"

// SavedPlayer is the persisted slice of a player's state — everything needed to
// restore them on a later join. The runtime id is deliberately absent: it is
// reassigned every join, so name is the only stable identity (no auth yet).
type SavedPlayer struct {
	Name  string
	X, Y  int16
	Color uint32
}

// SavedTile is a persisted painted tile — everything needed to replay the
// painted world after an engine restart. X/Y are tile-aligned world coords (the
// rendered tile center). Owner is the painter's name: the runtime ownerID isn't
// persisted because ids are reassigned every restart, so it carries no meaning
// across one.
type SavedTile struct {
	X, Y  int16
	Color uint32
	Owner string
}

// Store persists player state across engine restarts. A nil Store disables
// persistence entirely (local dev, tests): players spawn at center, get a
// derived color, and nothing is written. Implementations must be safe for
// concurrent use — Load runs on connection goroutines, Save on a goroutine
// the Sim spawns so the tick loop never blocks on I/O.
type Store interface {
	// Load returns the saved state for name. ok is false (with nil error) when
	// no row exists for that name.
	Load(ctx context.Context, name string) (sp SavedPlayer, ok bool, err error)
	// Save upserts the player's current state, keyed on name.
	Save(ctx context.Context, sp SavedPlayer) error
	// SavePaint upserts one painted tile, keyed on its rendered center (x, y).
	SavePaint(ctx context.Context, t SavedTile) error
	// LoadPaints returns every persisted painted tile, for replay at startup.
	LoadPaints(ctx context.Context) ([]SavedTile, error)
}
