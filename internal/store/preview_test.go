package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/url"
	"os"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5"
)

// Run against the dedicated loopback DB via check-evolving-persistence.mjs.
// Leaves named test guests; never drops tables or touches remote databases.
func TestPreviewAppearance(t *testing.T) {
	dsn := os.Getenv("PREVIEW_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("dedicated loopback database not supplied")
	}
	u, err := url.Parse(dsn)
	if err != nil || u.Hostname() != "127.0.0.1" {
		t.Fatal("only loopback database allowed")
	}
	ctx := context.Background()
	p, err := OpenPreview(ctx, dsn, "")
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	// An old binary may finish an entry while the new deployment is starting.
	var oldToken [32]byte
	if _, err := rand.Read(oldToken[:]); err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(oldToken[:])
	if _, err := p.pool.Exec(ctx, `INSERT INTO evolving_preview.guest(id,token_hash,expires_at,name,seed)
	 VALUES($1,$2,now()+interval '1 day','Legacy insert check',321)`, hex.EncodeToString(oldToken[:16]), hash[:]); err != nil {
		t.Fatal(err)
	}
	legacy, err := p.Guest(ctx, hex.EncodeToString(oldToken[:]))
	if err != nil || legacy.AvatarVersion != 1 || !legacy.AppearanceChoicePending || legacy.Seed != 321 {
		t.Fatal("legacy insert changed recipe", err)
	}
	g, token, err := p.CreateGuest(ctx, "Appearance check", 123)
	if err != nil {
		t.Fatal(err)
	}
	if g.AvatarVersion != 2 || g.AppearanceChoicePending {
		t.Fatal("new guest must be fixed to v2")
	}
	if _, err := p.ChooseAppearance(ctx, g, 456, false); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("new guest was allowed to change", err)
	}
	// Simulate an eligible pre-release guest; only this test's new row changes.
	if _, err = p.pool.Exec(ctx, `UPDATE evolving_preview.guest SET avatar_version=1,appearance_choice_pending=true WHERE id=$1`, g.ID); err != nil {
		t.Fatal(err)
	}
	g, err = p.Guest(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	var winners atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func(seed uint32) {
			defer wg.Done()
			_, err := p.ChooseAppearance(ctx, g, seed, false)
			if err == nil {
				winners.Add(1)
			} else if !errors.Is(err, pgx.ErrNoRows) {
				t.Error(err)
			}
		}(uint32(500 + i))
	}
	wg.Wait()
	if winners.Load() != 1 {
		t.Fatal("choice must have exactly one winner", winners.Load())
	}
	fixed, err := p.Guest(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	if fixed.AvatarVersion != 2 || fixed.AppearanceChoicePending || fixed.Seed < 500 || fixed.Seed > 503 {
		t.Fatal("wrong committed choice")
	}
	// Startup migrations must never restore consumed rights or reseed a body.
	restarted, err := OpenPreview(ctx, dsn, "")
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	again, err := restarted.Guest(ctx, token)
	if err != nil || again != fixed {
		t.Fatal("restart changed appearance", err)
	}
	keep, keepToken, err := p.CreateGuest(ctx, "Keep appearance check", 987)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = p.pool.Exec(ctx, `UPDATE evolving_preview.guest SET avatar_version=1,appearance_choice_pending=true WHERE id=$1`, keep.ID); err != nil {
		t.Fatal(err)
	}
	keep, err = p.Guest(ctx, keepToken)
	if err != nil {
		t.Fatal(err)
	}
	kept, err := p.ChooseAppearance(ctx, keep, 0, true)
	if err != nil || kept.Seed != 987 || kept.AvatarVersion != 1 || kept.AppearanceChoicePending {
		t.Fatal("old body not retained", err)
	}
	if _, err := p.ChooseAppearance(ctx, kept, 111, false); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("keep must also consume choice", err)
	}
}
