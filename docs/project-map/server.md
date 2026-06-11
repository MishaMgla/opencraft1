# server (Go engine)

the authoritative real-time engine. one process, one binary.

## packages
- `cmd/server/main.go` — entrypoint. starts the sim goroutine and the http server (`:8080`), graceful shutdown on SIGINT.
- `internal/wire` — binary protocol. encoders (server→client) + `ParseClient` decoder (client→server). little-endian, int16 positions. **single source of truth for the wire format; `web/src/wire.js` must mirror it byte-for-byte.**
- `internal/world/grid.go` — uniform 16×16 spatial grid (cell 256). `Neighbors` returns the 3×3 area-of-interest.
- `internal/world/sim.go` — the only goroutine that touches world state. 15 Hz tick. owns players, drives join/input/leave/ping via a command channel, emits per-client AoI snapshots + enter/leave events. non-blocking `send` drops oldest frames under backpressure.
- `internal/server/server.go` — http mux: `/` static files (`web/`) + `/ws` upgrade. one reader loop + one writer goroutine per connection; first frame must be Hello.

## sharp edges
- movement is **client-authoritative** (server only clamps to bounds). no anti-cheat yet — by design.
- `InsecureSkipVerify` allows all WS origins for local dev; tighten before any public deploy.
- positions are int16; world is fixed 4096². changing `WorldSize`/`CellSize` must keep `WorldSize % CellSize == 0`.
