package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/coder/websocket"

	"opencraft1/internal/wire"
	"opencraft1/internal/world"
)

type Server struct {
	sim        *world.Sim
	buildInfo  BuildInfo
	acceptOpts *websocket.AcceptOptions
}

type healthResponse struct {
	Status string `json:"status"`
}

type BuildInfo struct {
	CommitSHA      string `json:"commit_sha"`
	BuildTimestamp string `json:"build_timestamp"`
}

func New(sim *world.Sim, buildInfo BuildInfo) *Server {
	return &Server{sim: sim, buildInfo: buildInfo, acceptOpts: acceptOptions()}
}

// acceptOptions builds the WebSocket accept policy from ALLOWED_ORIGINS.
// When set (comma-separated host patterns, e.g. "opencraft1.vercel.app,*.vercel.app"),
// only those origins may open a socket. When empty — the local dev case where the
// engine serves the client itself — all origins are allowed.
func acceptOptions() *websocket.AcceptOptions {
	raw := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	if raw == "" {
		return &websocket.AcceptOptions{InsecureSkipVerify: true}
	}
	var patterns []string
	for _, p := range strings.Split(raw, ",") {
		if p = strings.TrimSpace(p); p != "" {
			patterns = append(patterns, p)
		}
	}
	return &websocket.AcceptOptions{OriginPatterns: patterns}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		body, err := json.Marshal(healthResponse{Status: "ok"})
		if err != nil {
			http.Error(w, "failed to encode health response", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	})
	mux.HandleFunc("/version", s.handleVersion)
	mux.HandleFunc("/ws", s.handleWS)
	// Serve the static client only when web/ is present (local dev). The Railway
	// engine image carries no client assets — the client is served from Vercel —
	// so this is skipped there and "/" 404s harmlessly.
	if _, err := os.Stat("web"); err == nil {
		mux.Handle("/", http.FileServer(http.Dir("web")))
	}
	return mux
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(s.buildInfo)
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, s.acceptOpts)
	if err != nil {
		log.Printf("ws accept: %v", err)
		return
	}
	defer c.CloseNow()
	c.SetReadLimit(4096)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// First frame must be Hello.
	_, data, err := c.Read(ctx)
	if err != nil {
		return
	}
	msg, ok := wire.ParseClient(data)
	if !ok || msg.Type != wire.CHello {
		return
	}

	out := make(chan []byte, 64)
	id, initial := s.sim.JoinWithRole(msg.Name, msg.Role, out)
	defer s.sim.Leave(id)

	// Deliver the joining player's initial state (Welcome + painted world +
	// present players) reliably, before the lossy writer starts. These frames
	// must not pass through the drop-oldest out channel: losing the Welcome
	// frame leaves the client without its id and disables all input (the bug
	// behind a painted world large enough to overflow out's 64-frame buffer).
	// Writing here blocks only this connection's goroutine on its own socket.
	for _, b := range initial {
		if err := c.Write(ctx, websocket.MessageBinary, b); err != nil {
			return
		}
	}

	// Writer goroutine: drain ongoing frames -> socket until the connection ends.
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case b := <-out:
				if err := c.Write(ctx, websocket.MessageBinary, b); err != nil {
					cancel()
					return
				}
			}
		}
	}()

	// Reader loop.
	for {
		_, data, err := c.Read(ctx)
		if err != nil {
			return
		}
		m, ok := wire.ParseClient(data)
		if !ok {
			continue
		}
		switch m.Type {
		case wire.CInput:
			s.sim.Input(id, m.X, m.Y)
		case wire.CPaint:
			s.sim.Paint(id)
		case wire.CUlt:
			s.sim.Ult(id)
		case wire.CJump:
			s.sim.Jump(id)
		case wire.CPing:
			s.sim.Ping(id, m.T)
		}
	}
}
