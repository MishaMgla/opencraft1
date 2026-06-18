package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strings"
	"syscall"
	"time"

	"opencraft1/internal/server"
	"opencraft1/internal/store"
	"opencraft1/internal/world"
)

var (
	commitSHA      = "unknown"
	buildTimestamp = ""
)

func main() {
	// SIGTERM is what Railway/Docker send to stop the container; catching it (not
	// just SIGINT) is what lets the sim run its graceful shutdown flush on deploys.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Persistence is opt-in: with DATABASE_URL set (Supabase direct connection),
	// player positions survive restarts; without it the engine runs in-memory
	// only, keeping local dev and tests zero-config.
	var st world.Store
	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		pg, err := store.NewPostgres(ctx, dsn)
		if err != nil {
			log.Fatalf("connect DATABASE_URL: %v", err)
		}
		defer pg.Close()
		st = pg
		log.Println("persistence: postgres")
	} else {
		log.Println("persistence: disabled (DATABASE_URL unset)")
	}

	sim := world.NewSim(st)
	go sim.Run(ctx)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port

	httpSrv := &http.Server{Addr: addr, Handler: server.New(sim, versionInfo()).Handler()}
	go func() {
		log.Printf("listening on %s", addr)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")
	httpSrv.Close()

	// Wait for the sim's synchronous shutdown flush before returning — the
	// deferred pg.Close() must not tear down the pool mid-flush.
	select {
	case <-sim.Done():
	case <-time.After(12 * time.Second):
		log.Println("shutdown flush timed out")
	}
}

func versionInfo() server.BuildInfo {
	sha := strings.TrimSpace(commitSHA)
	if sha == "" || sha == "unknown" {
		sha = vcsRevision()
	}
	if sha == "" {
		sha = "unknown"
	}

	timestamp := strings.TrimSpace(buildTimestamp)
	if timestamp == "" || timestamp == "unknown" {
		timestamp = executableTimestamp()
	}

	return server.BuildInfo{
		CommitSHA:      sha,
		BuildTimestamp: timestamp,
	}
}

func vcsRevision() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return ""
	}
	for _, setting := range info.Settings {
		if setting.Key == "vcs.revision" {
			return setting.Value
		}
	}
	return ""
}

func executableTimestamp() string {
	path, err := os.Executable()
	if err == nil {
		if st, err := os.Stat(path); err == nil {
			return st.ModTime().UTC().Format(time.RFC3339)
		}
	}
	return time.Now().UTC().Format(time.RFC3339)
}
