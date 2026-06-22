import { encodeHello, encodeInput, encodePaint, encodeUlt, decodeServer } from './wire.js';
import type { Welcome, Snapshot, Enter, Leave, Pong, Paint, Shake, PlayerState, ServerMsg } from './wire.js';

export interface Handlers {
  welcome?: (m: Welcome) => void;
  snapshot?: (m: Snapshot) => void;
  enter?: (m: Enter) => void;
  leave?: (m: Leave) => void;
  pong?: (m: Pong) => void;
  paint?: (m: Paint) => void;
  shake?: (m: Shake) => void;
  player?: (m: PlayerState) => void;
  close?: () => void;
}

export interface NetControl {
  sendInput(x: number, y: number): void;
  sendPaint(): void;
  sendUlt(): void;
  close(): void;
}

// Opens a WebSocket, sends Hello on open, and dispatches decoded server
// frames to handlers[msg.type]. Returns a small control object.
export function connect(url: string, name: string, role: number, handlers: Handlers): NetControl {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => ws.send(encodeHello(name, role));
  ws.onmessage = (ev) => {
    const msg = decodeServer(new DataView(ev.data));
    const h = handlers[msg.type as Exclude<keyof Handlers, 'close'>];
    if (h) (h as (m: ServerMsg) => void)(msg);
  };
  ws.onclose = () => handlers.close && handlers.close();

  return {
    sendInput(x, y) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeInput(x, y));
    },
    sendPaint() {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodePaint());
    },
    sendUlt() {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeUlt());
    },
    close() {
      ws.close();
    },
  };
}
