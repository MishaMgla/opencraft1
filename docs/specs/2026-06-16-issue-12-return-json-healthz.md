# Return JSON from /healthz endpoint

## Goal

Change the `/healthz` liveness endpoint to return a small JSON response while preserving its successful health-check semantics.

## Context

The Go server HTTP mux owns `/healthz`, `/ws`, and static file serving in `internal/server/server.go` (`docs/project-map/server.md`). The existing `/healthz` endpoint is a liveness surface used by deployment and operational checks; issue #12 asks only to change its response format from the plain string `ok` to JSON.

## Requirements

1. A `GET /healthz` request must return HTTP status `200 OK`.
2. The response body must be exactly `{"status":"ok"}`.
3. The response must include `Content-Type: application/json`.
4. The change must be limited to the `/healthz` handler behavior in `internal/server/server.go`.
5. The implementation must not change `/ws`, static file serving, WebSocket origin policy, client behavior, wire protocol messages, or deployment configuration.

## Out of scope

- Adding new health, readiness, or diagnostics endpoints.
- Adding a health response schema beyond the single `status` field.
- Changing client-side code or any binary wire protocol behavior.
- Changing deployment platform configuration.

## Acceptance

1. Running the server and requesting `/healthz` returns status `200 OK`.
2. The `/healthz` response includes `Content-Type: application/json`.
3. The `/healthz` response body is exactly `{"status":"ok"}`.
4. Existing non-health routes continue to behave as before.
