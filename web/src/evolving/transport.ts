// The native shell supplies this adapter before loading the unchanged game.
// Browser requests remain same-origin, with the existing HttpOnly cookie.
export interface NativeWorld {
  request(path: string, body?: unknown): Promise<unknown>;
  socket(): Promise<{ url: string; protocols: string[] }>;
}
declare global {
  interface Window { opencraftNative?: NativeWorld }
}

export function isNativeWorld() { return !!window.opencraftNative; }

export async function worldRequest(path: string, body?: unknown): Promise<any> {
  if (window.opencraftNative) return window.opencraftNative.request(path, body);
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

export async function worldSocket(): Promise<{ url: string; protocols?: string[] }> {
  if (window.opencraftNative) return window.opencraftNative.socket();
  return { url: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?recipes=2` };
}
