// Package store implements world.Store against PostgreSQL (Supabase) using
// pgx. It is the engine's only persistence dependency; when DATABASE_URL is
// unset the engine runs without it and player state is in-memory only.
package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"opencraft/internal/world"
)

// Postgres persists player state in the public.player_state table. The pool is
// safe for concurrent use, matching world.Store's contract.
type Postgres struct {
	pool *pgxpool.Pool
}

// NewPostgres connects to dsn (a libpq connection string / URI) and verifies
// the connection with a ping. Use Supabase's direct connection string (port
// 5432) — the engine is long-lived, so a persistent pool fits.
func NewPostgres(ctx context.Context, dsn string) (*Postgres, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("pgxpool.New: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &Postgres{pool: pool}, nil
}

// Close releases the connection pool.
func (p *Postgres) Close() { p.pool.Close() }

// Load returns the saved state for name, or ok=false when no row exists.
func (p *Postgres) Load(ctx context.Context, name string) (world.SavedPlayer, bool, error) {
	sp := world.SavedPlayer{Name: name}
	var color int32 // color is stored as int4; carry uint32 RGB through it
	err := p.pool.QueryRow(ctx,
		`select x, y, color from public.player_state where name = $1`, name,
	).Scan(&sp.X, &sp.Y, &color)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return world.SavedPlayer{}, false, nil
	case err != nil:
		return world.SavedPlayer{}, false, err
	}
	sp.Color = uint32(color)
	return sp, true, nil
}

// Save upserts the player's current state, refreshing last_seen.
func (p *Postgres) Save(ctx context.Context, sp world.SavedPlayer) error {
	_, err := p.pool.Exec(ctx,
		`insert into public.player_state (name, x, y, color, last_seen)
		 values ($1, $2, $3, $4, now())
		 on conflict (name) do update
		   set x = excluded.x, y = excluded.y, color = excluded.color, last_seen = now()`,
		sp.Name, sp.X, sp.Y, int32(sp.Color))
	return err
}
