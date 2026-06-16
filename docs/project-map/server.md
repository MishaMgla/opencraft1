# server (Go engine)

the authoritative real-time engine. one process, one binary.

## packages
- `cmd/server/main.go` — entrypoint. starts the sim goroutine and the http server (listens on `:$PORT`, default `8080`), graceful shutdown on SIGINT/SIGTERM. builds the `/version` payload from ldflags, Go VCS metadata, or local binary timestamp fallback.
- `internal/wire` — binary protocol. encoders (server→client) + `ParseClient` decoder (client→server). little-endian, int16 positions. **single source of truth for the wire format; `web/src/wire.js` must mirror it byte-for-byte.**
- `internal/world/grid.go` — uniform 16×16 spatial grid (cell 256). `Neighbors` returns the 3×3 area-of-interest helper retained for spatial queries.
- `internal/world/sim.go` — the only goroutine that touches world state. 15 Hz tick. owns players, drives join/input/leave/ping via a command channel, emits full-current-map snapshots to every client, sends enter on join and leave on disconnect. non-blocking `send` drops oldest frames under backpressure.
- `internal/server/server.go` — http mux: `/healthz` JSON liveness encoded from a typed response (`{"status":"ok"}`), `/version` build metadata JSON (`commit_sha`, `build_timestamp`), `/ws` upgrade, and `/` static files (`web/`, only when that dir exists — skipped in the Railway image). WS origin policy comes from `ALLOWED_ORIGINS` (allow-all when unset). one reader loop + one writer goroutine per connection; first frame must be Hello.

## sharp edges
- movement is **client-authoritative** (server only clamps to bounds). no anti-cheat yet — by design.
- WS origins are allow-all only when `ALLOWED_ORIGINS` is unset (local dev). In production set it to the Vercel client host(s); see `docs/deploy.md`. The engine is a single stateful process — do **not** run multiple replicas (in-memory world would desync).
- Railway Docker builds stamp `/version.commit_sha` from `RAILWAY_GIT_COMMIT_SHA` and `/version.build_timestamp` from the build stage clock via `go build -ldflags`; local `go run` still serves `/version` using Go VCS metadata when available.
- positions are int16; world is fixed 4096². changing `WorldSize`/`CellSize` must keep `WorldSize % CellSize == 0`.
