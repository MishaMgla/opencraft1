# Add a build/version info endpoint

> **Status:** implemented — historical record of work already merged to `main`. Kept for design rationale; **not** active instructions.

## Goal

Expose the engine build metadata over HTTP so operators can identify what revision is deployed.

## Context

The Go server HTTP mux owns `/healthz`, `/ws`, and static file serving in `internal/server/server.go` (`docs/project-map/server.md`). Issue #13 asks for an HTTP endpoint that reports build metadata, and the author clarified that the endpoint should return the commit SHA and build timestamp.

## Requirements

1. Add a new `GET /version` HTTP endpoint on the Go engine that returns build metadata as JSON.
2. A `GET /version` request must return HTTP status `200 OK`.
3. The response must include `Content-Type: application/json`.
4. The response JSON must contain exactly these top-level fields:
   - `commit_sha`: string
   - `build_timestamp`: string
5. `commit_sha` must report the deployed commit SHA when the binary was built.
6. `build_timestamp` must report the build timestamp for the deployed binary as a string.
7. The endpoint must remain available in the Railway engine image and during local `go run ./cmd/server` development.
8. The implementation must not change `/healthz`, `/ws`, static file serving behavior, WebSocket origin policy, client behavior, wire protocol messages, or simulation behavior.

## Out of scope

- Adding a human version string.
- Adding readiness, diagnostics, dependency, or runtime state data.
- Changing deployment topology or client configuration.
- Changing existing health-check semantics.

## Acceptance

1. Running the server and requesting `GET /version` returns status `200 OK`.
2. The response includes `Content-Type: application/json`.
3. The response body is valid JSON containing `commit_sha` and `build_timestamp` string fields.
4. A deployed Railway build reports the commit SHA and build timestamp for that deployed binary.
5. Existing `/healthz`, `/ws`, and static file routes continue to behave as before.
