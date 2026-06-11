package server

import (
	"context"
	"log"
	"net/http"

	"github.com/coder/websocket"

	"opencraft/internal/wire"
	"opencraft/internal/world"
)

type Server struct {
	sim *world.Sim
}

func New(sim *world.Sim) *Server { return &Server{sim: sim} }

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWS)
	mux.Handle("/", http.FileServer(http.Dir("web")))
	return mux
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// MVP/local dev: allow any origin. Tighten with OriginPatterns for prod.
		InsecureSkipVerify: true,
	})
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
	id := s.sim.Join(msg.Name, out)
	defer s.sim.Leave(id)

	// Writer goroutine: drain out -> socket until the connection ends.
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
		case wire.CPing:
			s.sim.Ping(id, m.T)
		}
	}
}
