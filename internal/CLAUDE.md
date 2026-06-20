# internal

Go authoritative game engine: a single-goroutine world sim behind a WebSocket server, with a binary wire protocol and optional Postgres persistence.

## Public surface
- `server.New(sim, BuildInfo) *Server` → `.Handler() http.Handler` (mux: `/healthz`, `/version`, `/ws`, `/`).
- `world.NewSim(store) *Sim`; `.Run(ctx)` (blocks, run in a goroutine); `.Join/.Input/.Leave/.Ping`; `.Done()`.
- `world.Store` interface (`Load`, `Save`); `world.SavedPlayer`.
- `store.NewPostgres(ctx, dsn) (*Postgres, error)` implements `world.Store`.
- `wire.Encode*` (server→client), `wire.ParseClient` (client→server), `wire.Ent`, type tags.

## Layout
- `world/sim.go` — the sim goroutine: tick loop, command dispatch, persistence orchestration.
- `world/store.go` — `Store` interface + `SavedPlayer`; lives in `world` (not `store`) to avoid import cycle.
- `world/grid.go` — 16×16 spatial grid (cell 256, world 4096); maintained but not yet read by broadcasts.
- `server/server.go` — HTTP mux, WS origin policy, per-conn reader loop + writer goroutine.
- `store/postgres.go` — pgx pool against `public.player_state`.
- `wire/wire.go` — protocol codec; `wire/fixtures_test.go` — golden vector generator.

## Patterns
- All world mutation goes through `Sim.cmds` (buffered chan, cap 1024). No locks; the sim goroutine is the sole owner of `players`/`grid`/`nextID`/`tick`.
- DB I/O never runs on the sim goroutine: `Load` happens in `Join` on the connection goroutine; `Save`/flush copy state into a detached `SavedPlayer` and run in spawned goroutines.
- Positions are `int16` little-endian world units, clamped to `[0, WorldSize-1]`.

## Gotchas
- Single-goroutine ownership: only `Sim.Run` may touch `players`, `grid`, `nextID`, `tick`. Reaching that state from elsewhere = data race; route through a command instead.
- Wire format is byte-for-byte shared with `web/src/wire.ts`; any encode/parse change must match it. Golden vectors live in `web/test/wire_fixtures.json` (consumed by both this package's test and `web/test/wire.test.js`); Go is the source of truth — regenerate with `go test ./internal/wire -update`.
- Origin policy fails open: empty `ALLOWED_ORIGINS` sets `InsecureSkipVerify` and accepts every WS origin (dev only). Set it in any deployed env.
- Persistence is optional: a nil `Store` (no `DATABASE_URL`) means in-memory only — players spawn at center with a derived color and nothing persists; identity is `name` (ids are reassigned per join, no auth).
- Backpressure drops frames, never blocks: `send()` evicts the oldest queued frame when a player's `out` chan (cap 64) is full; snapshots are lossy under a slow client.
- Snapshots are full-world every tick (15 Hz) — every player sees every entity. The grid is inserted/moved/removed but never read for broadcasts, so interest management is not actually in effect.
- `Join` blocks on the `cmds` channel then on a reply; a wedged sim goroutine stalls all new connections.
- Color is stored as Postgres `int4` and round-tripped through `int32`/`uint32` in `store.Load`/`Save`.
- Static client at `/` is only mounted when a `web/` dir exists at runtime (local dev); the engine image omits it and `/` 404s.

## Dependencies
- `github.com/coder/websocket` — WS accept/read/write.
- `github.com/jackc/pgx/v5` (+ `pgxpool`) — Postgres driver/pool.
- Internal: `server`→`world`+`wire`; `world`→`wire`; `store`→`world`.

## Testing
- Build/vet: `go build ./...` · `go vet ./...`
- Test: `go test ./...`
- Regenerate wire golden fixtures: `go test ./internal/wire -update`
