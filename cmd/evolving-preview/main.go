// evolving-preview serves the evolving world, including production.
// It requires its dedicated database and never reads the legacy DATABASE_URL.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"opencraft1/internal/server"
	"opencraft1/internal/store"
	"opencraft1/internal/world"
)

func main() {
	defaultListen := "127.0.0.1:8766"
	publicOrigin := os.Getenv("PREVIEW_PUBLIC_ORIGIN")
	var publicHost string
	if publicOrigin != "" {
		u, err := url.Parse(publicOrigin)
		if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
			log.Fatal("PREVIEW_PUBLIC_ORIGIN must be an exact HTTPS origin")
		}
		if os.Getenv("PREVIEW_DATABASE_URL") == "" {
			log.Fatal("hosted world requires a dedicated database")
		}
		publicHost = u.Host
	}
	if port := os.Getenv("PORT"); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 || publicOrigin == "" {
			log.Fatal("PORT requires valid hosted preview configuration")
		}
		defaultListen = "0.0.0.0:" + port
	}
	listen := flag.String("listen", defaultListen, "preview listen address")
	flag.Parse()
	for _, path := range []string{"web/evolving/index.html", "web/src/evolving/main.js", "web/src/net.js", "web/src/wire.js", "web/node_modules/three/build/three.module.js", "web/node_modules/three/build/three.core.js"} {
		if _, err := os.Stat(path); err != nil {
			log.Fatalf("missing %s; run npm ci and npm run build in web/ first", path)
		}
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	sim := world.NewEmptyPreview()
	go sim.Run(ctx)
	transport := server.New(sim, server.BuildInfo{CommitSHA: "isolated-preview"}).Handler()
	persistent := false
	if dsn := os.Getenv("PREVIEW_DATABASE_URL"); dsn != "" {
		setup, cancel := context.WithTimeout(ctx, 10*time.Second)
		db, err := store.OpenPreview(setup, dsn, os.Getenv("PREVIEW_DATABASE_HOST"))
		cancel()
		if err != nil {
			log.Fatal(err)
		}
		defer db.Close()
		persistentServer := server.NewPersistentPreview(sim, db, publicOrigin)
		defer persistentServer.ClosePreview()
		transport = persistentServer.Handler()
		persistent = true
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("recipes") != "2" {
			http.Error(w, "reload to update character recipes", http.StatusUpgradeRequired)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" || publicOrigin != "" {
			u, err := url.Parse(origin)
			if err != nil || u.Host != r.Host || (u.Scheme != "http" && u.Scheme != "https") || (publicOrigin != "" && origin != publicOrigin) {
				http.Error(w, "same-origin preview only", http.StatusForbidden)
				return
			}
		}
		transport.ServeHTTP(w, r)
	})
	mux.Handle("GET /healthz", transport)
	if persistent {
		mux.Handle("/evolving-api/", transport)
	}
	mux.HandleFunc("GET /preview-info", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"mode": "evolving-preview", "persistent": persistent, "apiVersion": 2})
	})
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "web/evolving/index.html")
	})
	// Whitelist assets; never expose the repository or arbitrary node_modules.
	mux.Handle("GET /evolving/", http.StripPrefix("/evolving/", http.FileServer(http.Dir("web/evolving"))))
	mux.Handle("GET /src/evolving/", http.StripPrefix("/src/evolving/", http.FileServer(http.Dir("web/src/evolving"))))
	for route, path := range map[string]string{
		"/src/net.js": "web/src/net.js", "/src/wire.js": "web/src/wire.js",
		"/preview-vendor/three.module.js": "web/node_modules/three/build/three.module.js",
		"/preview-vendor/three.core.js":   "web/node_modules/three/build/three.core.js",
	} {
		mux.HandleFunc("GET "+route, func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, path) })
	}
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if publicOrigin != "" && !(r.URL.Path == "/healthz" && r.Method == http.MethodGet) {
			if r.Host == "www."+publicHost && (r.Method == http.MethodGet || r.Method == http.MethodHead) {
				http.Redirect(w, r, publicOrigin+r.URL.RequestURI(), http.StatusTemporaryRedirect)
				return
			}
			if r.Host != publicHost {
				http.Error(w, "unexpected host", http.StatusMisdirectedRequest)
				return
			}
		}
		mux.ServeHTTP(w, r)
	})
	srv := &http.Server{Addr: *listen, Handler: h, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		_ = srv.Close()
	}()
	log.Printf("isolated preview: http://%s (persistent=%t; no evolution yet)", *listen, persistent)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
	<-sim.Done()
}
