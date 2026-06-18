import type { VercelRequest, VercelResponse } from '@vercel/node';

// Vercel serverless function. Returns the game server's WebSocket URL to the
// client at runtime, sourced from the WS_URL env var — so the engine
// endpoint can change without a client rebuild and never lives in git.
// Reached via the /config.json rewrite in vercel.json.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ wsUrl: process.env.WS_URL || '' });
}
