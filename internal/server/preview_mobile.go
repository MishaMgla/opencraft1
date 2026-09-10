package server

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"
)

const mobileTicketPrefix = "opencraft-guest."
const mobileTicketLimit = 1024

type mobileTicket struct {
	cookie  string
	expires time.Time
}

// Native HTTP owns the persistent HttpOnly cookie. Only a single-use, short
// lived ticket crosses into the WebView socket; neither secret goes in a URL.
func (s *Server) issueMobileTicket(cookie string, now time.Time) (string, bool) {
	s.guestMu.Lock()
	defer s.guestMu.Unlock()
	if s.previewClosing {
		return "", false
	}
	// ponytail: bounded scan, at most 1024 pending tickets and one per guest.
	for key, ticket := range s.mobileTickets {
		if !now.Before(ticket.expires) || ticket.cookie == cookie {
			delete(s.mobileTickets, key)
		}
	}
	if len(s.mobileTickets) >= mobileTicketLimit {
		return "", false
	}
	var bytes [32]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", false
	}
	if s.mobileTickets == nil {
		s.mobileTickets = make(map[string]mobileTicket)
	}
	key := hex.EncodeToString(bytes[:])
	s.mobileTickets[key] = mobileTicket{cookie: cookie, expires: now.Add(30 * time.Second)}
	return key, true
}

func (s *Server) consumeMobileTicket(key string, now time.Time) (string, bool) {
	s.guestMu.Lock()
	defer s.guestMu.Unlock()
	ticket, ok := s.mobileTickets[key]
	delete(s.mobileTickets, key)
	return ticket.cookie, ok && !s.previewClosing && now.Before(ticket.expires)
}

func (s *Server) previewSocketTicket(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct{}
	if !s.previewBody(w, r, &body) {
		return
	}
	if _, ok := s.previewGuest(w, r); !ok {
		return
	}
	cookie, _ := r.Cookie(previewCookie)
	ticket, ok := s.issueMobileTicket(cookie.Value, time.Now())
	if !ok {
		http.Error(w, "socket tickets temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	previewJSON(w, map[string]string{"ticket": ticket})
}

func (s *Server) previewMobileSocket(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if r.URL.Query().Get("recipes") != "2" {
		http.Error(w, "update required", http.StatusUpgradeRequired)
		return
	}
	origin := r.Header.Get("Origin")
	if origin != "capacitor://localhost" && origin != "https://localhost" {
		http.Error(w, "native origin required", http.StatusForbidden)
		return
	}
	protocol := r.Header.Get("Sec-WebSocket-Protocol")
	key := strings.TrimPrefix(protocol, mobileTicketPrefix)
	if !strings.HasPrefix(protocol, mobileTicketPrefix) || len(key) != 64 {
		http.Error(w, "socket ticket required", http.StatusUnauthorized)
		return
	}
	cookie, ok := s.consumeMobileTicket(key, time.Now())
	if !ok {
		http.Error(w, "socket ticket expired or used", http.StatusUnauthorized)
		return
	}
	// Reuse the regular guest authentication, reservation and second DB read.
	// The cookie is checked again, so an expired/revoked guest cannot use a ticket.
	r = r.Clone(r.Context())
	r.Header.Set("Cookie", (&http.Cookie{Name: previewCookie, Value: cookie}).String())
	r.Header.Del("Sec-WebSocket-Protocol")
	// Origin was checked above. Preserve the regular socket's accept policy;
	// this internal handoff is same-origin only after consuming a valid ticket.
	expected := s.previewOrigin
	if expected == "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		expected = scheme + "://" + r.Host
	}
	r.Header.Set("Origin", expected)
	s.handleWS(w, r)
}
