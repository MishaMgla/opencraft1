package server

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"opencraft1/internal/store"
	"opencraft1/internal/world"
)

const previewCookie = "opencraft_preview_guest"

func NewPersistentPreview(sim *world.Sim, db *store.Preview, publicOrigin string) *Server {
	s := New(sim, BuildInfo{CommitSHA: "isolated-preview"})
	s.preview = db
	s.previewOrigin = publicOrigin
	s.guests = make(map[string]bool)
	s.previewStop = make(chan struct{})
	return s
}

// ClosePreview cancels hijacked sockets (http.Server.Close does not) and waits
// for their final position saves before the preview's pool is closed.
func (s *Server) ClosePreview() {
	s.guestMu.Lock()
	if s.preview != nil && !s.previewClosing {
		s.previewClosing = true
		close(s.previewStop)
	}
	s.guestMu.Unlock()
	s.previewConnections.Wait()
}

func previewCharacter(g store.Guest) string {
	prefix := "shape-"
	if g.AvatarVersion == 2 {
		prefix = "shape2-"
	}
	return prefix + strconv.FormatUint(uint64(g.Seed), 16)
}
func previewSpawn(welcome []byte) (int16, int16) {
	return int16(binary.LittleEndian.Uint16(welcome[5:7])), int16(binary.LittleEndian.Uint16(welcome[7:9]))
}

func previewJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}

func (s *Server) previewBody(w http.ResponseWriter, r *http.Request, value any) bool {
	// Cookie auth is not CSRF protection on its own. Require JSON and exact
	// same origin for browser writes; non-browser tools must send Origin too.
	u, err := url.Parse(r.Header.Get("Origin"))
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	expected := scheme + "://" + r.Host
	if s.previewOrigin != "" {
		expected = s.previewOrigin
	}
	if err != nil || r.Header.Get("Origin") != expected || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		http.Error(w, "same-origin request required", http.StatusForbidden)
		return false
	}
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
		http.Error(w, "JSON required", http.StatusUnsupportedMediaType)
		return false
	}
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	d.DisallowUnknownFields()
	if d.Decode(value) != nil || d.Decode(new(any)) != io.EOF {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return false
	}
	return true
}

func (s *Server) previewGuest(w http.ResponseWriter, r *http.Request) (store.Guest, bool) {
	cookie, err := r.Cookie(previewCookie)
	if err != nil {
		http.Error(w, "guest required", http.StatusUnauthorized)
		return store.Guest{}, false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	g, err := s.preview.Guest(ctx, cookie.Value)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "guest expired or unavailable", http.StatusUnauthorized)
		return g, false
	}
	if err != nil {
		http.Error(w, "storage unavailable", http.StatusServiceUnavailable)
		return g, false
	}
	return g, true
}

func (s *Server) previewSession(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		if g, ok := s.previewGuest(w, r); ok {
			previewJSON(w, g)
		}
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", 405)
		return
	}
	var body struct {
		Name          string  `json:"name"`
		Seed          *uint32 `json:"seed"`
		AvatarVersion int     `json:"avatarVersion"`
	}
	if !s.previewBody(w, r, &body) {
		return
	}
	if body.AvatarVersion != 2 {
		http.Error(w, "reload to update character recipes", http.StatusUpgradeRequired)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if cookie, err := r.Cookie(previewCookie); err == nil {
		g, err := s.preview.Guest(ctx, cookie.Value)
		if err == nil {
			previewJSON(w, g)
			return
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "storage unavailable", 503)
			return
		}
	}
	name := strings.TrimSpace(body.Name)
	if !utf8.ValidString(name) || strings.ContainsRune(name, 0) || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 24 || body.Seed == nil {
		http.Error(w, "invalid name or seed", 400)
		return
	}
	g, token, err := s.preview.CreateGuest(ctx, name, *body.Seed)
	if err != nil {
		http.Error(w, "guest not saved", 503)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: previewCookie, Value: token, Path: "/", HttpOnly: true, Secure: r.TLS != nil || s.previewOrigin != "", SameSite: http.SameSiteStrictMode, MaxAge: 30 * 24 * 3600})
	previewJSON(w, g)
}

func (s *Server) previewAppearance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	g, ok := s.previewGuest(w, r)
	if !ok {
		return
	}
	var body struct {
		Seed *uint32 `json:"seed"`
		Keep bool    `json:"keep"`
	}
	if !s.previewBody(w, r, &body) {
		return
	}
	if body.Keep == (body.Seed != nil) {
		http.Error(w, "choose keep or seed", http.StatusBadRequest)
		return
	}
	// Reserve this guest just like a connection; no world appearance changes
	// mid-session and no database I/O while holding the shared mutex.
	s.guestMu.Lock()
	if s.previewClosing || s.guests[g.ID] {
		s.guestMu.Unlock()
		http.Error(w, "guest busy", http.StatusConflict)
		return
	}
	s.guests[g.ID] = true
	s.previewConnections.Add(1)
	s.guestMu.Unlock()
	defer s.previewConnections.Done()
	defer func() { s.guestMu.Lock(); delete(s.guests, g.ID); s.guestMu.Unlock() }()
	seed := g.Seed
	if body.Seed != nil {
		seed = *body.Seed
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	g, err := s.preview.ChooseAppearance(ctx, g, seed, body.Keep)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "appearance already fixed", http.StatusConflict)
	} else if err != nil {
		http.Error(w, "appearance not saved", http.StatusServiceUnavailable)
	} else {
		previewJSON(w, g)
	}
}

func (s *Server) previewMessages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", 405)
		return
	}
	g, ok := s.previewGuest(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if r.Method == http.MethodGet {
		parse := func(key string) (int64, error) {
			value := r.URL.Query().Get(key)
			if value == "" {
				return 0, nil
			}
			return strconv.ParseInt(value, 10, 64)
		}
		after, e1 := parse("after")
		before, e2 := parse("before")
		if e1 != nil || e2 != nil || after < 0 || before < 0 || (after > 0 && before > 0) {
			http.Error(w, "invalid cursor", 400)
			return
		}
		list, err := s.preview.Messages(ctx, after, before)
		if err != nil {
			http.Error(w, "history unavailable", 503)
			return
		}
		previewJSON(w, list)
		return
	}
	var body struct {
		RequestID string `json:"requestId"`
		Text      string `json:"text"`
	}
	if !s.previewBody(w, r, &body) {
		return
	}
	text := strings.TrimSpace(body.Text)
	validID := len(body.RequestID) == 32
	for _, c := range body.RequestID {
		if !strings.ContainsRune("0123456789abcdef", c) {
			validID = false
		}
	}
	if !validID || !utf8.ValidString(text) || strings.ContainsRune(text, 0) || utf8.RuneCountInString(text) < 1 || utf8.RuneCountInString(text) > 200 {
		http.Error(w, "invalid message", 400)
		return
	}
	m, err := s.preview.SaveMessage(ctx, g, body.RequestID, text)
	switch {
	case errors.Is(err, store.ErrConflict):
		http.Error(w, "request ID conflict", 409)
	case errors.Is(err, store.ErrRateLimit):
		w.Header().Set("Retry-After", "1")
		http.Error(w, "wait before sending", 429)
	case err != nil:
		http.Error(w, "save not confirmed", 503)
	default:
		previewJSON(w, m)
	}
}
