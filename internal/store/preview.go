package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Preview never implements world.Store: the legacy name-keyed tables are not
// suitable for guest ownership. Only the dedicated preview database is accepted.
type Preview struct{ pool *pgxpool.Pool }

type Guest struct {
	ID                      string `json:"id"`
	Name                    string `json:"name"`
	Seed                    uint32 `json:"seed"`
	AvatarVersion           int    `json:"avatarVersion"`
	AppearanceChoicePending bool   `json:"appearanceChoicePending"`
	X                       int16  `json:"-"`
	Y                       int16  `json:"-"`
	PositionSaved           bool   `json:"-"`
}

type Message struct {
	ID        string    `json:"id"`
	PlayerID  string    `json:"playerId"`
	RequestID string    `json:"requestId"`
	Name      string    `json:"name"`
	Text      string    `json:"text"`
	CreatedAt time.Time `json:"createdAt"`
}

var ErrConflict = errors.New("request ID already used for different text")
var ErrRateLimit = errors.New("chat rate limit")

func OpenPreview(ctx context.Context, dsn, privateHost string) (*Preview, error) {
	allowedHost := func(host string) bool {
		return previewHost(host) || (privateHost != "" && strings.HasSuffix(privateHost, ".railway.internal") && host == privateHost)
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, errors.New("invalid PREVIEW_DATABASE_URL")
	}
	c := cfg.ConnConfig
	if c.Database != "opencraft_preview" || c.User != "opencraft_preview" || !allowedHost(c.Host) {
		return nil, errors.New("preview requires its dedicated database, role and allowed host")
	}
	for _, fallback := range c.Fallbacks {
		if !allowedHost(fallback.Host) {
			return nil, errors.New("unexpected preview database fallback refused")
		}
	}
	cfg.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, errors.New("cannot create preview pool")
	}
	p := &Preview{pool: pool}
	// Additive avatar-v2 migration. Keep legacy defaults for an old server still
	// draining during deployment; new code explicitly writes v2/fixed on insert.
	_, err = pool.Exec(ctx, `
		CREATE SCHEMA IF NOT EXISTS evolving_preview;
		CREATE TABLE IF NOT EXISTS evolving_preview.guest (
		 id text PRIMARY KEY, token_hash bytea UNIQUE NOT NULL,
		 expires_at timestamptz NOT NULL, name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 24),
		 seed bigint NOT NULL CHECK(seed BETWEEN 0 AND 4294967295),
		 x smallint NOT NULL DEFAULT 2048 CHECK(x BETWEEN 0 AND 8191),
		 y smallint NOT NULL DEFAULT 2048 CHECK(y BETWEEN 0 AND 8191), position_saved boolean NOT NULL DEFAULT false
		);
		CREATE TABLE IF NOT EXISTS evolving_preview.message (
		 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
		 player_id text NOT NULL REFERENCES evolving_preview.guest(id), request_id text NOT NULL,
		 name text NOT NULL, body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 200),
		 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(player_id, request_id)
		);
		CREATE INDEX IF NOT EXISTS message_player_recent ON evolving_preview.message(player_id, id DESC);
		ALTER TABLE evolving_preview.guest ADD COLUMN IF NOT EXISTS avatar_version smallint NOT NULL DEFAULT 1 CHECK(avatar_version IN (1,2));
		ALTER TABLE evolving_preview.guest ADD COLUMN IF NOT EXISTS appearance_choice_pending boolean NOT NULL DEFAULT true;
		ALTER TABLE evolving_preview.guest ALTER COLUMN avatar_version SET DEFAULT 1;
		ALTER TABLE evolving_preview.guest ALTER COLUMN appearance_choice_pending SET DEFAULT true;
	`)
	if err != nil {
		pool.Close()
		return nil, errors.New("cannot initialize isolated preview schema")
	}
	return p, nil
}

func previewHost(host string) bool {
	return host == "127.0.0.1" || host == "::1" || host == "localhost"
}
func (p *Preview) Close() { p.pool.Close() }

func (p *Preview) Guest(ctx context.Context, token string) (Guest, error) {
	var g Guest
	b, err := hex.DecodeString(token)
	if err != nil || len(b) != 32 {
		return g, pgx.ErrNoRows
	}
	hash := sha256.Sum256(b)
	err = p.pool.QueryRow(ctx, `SELECT id,name,seed,x,y,position_saved,avatar_version,appearance_choice_pending FROM evolving_preview.guest
	 WHERE token_hash=$1 AND expires_at>now()`, hash[:]).Scan(&g.ID, &g.Name, &g.Seed, &g.X, &g.Y, &g.PositionSaved, &g.AvatarVersion, &g.AppearanceChoicePending)
	return g, err
}

func (p *Preview) CreateGuest(ctx context.Context, name string, seed uint32) (Guest, string, error) {
	var token [32]byte
	var id [16]byte
	if _, err := rand.Read(token[:]); err != nil {
		return Guest{}, "", err
	}
	if _, err := rand.Read(id[:]); err != nil {
		return Guest{}, "", err
	}
	hash := sha256.Sum256(token[:])
	g := Guest{ID: hex.EncodeToString(id[:]), Name: name, Seed: seed, AvatarVersion: 2, X: 2048, Y: 2048}
	_, err := p.pool.Exec(ctx, `INSERT INTO evolving_preview.guest(id,token_hash,expires_at,name,seed,avatar_version,appearance_choice_pending)
	 VALUES($1,$2,now()+interval '30 days',$3,$4,2,false)`, g.ID, hash[:], name, seed)
	return g, hex.EncodeToString(token[:]), err
}

// ChooseAppearance consumes the one-time choice in the same row write as the
// new recipe. The WHERE guard also protects concurrent requests across servers.
func (p *Preview) ChooseAppearance(ctx context.Context, g Guest, seed uint32, keep bool) (Guest, error) {
	version := 2
	if keep {
		seed, version = g.Seed, g.AvatarVersion
	}
	err := p.pool.QueryRow(ctx, `UPDATE evolving_preview.guest
	 SET seed=$2,avatar_version=$3,appearance_choice_pending=false
	 WHERE id=$1 AND appearance_choice_pending AND expires_at>now()
	 RETURNING seed,avatar_version,appearance_choice_pending`, g.ID, seed, version).
		Scan(&g.Seed, &g.AvatarVersion, &g.AppearanceChoicePending)
	return g, err
}

func (p *Preview) SavePosition(ctx context.Context, id string, x, y int16) error {
	_, err := p.pool.Exec(ctx, `UPDATE evolving_preview.guest SET x=$2,y=$3,position_saved=true WHERE id=$1`, id, x, y)
	return err
}

func (p *Preview) Messages(ctx context.Context, after, before int64) ([]Message, error) {
	// Cursor IDs are strings in JSON, so JavaScript never rounds bigint IDs.
	query := `SELECT id::text,player_id,request_id,name,body,created_at FROM (
	 SELECT * FROM evolving_preview.message WHERE ($1::bigint=0 OR id<$1) ORDER BY id DESC LIMIT 100
	) page ORDER BY page.id`
	arg := before
	if after > 0 {
		query = `SELECT id::text,player_id,request_id,name,body,created_at FROM evolving_preview.message m WHERE id>$1 ORDER BY m.id LIMIT 100`
		arg = after
	}
	rows, err := p.pool.Query(ctx, query, arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := make([]Message, 0)
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.PlayerID, &m.RequestID, &m.Name, &m.Text, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

func (p *Preview) SaveMessage(ctx context.Context, g Guest, requestID, text string) (Message, error) {
	var m Message
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return m, err
	}
	defer tx.Rollback(context.Background())
	// ponytail: one short chat-write lock gives commit-ordered cursors. Partition
	// only if this single world's measured chat throughput needs it.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(18700421)`); err != nil {
		return m, err
	}
	err = tx.QueryRow(ctx, `SELECT id::text,player_id,request_id,name,body,created_at FROM evolving_preview.message
	 WHERE player_id=$1 AND request_id=$2`, g.ID, requestID).Scan(&m.ID, &m.PlayerID, &m.RequestID, &m.Name, &m.Text, &m.CreatedAt)
	if err == nil {
		if m.Text != text {
			return m, ErrConflict
		}
		return m, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return m, err
	}
	var throttled bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM evolving_preview.message WHERE player_id=$1 AND created_at>clock_timestamp()-interval '500 milliseconds')`, g.ID).Scan(&throttled)
	if err != nil {
		return m, err
	}
	if throttled {
		return m, ErrRateLimit
	}
	m = Message{PlayerID: g.ID, RequestID: requestID, Name: g.Name, Text: text}
	err = tx.QueryRow(ctx, `INSERT INTO evolving_preview.message(player_id,request_id,name,body) VALUES($1,$2,$3,$4)
	 RETURNING id::text,created_at`, g.ID, requestID, g.Name, text).Scan(&m.ID, &m.CreatedAt)
	if err != nil {
		return m, fmt.Errorf("save preview message: %w", err)
	}
	return m, tx.Commit(ctx)
}
