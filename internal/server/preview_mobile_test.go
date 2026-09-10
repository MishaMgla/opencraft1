package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestMobileTickets(t *testing.T) {
	s := &Server{}
	now := time.Now()
	first, ok := s.issueMobileTicket("guest-a", now)
	if !ok || len(first) != 64 {
		t.Fatal("ticket not issued")
	}
	second, _ := s.issueMobileTicket("guest-a", now)
	if _, ok := s.consumeMobileTicket(first, now); ok {
		t.Fatal("a new ticket must invalidate the previous ticket")
	}
	var accepted atomic.Int32
	var wg sync.WaitGroup
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if cookie, ok := s.consumeMobileTicket(second, now); ok {
				if cookie != "guest-a" {
					t.Error("wrong guest")
				}
				accepted.Add(1)
			}
		}()
	}
	wg.Wait()
	if accepted.Load() != 1 {
		t.Fatal("ticket must be usable exactly once")
	}
	expired, _ := s.issueMobileTicket("guest-b", now)
	if _, ok := s.consumeMobileTicket(expired, now.Add(30*time.Second)); ok {
		t.Fatal("expired ticket accepted")
	}
	for i := range mobileTicketLimit {
		s.mobileTickets[string(rune(i))] = mobileTicket{cookie: "other", expires: now.Add(time.Second)}
	}
	if _, ok := s.issueMobileTicket("guest-c", now); ok {
		t.Fatal("unbounded tickets")
	}
	if _, ok := s.issueMobileTicket("guest-c", now.Add(time.Second)); !ok {
		t.Fatal("expired entries must be reclaimed")
	}
	s.previewClosing = true
	if _, ok := s.issueMobileTicket("guest-c", now); ok {
		t.Fatal("issued while stopping")
	}
}

func TestMobileSocketAdmission(t *testing.T) {
	s := &Server{}
	for _, tc := range []struct {
		method, path, origin, protocol string
		want                           int
	}{
		{"POST", "/evolving-api/socket?recipes=2", "https://localhost", "", 405},
		{"GET", "/evolving-api/socket", "https://localhost", "", 426},
		{"GET", "/evolving-api/socket?recipes=2", "https://evil.invalid", "", 403},
		{"GET", "/evolving-api/socket?recipes=2", "", "", 403},
		{"GET", "/evolving-api/socket?recipes=2", "capacitor://localhost", "", 401},
		{"GET", "/evolving-api/socket?recipes=2", "https://localhost", mobileTicketPrefix + strings.Repeat("0", 64), 401},
	} {
		r := httptest.NewRequest(tc.method, tc.path, nil)
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Sec-WebSocket-Protocol", tc.protocol)
		w := httptest.NewRecorder()
		s.previewMobileSocket(w, r)
		if w.Code != tc.want {
			t.Errorf("%+v: got %d", tc, w.Code)
		}
	}
	// Invalid origin must not burn an otherwise valid ticket.
	key, _ := s.issueMobileTicket("guest", time.Now())
	r := httptest.NewRequest(http.MethodGet, "/evolving-api/socket?recipes=2", nil)
	r.Header.Set("Origin", "https://localhost.evil.invalid")
	r.Header.Set("Sec-WebSocket-Protocol", mobileTicketPrefix+key)
	w := httptest.NewRecorder()
	s.previewMobileSocket(w, r)
	if _, ok := s.consumeMobileTicket(key, time.Now()); !ok {
		t.Fatal("invalid origin consumed the ticket")
	}
}
