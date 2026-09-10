package server

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"opencraft1/internal/store"
	"opencraft1/internal/wire"
	"opencraft1/internal/world"
)

// Explicit loopback DB only. Leaves three named test guests and a chat record.
func TestMobileSharedWorld(t *testing.T) {
	dsn := os.Getenv("PREVIEW_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("dedicated loopback database not supplied")
	}
	u, err := url.Parse(dsn)
	if err != nil || u.Hostname() != "127.0.0.1" {
		t.Fatal("only loopback database allowed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	db, err := store.OpenPreview(ctx, dsn, "")
	if err != nil {
		t.Fatal(err)
	}
	simCtx, stop := context.WithCancel(context.Background())
	sim := world.NewEmptyPreview()
	go sim.Run(simCtx)
	s := NewPersistentPreview(sim, db, "")
	host := httptest.NewServer(s.Handler())
	t.Cleanup(func() { s.ClosePreview(); host.Close(); stop(); <-sim.Done(); db.Close() })
	request := func(path, cookie string, body any, origin string, want int) ([]byte, string) {
		t.Helper()
		method := http.MethodGet
		var input io.Reader
		if body != nil {
			method = http.MethodPost
			data, _ := json.Marshal(body)
			input = bytes.NewReader(data)
		}
		r, _ := http.NewRequestWithContext(ctx, method, host.URL+path, input)
		r.Header.Set("Origin", origin)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Cookie", cookie)
		response, err := http.DefaultClient.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		data, _ := io.ReadAll(response.Body)
		if response.StatusCode != want {
			t.Fatalf("%s: expected %d, got %d", path, want, response.StatusCode)
		}
		return data, strings.Split(response.Header.Get("Set-Cookie"), ";")[0]
	}
	ticket := func(cookie string) string {
		t.Helper()
		data, _ := request("/evolving-api/socket-ticket", cookie, struct{}{}, host.URL, 200)
		var result struct{ Ticket string }
		if json.Unmarshal(data, &result) != nil || len(result.Ticket) != 64 {
			t.Fatal("invalid ticket response")
		}
		return result.Ticket
	}
	request("/evolving-api/socket-ticket", "", struct{}{}, host.URL, 401)
	request("/evolving-api/socket-ticket", "", nil, host.URL, 405)
	var cookies [3]string
	var guests [3]store.Guest
	for i := range cookies {
		data, cookie := request("/evolving-api/session", "", map[string]any{"name": "Mobile check", "seed": 100 + i, "avatarVersion": 2}, host.URL, 200)
		cookies[i] = cookie
		if json.Unmarshal(data, &guests[i]) != nil {
			t.Fatal("invalid guest")
		}
	}
	request("/evolving-api/socket-ticket", cookies[0], struct{}{}, "https://evil.invalid", 403)
	request("/evolving-api/socket-ticket", cookies[0], struct{}{}, "capacitor://localhost", 403)
	request("/evolving-api/socket-ticket", previewCookie+"=invalid", struct{}{}, host.URL, 401)
	request("/evolving-api/socket-ticket", cookies[0], map[string]bool{"extra": true}, host.URL, 400)
	var connections [3]*websocket.Conn
	var ids [3]uint32
	var usedTicket string
	readType := func(c *websocket.Conn, kind byte) []byte {
		t.Helper()
		for {
			_, data, err := c.Read(ctx)
			if err != nil {
				t.Fatal("expected world frame", err)
			}
			if len(data) > 0 && data[0] == kind {
				return data
			}
		}
	}
	for i, origin := range []string{"capacitor://localhost", "https://localhost", host.URL} {
		path := "/evolving-api/socket?recipes=2"
		opts := &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {origin}}}
		if i == 2 {
			path = "/ws?recipes=2"
			opts.HTTPHeader.Set("Cookie", cookies[i])
		} else {
			key := ticket(cookies[i])
			usedTicket = key
			opts.Subprotocols = []string{mobileTicketPrefix + key}
		}
		c, _, err := websocket.Dial(ctx, host.URL+path, opts)
		if err != nil {
			t.Fatal("shared world connection failed", err)
		}
		t.Cleanup(func() { c.CloseNow() })
		connections[i] = c
		if err := c.Write(ctx, websocket.MessageBinary, []byte{wire.CHello, 1, 'X'}); err != nil {
			t.Fatal(err)
		}
		welcome := readType(c, wire.SWelcome)
		ids[i] = binary.LittleEndian.Uint32(welcome[1:])
	}
	// A consumed ticket is rejected even when another guest's cookie is attached.
	c, response, err := websocket.Dial(ctx, host.URL+"/evolving-api/socket?recipes=2", &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": {"https://localhost"}, "Cookie": {cookies[2]}}, Subprotocols: []string{mobileTicketPrefix + usedTicket},
	})
	if c != nil {
		c.CloseNow()
	}
	if err == nil || response == nil || response.StatusCode != 401 {
		t.Fatal("replayed ticket accepted")
	}
	for _, c := range connections {
		for {
			frame := readType(c, wire.SSnapshot)
			if binary.LittleEndian.Uint16(frame[5:]) == 3 {
				break
			}
		}
	}
	input := []byte{wire.CInput, 0, 0, 0, 0}
	binary.LittleEndian.PutUint16(input[1:], 2800)
	binary.LittleEndian.PutUint16(input[3:], 1900)
	if err := connections[0].Write(ctx, websocket.MessageBinary, input); err != nil {
		t.Fatal(err)
	}
	for {
		frame := readType(connections[2], wire.SSnapshot)
		found := false
		for off := 7; off+8 <= len(frame); off += 8 {
			if binary.LittleEndian.Uint32(frame[off:]) == ids[0] && binary.LittleEndian.Uint16(frame[off+4:]) == 2800 {
				found = true
			}
		}
		if found {
			break
		}
	}
	body := map[string]string{"requestId": strings.Repeat("b", 32), "text": "One world across mobile and web."}
	data, _ := request("/evolving-api/messages", cookies[0], body, host.URL, 200)
	var saved store.Message
	if json.Unmarshal(data, &saved) != nil || saved.PlayerID != guests[0].ID {
		t.Fatal("wrong message author")
	}
	repeat, _ := request("/evolving-api/messages", cookies[0], body, host.URL, 200)
	if !bytes.Equal(data, repeat) {
		t.Fatal("retry duplicated message")
	}
	connections[0].CloseNow()
	for _, cookie := range cookies[1:] {
		data, _ := request("/evolving-api/messages?after=0", cookie, nil, host.URL, 200)
		var history []store.Message
		if json.Unmarshal(data, &history) != nil {
			t.Fatal("invalid history")
		}
		found := false
		for _, record := range history {
			if record.ID == saved.ID {
				found = true
			}
		}
		if !found {
			t.Fatal("other client missed saved message")
		}
	}
	// Rejoining keeps the durable guest, recipe and saved position; only actor ID changes.
	for {
		s.guestMu.Lock()
		_, busy := s.guests[guests[0].ID]
		s.guestMu.Unlock()
		if !busy {
			break
		}
		select {
		case <-ctx.Done():
			t.Fatal("guest never released")
		case <-time.After(10 * time.Millisecond):
		}
	}
	key := ticket(cookies[0])
	rejoined, _, err := websocket.Dial(ctx, host.URL+"/evolving-api/socket?recipes=2", &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {"capacitor://localhost"}}, Subprotocols: []string{mobileTicketPrefix + key}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { rejoined.CloseNow() })
	if err := rejoined.Write(ctx, websocket.MessageBinary, []byte{wire.CHello, 1, 'Y'}); err != nil {
		t.Fatal(err)
	}
	frame := readType(rejoined, wire.SWelcome)
	if binary.LittleEndian.Uint16(frame[5:]) != 2800 {
		t.Fatal("position not restored")
	}
	profile, _ := request("/evolving-api/session", cookies[0], nil, host.URL, 200)
	var restored store.Guest
	if json.Unmarshal(profile, &restored) != nil || restored.ID != guests[0].ID || restored.Seed != guests[0].Seed {
		t.Fatal("guest changed on reconnect")
	}
}
