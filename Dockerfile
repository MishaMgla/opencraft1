# Build the opencraft1 engine (cmd/server) as a static binary, then run it on a
# minimal image. The client is deployed separately to Vercel, so no web/ assets
# are copied — server.go skips static serving when web/ is absent.
FROM golang:1.25-alpine AS build
WORKDIR /src
ARG RAILWAY_GIT_COMMIT_SHA
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build \
  -ldflags="-X main.commitSHA=${RAILWAY_GIT_COMMIT_SHA:-unknown} -X main.buildTimestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -o /out/server ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/server /app/server
# Railway injects PORT; the engine reads it (default 8080) and listens on all
# interfaces via ":$PORT".
CMD ["/app/server"]
