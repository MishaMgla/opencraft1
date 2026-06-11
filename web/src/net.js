import { encodeHello, encodeInput, decodeServer } from './wire.js';

// Opens a WebSocket, sends Hello on open, and dispatches decoded server
// frames to handlers[msg.type]. Returns a small control object.
export function connect(url, name, handlers) {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => ws.send(encodeHello(name));
  ws.onmessage = (ev) => {
    const msg = decodeServer(new DataView(ev.data));
    const h = handlers[msg.type];
    if (h) h(msg);
  };
  ws.onclose = () => handlers.close && handlers.close();

  return {
    sendInput(x, y) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeInput(x, y));
    },
    close() {
      ws.close();
    },
  };
}
