// Resolves the game server's WebSocket URL.
//
// In a split deployment the static client (Vercel) and the engine (Railway) run
// on different origins, so the client fetches /config.json — served by a Vercel
// function from the WS_URL env var — to learn the wss:// endpoint.
//
// Locally the Go server serves both halves and there is no /config.json, so any
// failure (404, network error, bad JSON, missing field) falls back to the same
// origin. That keeps local dev zero-config and the e2e smoke test unchanged.
export async function resolveWsUrl() {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && typeof cfg.wsUrl === 'string' && cfg.wsUrl) {
        return cfg.wsUrl;
      }
    }
  } catch {
    // fall through to the same-origin default
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}
