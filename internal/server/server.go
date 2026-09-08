package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"

	"opencraft1/internal/store"
	"opencraft1/internal/wire"
	"opencraft1/internal/world"
)

type Server struct {
	sim                *world.Sim
	buildInfo          BuildInfo
	acceptOpts         *websocket.AcceptOptions
	preview            *store.Preview
	previewOrigin      string
	guestMu            sync.Mutex
	guests             map[string]bool
	previewStop        chan struct{}
	previewClosing     bool
	previewConnections sync.WaitGroup
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
	if s.preview != nil {
		mux.HandleFunc("/evolving-api/session", s.previewSession)
		mux.HandleFunc("/evolving-api/messages", s.previewMessages)
		mux.HandleFunc("/evolving-api/appearance", s.previewAppearance)
	}
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
	var guest store.Guest
	if s.preview != nil {
		var ok bool
		guest, ok = s.previewGuest(w, r)
		if !ok {
			return
		}
		s.guestMu.Lock()
		if s.previewClosing {
			s.guestMu.Unlock()
			http.Error(w, "preview stopping", http.StatusServiceUnavailable)
			return
		}
		busy := s.guests[guest.ID]
		if !busy {
			s.guests[guest.ID] = true
			s.previewConnections.Add(1)
		}
		s.guestMu.Unlock()
		if busy {
			http.Error(w, "guest already connected", http.StatusConflict)
			return
		}
		defer s.previewConnections.Done()
		defer func() { s.guestMu.Lock(); delete(s.guests, guest.ID); s.guestMu.Unlock() }()
		// A choice may have committed between authentication and reservation.
		refreshed, valid := s.previewGuest(w, r)
		if !valid {
			return
		}
		guest = refreshed
	}
	c, err := websocket.Accept(w, r, s.acceptOpts)
	if err != nil {
		log.Printf("ws accept: %v", err)
		return
	}
	defer c.CloseNow()
	c.SetReadLimit(4096)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	if s.preview != nil {
		go func() {
			select {
			case <-s.previewStop:
				cancel()
			case <-ctx.Done():
			}
		}()
	}

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
	snap := make(chan []byte, 1)
	var id uint32
	var initial [][]byte
	var px, py int16
	if s.preview != nil {
		var saved *world.SavedPlayer
		if guest.PositionSaved {
			saved = &world.SavedPlayer{X: guest.X, Y: guest.Y}
		}
		id, initial = s.sim.JoinPreview(guest.Name, previewCharacter(guest), saved, out, snap)
		// The first frame is Welcome; use its validated spawn, including fresh
		// guests' staggered positions. No database work runs on the sim tick.
		px, py = previewSpawn(initial[0])
		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			if err := s.preview.SavePosition(ctx, guest.ID, px, py); err != nil {
				log.Print("preview position not saved")
			}
		}()
	} else {
		id, initial = s.sim.JoinWithProfile(msg.Name, msg.Role, msg.Character, out, snap)
	}
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
			case b := <-snap:
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
			if s.preview != nil {
				px, py = max(0, min(m.X, world.WorldSize-1)), max(0, min(m.Y, world.WorldSize-1))
			}
			s.sim.Input(id, m.X, m.Y)
		case wire.CPaint:
			s.sim.Paint(id)
		case wire.CUlt:
			s.sim.Ult(id)
		case wire.CJump:
			s.sim.Jump(id)
		case wire.CBomb:
			s.sim.Bomb(id)
		case wire.CChat:
			if s.preview == nil {
				s.sim.Chat(id, m.Text)
			} // durable chat uses the authenticated HTTP path
		case wire.CPing:
			s.sim.Ping(id, m.T)
		case wire.CGrab:
			s.sim.Grab(id, m.CritterID)
		case wire.CHold:
			s.sim.Hold(id, m.X, m.Y)
		case wire.CDrop:
			s.sim.Drop(id, m.X, m.Y)
		}
	}
}
