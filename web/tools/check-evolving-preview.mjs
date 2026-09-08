// Runnable smoke check for the isolated preview. Requires a built client,
// Node 22.4+ and `go run ./cmd/evolving-preview` (never targets production).
import assert from 'node:assert/strict';
import { decodeServer, encodeHello, encodeInput, encodeChat, encodePaint, encodeUlt, encodeJump, encodeBomb, encodeGrab, encodeHold, encodeDrop } from '../src/wire.js';

const base = new URL(process.argv[2] || 'http://127.0.0.1:8766');
assert.equal(base.hostname, '127.0.0.1', 'only a loopback preview may be checked');
assert.equal(base.protocol, 'http:');
const info = await fetch(new URL('/preview-info', base));
const mode = await info.json();
assert.equal(mode.mode, 'evolving-preview', 'refusing a legacy server');
assert.equal(mode.persistent, false, 'this check targets the memory-only mode; use check-evolving-persistence.mjs for durable mode');
const denied = await fetch(new URL('/ws?recipes=2', base), { headers: { Origin: 'https://example.invalid' } });
assert.equal(denied.status, 403, 'cross-origin access must be rejected');
assert.equal((await fetch(new URL('/.env', base))).status, 404, 'repository files must not be served');

const clients = [];
function client(name, shape) {
  const socket = new WebSocket(`ws://${base.host}/ws?recipes=2`);
  socket.binaryType = 'arraybuffer';
  const messages = [];
  const observers = new Set();
  socket.addEventListener('open', () => socket.send(encodeHello(name, 1, shape)));
  socket.addEventListener('message', event => {
    const message = decodeServer(new DataView(event.data));
    messages.push(message);
    for (const observe of observers) observe(message);
  });
  const result = {
    socket, messages,
    wait(predicate) {
      const found = messages.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const observe = message => {
          if (!predicate(message)) return;
          clearTimeout(timeout); observers.delete(observe); resolve(message);
        };
        const timeout = setTimeout(() => { observers.delete(observe); reject(new Error(`No expected message for ${name}`)); }, 4000);
        observers.add(observe);
      });
    },
  };
  clients.push(result);
  return result;
}

try {
  const a = client('preview-check-a', 'shape2-abc123');
  const aw = await a.wait(m => m.type === 'welcome');
  const b = client('preview-check-b', 'invalid-shape');
  const bw = await b.wait(m => m.type === 'welcome');
  const enter = await b.wait(m => m.type === 'enter' && m.id === aw.id);
  assert.equal(enter.character, 'shape2-abc123');
  assert.equal((await b.wait(m => m.type === 'player' && m.id === bw.id)).character, 'shape-1');
  assert.notEqual(aw.x, bw.x, 'new visitors should not all overlap');

  // A legacy landmark occupies this point. Empty preview must have no invisible wall.
  a.socket.send(encodeInput(2048, 1792));
  await b.wait(m => m.type === 'snapshot' && m.ents.some(p => p.id === aw.id && p.x === 2048 && p.y === 1792));
  for (const frame of [encodePaint(), encodeUlt(), encodeJump(), encodeBomb(), encodeGrab(1), encodeHold(2048, 1792), encodeDrop(2048, 1792)]) a.socket.send(frame);
  const text = 'Проверка общей пустоты';
  a.socket.send(encodeChat(text)); // server-order barrier after the forbidden actions
  await Promise.all([a.wait(m => m.type === 'chat' && m.text === text), b.wait(m => m.type === 'chat' && m.text === text)]);
  const forbidden = new Set(['paint', 'jump', 'bomb', 'blast', 'fire', 'shake', 'ko', 'respawn']);
  for (const c of clients) {
    assert.equal(c.messages.some(m => forbidden.has(m.type)), false, 'legacy action leaked into the preview');
    assert.equal(c.messages.some(m => m.type === 'critters' && m.ents.length), false);
  }
  a.socket.close();
  await b.wait(m => m.type === 'leave' && m.id === aw.id);
  console.log('PASS: isolated endpoint, two players, shape validation, movement through old landmarks, chat, disabled legacy actions, leave.');
} finally {
  for (const c of clients) c.socket.close();
}
