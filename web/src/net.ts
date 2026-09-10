import { encodeHello, encodeInput, encodePaint, encodeUlt, encodeJump, encodeBomb, encodeChat, encodeGrab, encodeHold, encodeDrop, decodeServer } from './wire.js';
import type { Welcome, Snapshot, Enter, Leave, Pong, Paint, Shake, PlayerState, Jump, Fire, Bomb, Blast, KO, Respawn, Chat, Critters, ServerMsg } from './wire.js';

export interface Handlers {
  welcome?: (m: Welcome) => void;
  snapshot?: (m: Snapshot) => void;
  enter?: (m: Enter) => void;
  leave?: (m: Leave) => void;
  pong?: (m: Pong) => void;
  paint?: (m: Paint) => void;
  shake?: (m: Shake) => void;
  player?: (m: PlayerState) => void;
  jump?: (m: Jump) => void;
  fire?: (m: Fire) => void;
  bomb?: (m: Bomb) => void;
  blast?: (m: Blast) => void;
  ko?: (m: KO) => void;
  respawn?: (m: Respawn) => void;
  chat?: (m: Chat) => void;
  critters?: (m: Critters) => void;
  close?: () => void;
}

export interface NetControl {
  sendInput(x: number, y: number): void;
  sendPaint(): void;
  sendUlt(): void;
  sendJump(): void;
  sendBomb(): void;
  sendChat(text: string): void;
  sendGrab(critterId: number): void;
  sendHold(x: number, y: number): void;
  sendDrop(x: number, y: number): void;
  close(): void;
}

// Opens a WebSocket, sends Hello on open, and dispatches decoded server
// frames to handlers[msg.type]. Returns a small control object.
export function connect(url: string, name: string, role: number, character: string, handlers: Handlers, protocols?: string[]): NetControl {
  const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => ws.send(encodeHello(name, role, character));
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
    sendJump() {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeJump());
    },
    sendBomb() {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeBomb());
    },
    sendChat(text) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeChat(text));
    },
    sendGrab(critterId) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeGrab(critterId));
    },
    sendHold(x, y) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeHold(x, y));
    },
    sendDrop(x, y) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeDrop(x, y));
    },
    close() {
      ws.close();
    },
  };
}
